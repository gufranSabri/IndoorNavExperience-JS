import * as THREE from '../vendor/three.module.js';

const DEG = Math.PI / 180;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}


// Places a camera at `distance` from a ground point, looking at it, rotated
// by `bearing` and tilted by `pitch`. Shared by the controls and by the
// "what distance fits this box" search.
export function applyPose(camera, x, z, distance, bearing, pitch) {
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sb = Math.sin(bearing);
  const cb = Math.cos(bearing);
  camera.position.set(x + distance * sp * sb, distance * cp, z + distance * sp * cb);
  // "Up" on screen is the horizontal direction away from the camera, which
  // stays well-defined even when looking straight down.
  camera.up.set(-sb, 0, -cb);
  camera.lookAt(x, 0, z);
  camera.near = Math.max(0.3, distance * 0.06);
  camera.far = distance * 12 + 400;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

const _fitPoint = new THREE.Vector3();

// Smallest camera distance at which every point in `points` (THREE.Vector3[])
// fits inside the view with `padding` (fraction of the half-viewport) to
// spare. `extent` is the share of the viewport actually free of UI (see
// SatelliteView's insets). Binary search over the same camera model the
// controls use.
export function fitDistanceForPoints(camera, points, center, bearing, pitch, padding = 0.12, extent = { x: 1, y: 1 }) {
  const probe = camera.clone();
  probe.clearViewOffset();
  let lo = 2;
  let hi = 4000;
  const limitX = (1 - padding) * extent.x;
  const limitY = (1 - padding) * extent.y;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    applyPose(probe, center.x, center.z, mid, bearing, pitch);
    let worst = 0;
    for (const p of points) {
      _fitPoint.copy(p).project(probe);
      worst = Math.max(worst, Math.abs(_fitPoint.x) / limitX, Math.abs(_fitPoint.y) / limitY);
    }
    if (worst > 1) lo = mid;
    else hi = mid;
  }
  return hi;
}

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Map-style camera, modelled on how OpenStreetMap / MapLibre behave:
 *
 *   drag ............... pan (the point under the cursor stays under it), with inertia
 *   wheel / pinch ...... zoom toward the cursor, eased
 *   right-drag ......... rotate (horizontal) and tilt (vertical); so does ctrl/alt/cmd + drag
 *   two fingers ........ pinch-zoom + rotate + pan around their midpoint; drag both up/down to tilt
 *   double click/tap ... zoom in (shift: out)
 *   arrows, + / - ...... keyboard pan / zoom; shift + arrows rotate / tilt
 *
 * The camera is described by a ground point it looks at (`target`), a
 * `distance` to it, a `bearing` (rotation about the vertical axis; 0 = north
 * up) and a `pitch` (0 = straight down).
 */
