import * as THREE from '../vendor/three.module.js';
import {
  ROUTE_WORLD_WIDTH,
  ROUTE_MIN_PX,
  ROUTE_MAX_PX,
  ROUTE_CORNER_RADIUS,
  ROUTE_DRAW_MPS,
} from './constants.js';

const MAX_HALF_LINE = 1.0; // meters; caps the line width when zoomed far out
const HALO = 1.9; // glow extends this many line-half-widths from the centerline
const RIBBON_HALF = MAX_HALF_LINE * HALO + 0.1; // geometry half-width; the shader trims it
const SAMPLE_STEP = 0.22; // meters between ribbon cross-sections

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const vertexShader = /* glsl */ `
  attribute float aDist;
  attribute float aSide;
  varying float vDist;
  varying float vSide;
  void main() {
    vDist = aDist;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Everything is measured in meters along / across the route so the line,
// its border, glow, rounded ends and chevrons all scale together.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uProgress;
  uniform float uLength;
  uniform float uHalf;
  uniform vec3 uBody;
  uniform vec3 uCenter;
  uniform vec3 uEdge;
  uniform vec3 uTraveled;
  varying float vDist;
  varying float vSide;

  void main() {
    float head = min(uReveal, uLength);
    float dx = vDist < 0.0 ? vDist : (vDist > head ? vDist - head : 0.0);
    float r = length(vec2(dx, vSide));      // meters from the drawn centerline
    float halo = uHalf * ${HALO.toFixed(1)};
    if (r > halo) discard;

    float aa = max(fwidth(r), 1e-4);
    float line = 1.0 - smoothstep(uHalf - aa, uHalf + aa, r);
    float border = smoothstep(uHalf * 0.74 - aa, uHalf * 0.74 + aa, r);

    vec3 body = mix(uCenter, uBody, smoothstep(0.0, uHalf * 0.74, r));
    vec3 col = mix(body, uEdge, border);

    // Already-walked part fades to a quiet blue-gray, like Google Maps.
    float behind = 1.0 - smoothstep(uProgress - 0.35, uProgress + 0.35, vDist);
    col = mix(col, uTraveled, behind * 0.85);

    // White chevrons flowing in the direction of travel.
    float period = uHalf * 4.6;
    float u = (vDist - uTime * uHalf * 3.0) / period;
    float x = fract(u) - 0.5;
    float ay = abs(vSide) / uHalf;
    float cx = 0.12 - ay * 0.2;
    float aaX = max(fwidth(u), 1e-4); // from the continuous u, not fract(u), or the wrap seam blurs
    float chev = 1.0 - smoothstep(0.05 - aaX, 0.05 + aaX, abs(x - cx));
    chev *= 1.0 - smoothstep(0.52, 0.64, ay);
    float ahead = smoothstep(uProgress + 0.4, uProgress + 1.2, vDist);
    float nearHead = 1.0 - smoothstep(head - period * 0.6, head - period * 0.15, vDist);
    chev *= ahead * nearHead * step(0.0, vDist);
    col = mix(col, vec3(1.0), chev * 0.92 * line);

    // Bright tip while the line is still being drawn on.
    float drawing = 1.0 - step(uLength - 0.01, uReveal);
    float tip = exp(-pow((vDist - head) / (uHalf * 2.4), 2.0)) * drawing;
    col += vec3(0.35, 0.45, 0.6) * tip * line;

    float haloA = pow(1.0 - smoothstep(uHalf, halo, r), 2.2) * 0.34 * (1.0 - behind * 0.7);
    float a = line * (1.0 - behind * 0.28) + (1.0 - line) * haloA;
    vec3 rgb = (col * line + uBody * haloA * (1.0 - line)) / max(line + (1.0 - line) * haloA, 1e-4);
    gl_FragColor = vec4(rgb, a);
    #include <colorspace_fragment>
  }
`;

// Rounds every corner of a polyline with a quadratic curve, then resamples
// the result at an even spacing.
function smoothPath(points, radius, step) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 0.05);
  if (pts.length < 2) return pts;

  const rounded = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i - 1];
    const V = pts[i];
    const N = pts[i + 1];
    const l1 = Math.hypot(V.x - P.x, V.z - P.z);
    const l2 = Math.hypot(N.x - V.x, N.z - V.z);
    const c = Math.min(radius, l1 * 0.5, l2 * 0.5);
    const A = { x: V.x + ((P.x - V.x) / l1) * c, z: V.z + ((P.z - V.z) / l1) * c };
    const B = { x: V.x + ((N.x - V.x) / l2) * c, z: V.z + ((N.z - V.z) / l2) * c };
    const segments = 12;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const u = 1 - t;
      rounded.push({
        x: u * u * A.x + 2 * u * t * V.x + t * t * B.x,
        z: u * u * A.z + 2 * u * t * V.z + t * t * B.z,
      });
    }
  }
  rounded.push(pts[pts.length - 1]);

  const cum = [0];
  for (let i = 1; i < rounded.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(rounded[i].x - rounded[i - 1].x, rounded[i].z - rounded[i - 1].z));
  }
  const total = cum[cum.length - 1];
  const count = Math.max(2, Math.ceil(total / step) + 1);
  const out = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / (count - 1);
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const f = (d - cum[seg - 1]) / (cum[seg] - cum[seg - 1] || 1);
    const a = rounded[seg - 1];
    const b = rounded[seg];
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return out;
}

/**
 * The wayfinding route: a thick blue ribbon lying on the floor, drawn on with
 * an animation, with chevrons flowing along it and the already-walked part
 * greyed out. Also the source of truth for "where is the user" — it can
 * report the position / heading at any distance along the line.
 */