export class MapControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();
    this.distance = 100;
    this.targetDistance = 100;
    this.bearing = 0;
    this.pitch = 50 * DEG;

    this.minDistance = options.minDistance ?? 7;
    this.maxDistance = options.maxDistance ?? 400;
    this.maxPitch = (options.maxPitch ?? 68) * DEG;
    this.bounds = null; // THREE.Box3 the target is kept inside
    this.onChange = options.onChange || null;
    this.onInteract = options.onInteract || null; // any user gesture began
    this.onHover = options.onHover || null; // (clientX, clientY) | null
    this.onTap = options.onTap || null; // (clientX, clientY)

    this.enabled = true;
    this.interacting = false;

    this._pointers = new Map();
    this._mode = null; // 'pan' | 'rotate' | 'gesture'
    this._dragAnchor = new THREE.Vector3();
    this._hasDragAnchor = false;
    this._zoomAnchor = null; // { world: Vector3, ndc: Vector2 }
    this._anim = null;
    this._inertia = new THREE.Vector3();
    this._lastMoveTime = 0;
    this._lastTap = null;
    this._gesture = null;
    this._gestureDirty = false;
    this._followTarget = null;
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();

    this._bind();
    this._apply();
  }

  // ---- public API -----------------------------------------------------

  setBounds(box, { minDistance, maxDistance } = {}) {
    this.bounds = box.clone();
    if (minDistance) this.minDistance = minDistance;
    if (maxDistance) this.maxDistance = maxDistance;
  }

  set({ x, z, distance, bearing, pitch } = {}) {
    if (x !== undefined) this.target.x = x;
    if (z !== undefined) this.target.z = z;
    if (distance !== undefined) this.distance = this.targetDistance = this._clampDistance(distance);
    if (bearing !== undefined) this.bearing = bearing;
    if (pitch !== undefined) this.pitch = clamp(pitch, 0, this.maxPitch);
    this._anim = null;
    this._apply();
  }

  // Where the camera is heading (the end of a running flight) or, when idle, where it is.
  get goal() {
    if (this._anim) return { ...this._anim.to };
    return { x: this.target.x, z: this.target.z, distance: this.targetDistance, bearing: this.bearing, pitch: this.pitch };
  }

  flyTo({ x, z, distance, bearing, pitch }, duration = 1.1) {
    this._zoomAnchor = null;
    this._inertia.set(0, 0, 0);
    const goal = this.goal; // unspecified parts continue toward an in-flight destination
    const to = {
      x: x ?? goal.x,
      z: z ?? goal.z,
      distance: this._clampDistance(distance ?? goal.distance),
      bearing: bearing === undefined ? goal.bearing : this.bearing + shortestAngle(this.bearing, bearing),
      pitch: clamp(pitch ?? goal.pitch, 0, this.maxPitch),
    };
    this._anim = {
      t: 0,
      duration: Math.max(0.01, duration),
      from: { x: this.target.x, z: this.target.z, distance: this.distance, bearing: this.bearing, pitch: this.pitch },
      to,
    };
  }

  zoomBy(factor, ndc = null, animated = true) {
    this._cancelAnimation();
    const anchorNdc = ndc || this._ndc.set(0, 0);
    const world = this.groundAt(anchorNdc.x, anchorNdc.y, new THREE.Vector3());
    this._zoomAnchor = world ? { world, ndc: anchorNdc.clone() } : null;
    this.targetDistance = this._clampDistance(this.targetDistance * factor);
    if (!animated) {
      this.distance = this.targetDistance;
      this._apply();
      this._holdAnchor();
      this._zoomAnchor = null;
    }
  }

  resetNorth(duration = 0.7) {
    this.flyTo({ bearing: 0 }, duration);
  }

  toggleTilt(tiltedPitch) {
    const flat = this.pitch > 12 * DEG;
    this.flyTo({ pitch: flat ? 0 : tiltedPitch }, 0.8);
  }

  // Gently steers the view toward a moving point (used while previewing a
  // route). Any user gesture cancels it.
  follow(point) {
    this._followTarget = point ? { x: point.x, z: point.z } : null;
  }

  // Ground-plane (y = 0) point under a normalized-device-coordinate position.
  groundAt(ndcX, ndcY, out) {
    this.camera.updateMatrixWorld();
    _origin.setFromMatrixPosition(this.camera.matrixWorld);
    _dir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(_origin).normalize();
    if (_dir.y > -1e-3) return null;
    const t = -_origin.y / _dir.y;
    return out.copy(_origin).addScaledVector(_dir, t);
  }

  // ---- per-frame ------------------------------------------------------

  update(dt) {
    let dirty = false;

    if (this._gestureDirty) {
      this._gestureDirty = false;
      if (this._mode === 'gesture' && this._pointers.size === 2) this._updateGesture();
    }

    if (this._anim) {
      const a = this._anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const k = easeInOutCubic(a.t);
      this.target.x = a.from.x + (a.to.x - a.from.x) * k;
      this.target.z = a.from.z + (a.to.z - a.from.z) * k;
      this.distance = Math.exp(Math.log(a.from.distance) + (Math.log(a.to.distance) - Math.log(a.from.distance)) * k);
      this.targetDistance = this.distance;
      this.bearing = a.from.bearing + (a.to.bearing - a.from.bearing) * k;
      this.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * k;
      if (a.t >= 1) this._anim = null;
      dirty = true;
    } else {
      if (Math.abs(this.targetDistance - this.distance) > this.distance * 1e-4) {
        this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-dt * 13));
        dirty = true;
        this._apply();
        this._holdAnchor();
      } else if (this._zoomAnchor) {
        this.distance = this.targetDistance;
        this._zoomAnchor = null;
        dirty = true;
      }

      if (this._inertia.lengthSq() > 1e-6 && !this._pointers.size) {
        this.target.addScaledVector(this._inertia, dt);
        this._inertia.multiplyScalar(Math.exp(-dt * 4.2));
        if (this._inertia.lengthSq() < 0.0025) this._inertia.set(0, 0, 0);
        this._clampTarget();
        dirty = true;
      }

      if (this._followTarget && !this.interacting) {
        const k = 1 - Math.exp(-dt * 2.4);
        this.target.x += (this._followTarget.x - this.target.x) * k;
        this.target.z += (this._followTarget.z - this.target.z) * k;
        dirty = true;
      }
    }

    if (dirty) this._apply();
  }

  // ---- camera math ----------------------------------------------------

  _clampDistance(d) {
    return clamp(d, this.minDistance, this.maxDistance);
  }

  _clampTarget() {
    if (!this.bounds) return;
    this.target.x = clamp(this.target.x, this.bounds.min.x, this.bounds.max.x);
    this.target.z = clamp(this.target.z, this.bounds.min.z, this.bounds.max.z);
  }

  _apply() {
    this._clampTarget();
    applyPose(this.camera, this.target.x, this.target.z, this.distance, this.bearing, this.pitch);
    if (this.onChange) this.onChange();
  }

  // Shifts the target so the anchored ground point sits under its cursor
  // position again — the trick that makes zoom / rotate feel "pinned".
  _holdAnchor(anchor = this._zoomAnchor) {
    if (!anchor) return;
    const p = this.groundAt(anchor.ndc.x, anchor.ndc.y, this._tmp);
    if (!p) return;
    this.target.x += anchor.world.x - p.x;
    this.target.z += anchor.world.z - p.z;
    this._apply();
  }

  _cancelAnimation() {
    this._anim = null;
  }

  _toNdc(clientX, clientY, out = this._ndc) {
    const rect = this.domElement.getBoundingClientRect();
    return out.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  // ---- input ----------------------------------------------------------

  _bind() {
    const el = this.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    el.tabIndex = 0;
    el.style.outline = 'none';

    this._handlers = {
      pointerdown: (e) => this._onPointerDown(e),
      pointermove: (e) => this._onPointerMove(e),
      pointerup: (e) => this._onPointerUp(e),
      pointercancel: (e) => this._onPointerUp(e),
      pointerleave: () => this.onHover && !this._pointers.size && this.onHover(null),
      wheel: (e) => this._onWheel(e),
      contextmenu: (e) => e.preventDefault(),
      keydown: (e) => this._onKeyDown(e),
    };
    for (const [type, fn] of Object.entries(this._handlers)) {
      el.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
    }
  }

  dispose() {
    for (const [type, fn] of Object.entries(this._handlers)) this.domElement.removeEventListener(type, fn);
  }

  _beginInteraction() {
    this._cancelAnimation();
    this._followTarget = null;
    this._zoomAnchor = null;
    this.targetDistance = this.distance;
    this._inertia.set(0, 0, 0);
    this.interacting = true;
    if (this.onInteract) this.onInteract();
  }

  _onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 100;
    const k = e.ctrlKey ? 0.011 : 0.0017; // ctrl = trackpad pinch, which sends small deltas
    this._followTarget = null;
    if (this.onInteract) this.onInteract();
    const ndc = this._toNdc(e.clientX, e.clientY, new THREE.Vector2());
    this.zoomBy(Math.exp(clamp(dy, -240, 240) * k), ndc);
  }

  _onPointerDown(e) {
    if (!this.enabled) return;
    this.domElement.focus({ preventScroll: true });
    this.domElement.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    this._beginInteraction();

    if (this._pointers.size === 1) {
      const rotate = e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || (e.button === 0 && (e.ctrlKey || e.altKey || e.metaKey)));
      this._mode = rotate ? 'rotate' : 'pan';
      this.domElement.style.cursor = rotate ? 'move' : 'grabbing';
      if (!rotate) this._startPan(e.clientX, e.clientY);
    } else if (this._pointers.size === 2) {
      this._mode = 'gesture';
      this._gesture = this._readGesture();
    }
  }

  _startPan(clientX, clientY) {
    const ndc = this._toNdc(clientX, clientY);
    this._hasDragAnchor = !!this.groundAt(ndc.x, ndc.y, this._dragAnchor);
    this._panVelocity = new THREE.Vector3();
    this._lastMoveTime = performance.now();
  }

  _onPointerMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && this.onHover) this.onHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this._mode === 'pan' && this._pointers.size === 1) {
      if (!this._hasDragAnchor) return;
      const before = this._tmp.copy(this.target);
      const ndc = this._toNdc(e.clientX, e.clientY);
      const now = new THREE.Vector3();
      if (this.groundAt(ndc.x, ndc.y, now)) {
        this.target.x += this._dragAnchor.x - now.x;
        this.target.z += this._dragAnchor.z - now.z;
        this._apply();
        const t = performance.now();
        const dt = Math.max(1, t - this._lastMoveTime) / 1000;
        const vx = (this.target.x - before.x) / dt;
        const vz = (this.target.z - before.z) / dt;
        this._panVelocity.x += (vx - this._panVelocity.x) * 0.5;
        this._panVelocity.z += (vz - this._panVelocity.z) * 0.5;
        this._lastMoveTime = t;
      }
    } else if (this._mode === 'rotate') {
      this.bearing += dx * 0.0085;
      this.pitch = clamp(this.pitch - dy * 0.007, 0, this.maxPitch);
      this._apply();
    } else if (this._mode === 'gesture' && this._pointers.size === 2) {
      // Fingers report their moves separately; judging pinch / rotate / tilt from
      // one finger's move at a time would misread a parallel drag, so the
      // gesture is evaluated once per frame with both fingers' latest positions.
      this._gestureDirty = true;
    }
  }

  _readGesture() {
    const [a, b] = [...this._pointers.values()];
    return {
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  _updateGesture() {
    const prev = this._gesture;
    const cur = this._readGesture();
    const prevNdc = this._toNdc(prev.mx, prev.my, new THREE.Vector2());
    const anchorWorld = this.groundAt(prevNdc.x, prevNdc.y, new THREE.Vector3());

    const dDist = cur.dist - prev.dist;
    const dAngle = shortestAngle(prev.angle, cur.angle);
    const dMy = cur.my - prev.my;
    const dMx = cur.mx - prev.mx;
    const tilting = Math.abs(dDist) < 3 && Math.abs(dAngle) < 0.03 && Math.abs(dMy) > Math.abs(dMx) && Math.abs(dMy) > 0.5;

    if (tilting) {
      this.pitch = clamp(this.pitch - dMy * 0.006, 0, this.maxPitch);
      this._apply();
    } else {
      this.distance = this.targetDistance = this._clampDistance(this.distance * (prev.dist / cur.dist));
      this.bearing += dAngle;
      this._apply();
      if (anchorWorld) {
        const curNdc = this._toNdc(cur.mx, cur.my, new THREE.Vector2());
        this._holdAnchor({ world: anchorWorld, ndc: curNdc });
      }
    }
    this._gesture = cur;
  }

  _onPointerUp(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    this._pointers.delete(e.pointerId);
    this.domElement.releasePointerCapture?.(e.pointerId);

    if (this._pointers.size === 0) {
      this.interacting = false;
      this.domElement.style.cursor = 'grab';
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      const held = performance.now() - p.t;
      const wasTap = e.type === 'pointerup' && this._mode !== 'gesture' && moved < 6 && held < 450;

      if (this._mode === 'pan' && !wasTap && performance.now() - this._lastMoveTime < 70) {
        const v = this._panVelocity;
        if (v.lengthSq() > 4) this._inertia.set(v.x, 0, v.z);
      }
      if (wasTap) this._handleTap(e);
      this._mode = null;
    } else if (this._pointers.size === 1) {
      // Lifted one finger of a two-finger gesture: carry on panning with the other.
      const [remaining] = this._pointers.values();
      this._mode = 'pan';
      this._startPan(remaining.x, remaining.y);
    }
  }

  _handleTap(e) {
    const now = performance.now();
    const last = this._lastTap;
    if (last && now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
      this._lastTap = null;
      const ndc = this._toNdc(e.clientX, e.clientY, new THREE.Vector2());
      this.zoomBy(e.shiftKey ? 2 : 0.5, ndc);
      return;
    }
    this._lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (this.onTap) this.onTap(e.clientX, e.clientY);
  }

  _onKeyDown(e) {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = this.distance * 0.22;
    const right = new THREE.Vector3(Math.cos(this.bearing), 0, -Math.sin(this.bearing));
    const forward = new THREE.Vector3(-Math.sin(this.bearing), 0, -Math.cos(this.bearing));
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        if (e.shiftKey) this.flyTo({ bearing: this.bearing - 15 * DEG }, 0.25);
        else this.flyTo({ x: this.target.x - right.x * step, z: this.target.z - right.z * step }, 0.25);
        break;
      case 'ArrowRight':
        if (e.shiftKey) this.flyTo({ bearing: this.bearing + 15 * DEG }, 0.25);
        else this.flyTo({ x: this.target.x + right.x * step, z: this.target.z + right.z * step }, 0.25);
        break;
      case 'ArrowUp':
        if (e.shiftKey) this.flyTo({ pitch: this.pitch + 8 * DEG }, 0.25);
        else this.flyTo({ x: this.target.x + forward.x * step, z: this.target.z + forward.z * step }, 0.25);
        break;
      case 'ArrowDown':
        if (e.shiftKey) this.flyTo({ pitch: this.pitch - 8 * DEG }, 0.25);
        else this.flyTo({ x: this.target.x - forward.x * step, z: this.target.z - forward.z * step }, 0.25);
        break;
      case '+':
      case '=':
        this.zoomBy(0.7);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / 0.7);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      this._followTarget = null;
      if (this.onInteract) this.onInteract();
    }
  }
}