export class RouteRenderer {
  constructor(scene, { y = 0 } = {}) {
    this.scene = scene;
    this.y = y;
    this.mesh = null;
    this.samples = [];
    this.cum = [];
    this.length = 0;
    this.reveal = 0;
    this.revealClock = 0;
    this.time = 0;

    const color = (hex) => new THREE.Color(hex);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uProgress: { value: 0 },
        uLength: { value: 1 },
        uHalf: { value: 0.7 },
        uBody: { value: color('#4285f4') },
        uCenter: { value: color('#6aa4ff') },
        uEdge: { value: color('#1b57c9') },
        uTraveled: { value: color('#8395b5') },
      },
    });
  }

  get hasRoute() {
    return this.samples.length > 1;
  }

  // `heightAt(x, z)` gives the walking surface height, so the line can follow stairs down.
  setPoints(points, heightAt = null) {
    this.clear();
    const samples = smoothPath(points, ROUTE_CORNER_RADIUS, SAMPLE_STEP);
    if (samples.length < 2) return;
    this.samples = samples;
    this.cum = [0];
    for (let i = 1; i < samples.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
    }
    this.length = this.cum[this.cum.length - 1];

    // Tangents, and the radius of curvature at each sample. Where the path
    // bends tighter than the ribbon is wide, the inner edge would fold over
    // itself, so the inner half-width is clamped to the local radius.
    const n = samples.length;
    const tangents = samples.map((_, i) => {
      const a = samples[Math.max(0, i - 1)];
      const b = samples[Math.min(n - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    });
    const rawRadius = samples.map((_, i) => {
      if (i === 0 || i === n - 1) return Infinity;
      const a = samples[i - 1];
      const b = samples[i];
      const c = samples[i + 1];
      const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      const denom = Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z) * Math.hypot(c.x - a.x, c.z - a.z);
      return Math.abs(cross) < 1e-9 ? Infinity : denom / (2 * Math.abs(cross));
    });
    const turn = samples.map((_, i) => {
      if (i === 0 || i === n - 1) return 0;
      const a = samples[i - 1];
      const b = samples[i];
      const c = samples[i + 1];
      return (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    });
    const radius = rawRadius.map((_, i) => {
      let r = Infinity;
      for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) r = Math.min(r, rawRadius[k]);
      return r;
    });

    // Two cross-sections per sample, plus an extra pair at each end so the
    // shader has room to draw round caps. `aSide` stores the signed offset
    // actually used, so the shader's distance-from-centerline stays true.
    const positions = [];
    const dists = [];
    const sides = [];
    const indices = [];
    const lift = 0.05;
    const push = (p, tx, tz, dist, leftHalf, rightHalf) => {
      const nx = -tz;
      const nz = tx;
      // One height per cross-section (taken on the centerline), so the ribbon
      // stays level across its width even where its edges overhang a stairwell.
      const y = heightAt ? heightAt(p.x, p.z) + lift : this.y;
      positions.push(p.x + nx * leftHalf, y, p.z + nz * leftHalf, p.x - nx * rightHalf, y, p.z - nz * rightHalf);
      dists.push(dist, dist);
      sides.push(leftHalf, -rightHalf);
    };
    for (let i = 0; i < n; i++) {
      const { x: tx, z: tz } = tangents[i];
      const inner = Math.min(RIBBON_HALF, radius[i] * 0.92);
      const left = turn[i] > 0 ? inner : RIBBON_HALF; // the path bends toward +normal (left) when turn > 0
      const right = turn[i] < 0 ? inner : RIBBON_HALF;
      if (i === 0) {
        push({ x: samples[0].x - tx * RIBBON_HALF, z: samples[0].z - tz * RIBBON_HALF }, tx, tz, -RIBBON_HALF, RIBBON_HALF, RIBBON_HALF);
      }
      push(samples[i], tx, tz, this.cum[i], left, right);
      if (i === n - 1) {
        push({ x: samples[i].x + tx * RIBBON_HALF, z: samples[i].z + tz * RIBBON_HALF }, tx, tz, this.length + RIBBON_HALF, RIBBON_HALF, RIBBON_HALF);
      }
    }
    const rows = positions.length / 6;
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(dists, 1));
    geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'route';
    this.mesh.renderOrder = 10; // after opaque geometry, before the see-through room roofs
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.reveal = 0;
    this.revealClock = 0;
    this.material.uniforms.uLength.value = this.length;
    this.material.uniforms.uProgress.value = 0;
    this.material.uniforms.uReveal.value = 0;
  }

  // Skips the draw-on animation (used when re-framing an existing route).
  finishReveal() {
    this.reveal = this.length;
    this.revealClock = 1e9;
  }

  setProgress(meters) {
    this.material.uniforms.uProgress.value = meters;
  }

  update(dt, pixelsPerMeter) {
    if (!this.mesh) return;
    this.time += dt;
    const u = this.material.uniforms;
    u.uTime.value = this.time;

    if (this.reveal < this.length) {
      this.revealClock += dt;
      const duration = Math.max(0.9, this.length / ROUTE_DRAW_MPS);
      this.reveal = this.length * easeOutCubic(Math.min(1, this.revealClock / duration));
      if (this.revealClock >= duration) this.reveal = this.length;
    }
    u.uReveal.value = this.reveal;

    const px = Math.min(ROUTE_MAX_PX, Math.max(ROUTE_MIN_PX, ROUTE_WORLD_WIDTH * pixelsPerMeter));
    u.uHalf.value = Math.min(MAX_HALF_LINE, px / pixelsPerMeter / 2);
  }

  _index(distance) {
    const d = Math.min(Math.max(distance, 0), this.length);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    return { i: lo, f: (d - this.cum[lo]) / (this.cum[lo + 1] - this.cum[lo] || 1) };
  }

  pointAt(distance) {
    if (!this.hasRoute) return null;
    const { i, f } = this._index(distance);
    const a = this.samples[i];
    const b = this.samples[i + 1];
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  }

  // Heading a little ahead of `distance`, so it doesn't jitter on the ribbon's fine samples.
  tangentAt(distance) {
    if (!this.hasRoute) return { x: 0, z: -1 };
    const a = this.pointAt(distance - 0.8);
    const b = this.pointAt(distance + 0.8);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.samples = [];
    this.cum = [];
    this.length = 0;
    this.reveal = 0;
  }

  dispose() {
    this.clear();
    this.material.dispose();
  }
}
