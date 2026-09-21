import * as THREE from './vendor/three.module.js';
import { createProjector } from './core/coords.js';
import { buildBuilding } from './core/BuildingBuilder.js';
import { MapControls, fitDistanceForPoints } from './core/MapControls.js';
import { RouteRenderer } from './core/RouteRenderer.js';
import { loadFloorData, buildRouteNodes, buildPathIndex, findRoute } from './core/FloorDataLoader.js';
import { pointInPolygon } from './core/polygon.js';
import { LabelLayer } from './ui/LabelLayer.js';
import { UserMarker, DestinationPin } from './ui/Markers.js';
import { MapControlsUI } from './ui/MapControlsUI.js';
import { ensureSatelliteStyle } from './ui/styles.js';
import {
  BASE_HEIGHT,
  WALL_HEIGHT,
  COLORS,
  CAMERA_FOV,
  CAMERA_MAX_PITCH,
  CAMERA_DEFAULT_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE_FACTOR,
  LABEL_ZOOM_DISTANCE_FACTOR,
  PLAYBACK_MPS,
  WALK_MPS,
} from './core/constants.js';
import {
  ROUTE_CHANGE_EVENT,
  ROUTE_CLEAR_EVENT,
  ROUTE_CLEARED_EVENT,
  FLOOR_LOADED_EVENT,
  ROUTE_SET_EVENT,
  ROUTE_ERROR_EVENT,
  PROGRESS_EVENT,
  PLAY_EVENT,
  PAUSE_EVENT,
  SEEK_EVENT,
  PLAYBACK_EVENT,
  MOVE_EVENT,
  ROOM_SELECT_EVENT,
} from './core/events.js';

const DEG = Math.PI / 180;
const LIFT = 0.05; // how far above the walking surface the route / user marker sit

/**
 * The satellite / "map" view of a floor: a dark base carrying the building
 * (light boundary walls, slate rooms separated by thin gaps), an OpenStreetMap
 * style camera, category labels that appear as you zoom in, and an animated
 * blue wayfinding route with a "you are here" dot.
 *
 * Like the first-person viewer, it is driven and observed through DOM
 * CustomEvents on a shared target so it can be swapped or hosted anywhere:
 *
 *   in:  'wayfinding:route-change'  { startId, destinationId }
 *        'wayfinding:route-clear'   {}
 *        'wayfinding:play' / 'wayfinding:pause' / 'wayfinding:seek' { progress }
 *        'wayfinding:move'          { direction: 'forward'|'backward', distance?: number }
 *   out: 'wayfinding:floor-loaded'  { nodes }
 *        'wayfinding:route-cleared' {}
 *        'wayfinding:route-set'     { startId, destinationId, distanceMeters, durationSeconds }
 *        'wayfinding:route-error'   { startId, destinationId, reason }
 *        'wayfinding:progress'      { progress, distance, total, atStart, atEnd }
 *        'wayfinding:playback'      { playing }
 *        'wayfinding:room-select'   { id, nodeId, name, category } | { id: null }
 */
export class SatelliteView {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    // Returns the pixels of the map covered by floating UI ({top,right,bottom,left}); the
    // camera then frames things in the remaining free area.
    this.getInsets = options.getInsets || null;
    this.freeExtent = { x: 1, y: 1 };
    ensureSatelliteStyle();
    container.classList.add('sat-root');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // the model is static; re-render shadows only on change
    container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.className = 'sat-overlay';
    container.appendChild(this.overlay);
    this.labels = new LabelLayer(this.overlay);
    const markerLayer = document.createElement('div');
    markerLayer.className = 'sat-markers';
    this.overlay.appendChild(markerLayer);
    this.destinationPin = new DestinationPin(markerLayer);
    this.userMarker = new UserMarker(markerLayer);

    this.controls = new MapControls(this.camera, this.renderer.domElement, {
      minDistance: CAMERA_MIN_DISTANCE,
      maxPitch: CAMERA_MAX_PITCH,
      onChange: () => {
        this._cameraDirty = true;
      },
      onHover: (x, y) => this._onHover(x, y),
      onTap: (x, y) => this._onTap(x, y),
    });

    this.controlsUI =
      options.controls === false
        ? null
        : new MapControlsUI(this.overlay, {
            onZoomIn: () => this.controls.zoomBy(0.62),
            onZoomOut: () => this.controls.zoomBy(1 / 0.62),
            onResetNorth: () => this.controls.resetNorth(),
            onToggleTilt: () => this.controls.toggleTilt(CAMERA_DEFAULT_PITCH * DEG),
            onFit: () => this.recenter(),
          });

    this.routeRenderer = new RouteRenderer(this.scene, { y: BASE_HEIGHT + LIFT });

    this.building = null;
    this.projector = null;
    this.pathIndex = null;
    this.nodes = [];
    this.route = null; // { startId, destinationId }
    this.playback = { playing: false, distance: 0 };
    this.userLocation = null; // { x, z } world
    this.selectedRoomId = null;
    this.hoveredRoom = null;
    this.fitDistance = 100;
    this.fitCenter = new THREE.Vector3();
    this.pixelsPerMeter = 10;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._clock = new THREE.Clock();
    this._cameraDirty = true;
    this._shadowDirty = true;
    this._animatingRooms = false;
    this._pendingIntro = false;
    this._lastProgressKey = '';

    this._setupLights();

    this._handlers = {
      [ROUTE_CHANGE_EVENT]: (e) => this.setRoute(e.detail?.startId, e.detail?.destinationId),
      [ROUTE_CLEAR_EVENT]: () => this.clearRoute(),
      [PLAY_EVENT]: () => this.play(),
      [PAUSE_EVENT]: () => this.pause(),
      [SEEK_EVENT]: (e) => this.seek(e.detail?.progress ?? 0),
      [MOVE_EVENT]: (e) => {
        const { direction, distance = 3 } = e.detail || {};
        this.pause();
        this.seekDistance(this.playback.distance + (direction === 'backward' ? -distance : distance));
      },
    };
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.addEventListener(type, fn);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    this._raf = requestAnimationFrame(() => this._tick());
  }

  // ---- scene ----------------------------------------------------------

  _setupLights() {
    // Soft neutral sky light so shaded walls never go black, plus a warm-white
    // "sun" from the south-west (the camera side, so the faces you look at are lit).
    this.scene.add(new THREE.HemisphereLight(0xf2f4f8, 0x2a2d33, 1.55));

    this.sun = new THREE.DirectionalLight(0xfff6ea, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
  }

  _fitSunToBuilding(box) {
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    this.sun.position.set(center.x - radius * 0.55, radius * 1.45, center.z + radius * 0.8);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius * 1.05;
    cam.right = cam.top = radius * 1.05;
    cam.near = 1;
    cam.far = radius * 4;
    cam.updateProjectionMatrix();
  }

  // ---- loading --------------------------------------------------------

  async loadFloor(dataBaseUrl) {
    const floorData = await loadFloorData(dataBaseUrl);
    return this.loadFloorFromData(floorData);
  }

  loadFloorFromData(floorData) {
    if (this.building) {
      this.scene.remove(this.building.root);
      this.building.root.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && !Array.isArray(o.material)) o.material.dispose?.();
      });
    }
    this.clearRoute({ silent: true });
    this._cameraDirty = true;

    const { boundary } = floorData;
    this.projector = createProjector(boundary.image, boundary.scale?.metersPerPixel);
    this.building = buildBuilding(boundary, this.projector);
    this.scene.add(this.building.root);
    this.pathIndex = buildPathIndex(floorData.paths);
    this.nodes = buildRouteNodes(floorData);
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    this.roomByNodeId = new Map(this.building.rooms.map((r) => [r.nodeId, r]));
    // Every named place: solid rooms plus open areas (which have no solid, only a label).
    this.placeByNodeId = new Map([...this.building.rooms, ...this.building.areas].map((r) => [r.nodeId, r]));

    const box = this.building.bounds;
    box.getCenter(this.fitCenter);
    this._fitSunToBuilding(box);
    this._shadowDirty = true;

    const bounds = box.clone().expandByVector(box.getSize(new THREE.Vector3()).multiplyScalar(0.12));
    this.controls.setBounds(bounds);

    this._buildLabels();
    this._pendingIntro = true;
    this._maybeIntro();

    this.eventTarget.dispatchEvent(new CustomEvent(FLOOR_LOADED_EVENT, { detail: { nodes: this.nodes }, bubbles: true }));
    return this.nodes;
  }

  _buildLabels() {
    const { rooms, areas, objects, heightAt } = this.building;
    const items = [];
    for (const room of rooms) {
      if (room.restricted) continue;
      items.push({
        id: room.id,
        kind: 'room',
        name: room.name,
        style: room.style,
        x: room.center.x,
        y: BASE_HEIGHT + room.height + 0.05,
        z: room.center.z,
        radius: room.radius,
        priority: room.area,
      });
    }
    // Open floor has no roof to put a label on, so it sits on the floor.
    for (const area of areas) {
      items.push({
        id: area.id,
        kind: 'room',
        name: area.name,
        style: area.style,
        x: area.center.x,
        y: heightAt(area.center.x, area.center.z) + 0.4,
        z: area.center.z,
        radius: area.radius,
        priority: area.area,
      });
    }
    for (const object of objects) {
      items.push({
        id: object.id,
        kind: 'object',
        name: object.name,
        style: object.style,
        x: object.x,
        y: heightAt(object.x, object.z) + 1.4,
        z: object.z,
        radius: 0,
        priority: 1e9,
      });
    }
    this.labels.setItems(items);
  }

  // The first frame after loading: start from a distant top-down view and
  // ease into the tilted overview.
  _maybeIntro() {
    if (!this._pendingIntro || !this.container.clientWidth || !this.container.clientHeight) return;
    this._pendingIntro = false;
    this._computeFit();
    const c = this.fitCenter;
    this.controls.set({ x: c.x, z: c.z, distance: this.fitDistance * 1.55, pitch: 0, bearing: -18 * DEG });
    this.controls.flyTo(
      { x: c.x, z: c.z, distance: this.fitDistance, pitch: CAMERA_DEFAULT_PITCH * DEG, bearing: 0 },
      2.4
    );
  }

  _computeFit() {
    const top = BASE_HEIGHT + WALL_HEIGHT;
    const points = [];
    for (const p of this.building.outline) {
      points.push(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, top, p.z));
    }
    this.fitDistance = fitDistanceForPoints(
      this.camera,
      points,
      this.fitCenter,
      0,
      CAMERA_DEFAULT_PITCH * DEG,
      0.06,
      this.freeExtent
    );
    this.controls.maxDistance = this.fitDistance * CAMERA_MAX_DISTANCE_FACTOR;
  }

  recenter() {
    if (!this.building) return;
    if (this.route && this.routeRenderer.hasRoute) this._fitRoute();
    else {
      this.controls.flyTo(
        { x: this.fitCenter.x, z: this.fitCenter.z, distance: this.fitDistance, pitch: CAMERA_DEFAULT_PITCH * DEG, bearing: 0 },
        1.2
      );
    }
  }

  // ---- route ----------------------------------------------------------

  /** Programmatic equivalent of dispatching 'wayfinding:route-change'. */
  setRoute(startId, destinationId) {
    if (!this.pathIndex) return;
    const result = findRoute(this.pathIndex, startId, destinationId);
    if (!result) {
      this._emit(ROUTE_ERROR_EVENT, { startId, destinationId, reason: 'no-path' });
      return;
    }
    this._clearRouteVisuals();
    this.route = { startId, destinationId };

    if (result.sameNode || result.points.length < 2) {
      const start = this._nodeWorld(startId);
      if (start) this.setUserLocation(start);
      this._emit(ROUTE_SET_EVENT, { startId, destinationId, distanceMeters: 0, durationSeconds: 0 });
      return;
    }

    const worldPoints = result.points.map((p) => this.projector.toWorldArr(p));
    this.routeRenderer.setPoints(worldPoints, this.building.heightAt);
    const length = this.routeRenderer.length;

    // Rooms the route passes through turn to see-through glass so the line is
    // visible inside them; the start and destination rooms also glow.
    const crossed = new Set();
    const samples = this.routeRenderer.samples;
    for (const room of this.building.rooms) {
      if (samples.some((s, i) => i % 3 === 0 && pointInPolygon(s, room.polygon))) crossed.add(room);
    }
    const startRoom = this.roomByNodeId.get(startId);
    const destRoom = this.roomByNodeId.get(destinationId);
    const startPlace = this.placeByNodeId.get(startId);
    const destPlace = this.placeByNodeId.get(destinationId);
    for (const room of crossed) room.target.glass = 1;
    if (startRoom) {
      startRoom.target.glass = 1;
      startRoom.target.accent = 1;
    }
    if (destRoom) {
      destRoom.target.glass = 1;
      destRoom.target.accent = 1;
    }
    this._animatingRooms = true;

    const end = this.routeRenderer.pointAt(length);
    // The pin stands on the destination room's roof so it is never hidden behind walls.
    const pinY = destRoom ? BASE_HEIGHT + destRoom.height : this._surfaceY(end.x, end.z);
    this.destinationPin.set({ x: end.x, y: pinY, z: end.z }, this.nodeById.get(destinationId)?.label || '');
    this.labels.setHidden(destPlace ? [destPlace.id] : []);
    this.labels.setEmphasized(startPlace ? [startPlace.id] : []);

    this.playback = { playing: false, distance: 0 };
    this.routeRenderer.setProgress(0);
    this._placeUser(0);

    this._emit(ROUTE_SET_EVENT, {
      startId,
      destinationId,
      distanceMeters: length,
      durationSeconds: length / WALK_MPS,
    });
    this._emitProgress(true);
    this._emit(PLAYBACK_EVENT, { playing: false });
    // Fit last: listeners of route-set (e.g. a summary card) may have resized the floating UI.
    this.refreshInsets();
    this._fitRoute();
  }

  clearRoute({ silent = false } = {}) {
    this._clearRouteVisuals();
    this.route = null;
    if (!silent) this._emit(ROUTE_CLEARED_EVENT, {});
  }

  _clearRouteVisuals() {
    this.routeRenderer.clear();
    this.destinationPin.set(null);
    this.playback = { playing: false, distance: 0 };
    this.controls.follow(null);
    if (this.building) {
      for (const room of this.building.rooms) {
        room.target.glass = 0;
        room.target.accent = 0;
      }
      this._animatingRooms = true;
    }
    this.labels.setHidden([]);
    this.labels.setEmphasized([]);
    if (this.userLocation) this.setUserLocation(this.userLocation);
    else this.userMarker.set(null);
    this._cameraDirty = true;
  }

  _fitRoute() {
    const samples = this.routeRenderer.samples;
    if (!samples.length) return;
    const box = new THREE.Box3();
    const points = [];
    for (const p of samples) {
      box.expandByPoint(new THREE.Vector3(p.x, 0, p.z));
    }
    // Pad the route by a few meters (and to roof height) so the pin and the rooms at its ends are in frame.
    for (let i = 0; i < samples.length; i += 4) {
      const p = samples[i];
      for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        points.push(new THREE.Vector3(p.x + dx, 0, p.z + dz), new THREE.Vector3(p.x + dx, BASE_HEIGHT + 5, p.z + dz));
      }
    }
    const center = box.getCenter(new THREE.Vector3());
    const goal = this.controls.goal;
    const distance = fitDistanceForPoints(
      this.camera,
      points,
      center,
      goal.bearing,
      goal.pitch,
      0.1,
      this.freeExtent
    );
    this.controls.flyTo({ x: center.x, z: center.z, distance: Math.min(distance, this.fitDistance) }, 1.5);
  }

  // ---- user location & playback ----------------------------------------

  _nodeWorld(nodeId) {
    const node = this.nodeById?.get(nodeId);
    if (!node?.centroidPx) return null;
    return this.projector.toWorldArr(node.centroidPx);
  }

  /** Puts the blue "you are here" dot at a world {x, z} position (null hides it). */
  setUserLocation(point) {
    this.userLocation = point;
    if (this.route && this.routeRenderer.hasRoute) return;
    this.userMarker.set(point ? { x: point.x, y: this._surfaceY(point.x, point.z), z: point.z } : null, null);
    this._cameraDirty = true;
  }

  /** Puts the dot on a route-graph node, e.g. `view.setUserNode('exits-0')`. */
  setUserNode(nodeId) {
    const p = this._nodeWorld(nodeId);
    if (p) this.setUserLocation(p);
    return !!p;
  }

  // Height of the walking surface at a point (the floor, or a stair tread), plus a small lift.
  _surfaceY(x, z) {
    return (this.building ? this.building.heightAt(x, z) : BASE_HEIGHT) + LIFT;
  }

  _placeUser(distance) {
    const p = this.routeRenderer.pointAt(distance);
    if (!p) return;
    const t = this.routeRenderer.tangentAt(distance);
    this.userMarker.set({ x: p.x, y: this._surfaceY(p.x, p.z), z: p.z }, t);
    this.routeRenderer.setProgress(distance);
    this._cameraDirty = true;
    return p;
  }

  play() {
    if (!this.routeRenderer.hasRoute) return;
    if (this.playback.distance >= this.routeRenderer.length - 0.01) this.playback.distance = 0;
    this.playback.playing = true;
    this._emit(PLAYBACK_EVENT, { playing: true });
  }

  pause() {
    if (!this.playback.playing) return;
    this.playback.playing = false;
    this.controls.follow(null);
    this._emit(PLAYBACK_EVENT, { playing: false });
  }

  seek(progress) {
    this.seekDistance(Math.min(1, Math.max(0, progress)) * this.routeRenderer.length);
  }

  seekDistance(distance) {
    if (!this.routeRenderer.hasRoute) return;
    this.playback.distance = Math.min(this.routeRenderer.length, Math.max(0, distance));
    this._placeUser(this.playback.distance);
    this._emitProgress();
  }

  _stepPlayback(dt) {
    if (!this.playback.playing || !this.routeRenderer.hasRoute) return;
    const limit = Math.min(this.routeRenderer.length, this.routeRenderer.reveal);
    this.playback.distance = Math.min(limit, this.playback.distance + PLAYBACK_MPS * dt);
    const p = this._placeUser(this.playback.distance);
    this.controls.follow(p);
    this._emitProgress();
    if (this.playback.distance >= this.routeRenderer.length - 0.001) {
      this.playback.playing = false;
      this.controls.follow(null);
      this._emit(PLAYBACK_EVENT, { playing: false });
    }
  }

  _emitProgress(force = false) {
    const total = this.routeRenderer.length;
    const d = this.playback.distance;
    const key = d.toFixed(2);
    if (!force && key === this._lastProgressKey) return;
    this._lastProgressKey = key;
    this._emit(PROGRESS_EVENT, {
      progress: total ? d / total : 0,
      distance: d,
      total,
      atStart: d <= 0.001,
      atEnd: d >= total - 0.001,
    });
  }

  // ---- picking --------------------------------------------------------

  _pick(clientX, clientY) {
    if (!this.building) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this.building.roomGroup.children, false);
    return hits.length ? hits[0].object.userData.room : null;
  }

  _onHover(x, y) {
    const room = x === null || x === undefined ? null : this._pick(x, y);
    if (room === this.hoveredRoom) return;
    if (this.hoveredRoom) this.hoveredRoom.target.hover = 0;
    this.hoveredRoom = room;
    if (room) room.target.hover = 1;
    this.renderer.domElement.style.cursor = room ? 'pointer' : '';
    this._animatingRooms = true;
  }

  _onTap(x, y) {
    const room = this._pick(x, y);
    this.selectRoom(room ? room.id : null);
  }

  selectRoom(id) {
    if (id === this.selectedRoomId) id = null;
    const prev = this.building?.rooms.find((r) => r.id === this.selectedRoomId);
    if (prev) prev.target.select = 0;
    this.selectedRoomId = id;
    const room = this.building?.rooms.find((r) => r.id === id);
    if (room) room.target.select = 1;
    this.labels.setSelected(id);
    this._animatingRooms = true;
    this._cameraDirty = true;
    this._emit(ROOM_SELECT_EVENT, room ? { id: room.id, nodeId: room.nodeId, name: room.name, category: room.category } : { id: null });
  }

  // ---- per-frame ------------------------------------------------------

  _updateRoomStates(dt) {
    if (!this.building || !this._animatingRooms) return false;
    const k = 1 - Math.exp(-dt * 9);
    let anyMoving = false;
    const tint = new THREE.Color();
    for (const room of this.building.rooms) {
      const { state, target, material, mesh, edges } = room;
      let changed = false;
      for (const key of ['hover', 'glass', 'accent', 'select']) {
        const diff = target[key] - state[key];
        if (Math.abs(diff) < 0.003) {
          if (state[key] !== target[key]) {
            state[key] = target[key];
            changed = true;
          }
        } else {
          state[key] += diff * k;
          changed = true;
          anyMoving = true;
        }
      }
      if (!changed) continue;

      tint.set(COLORS.hover);
      material.color.copy(room.baseColor).lerp(tint, state.hover * 0.16);
      tint.set(COLORS.accent);
      material.color.lerp(tint, Math.max(state.accent * 0.5, state.select * 0.26));
      material.emissiveIntensity = state.accent * 0.08 + state.select * 0.1 + state.hover * 0.05;

      const glass = state.glass > 0.01;
      material.opacity = 1 - 0.68 * state.glass;
      if (material.transparent !== glass) {
        material.transparent = glass;
        material.needsUpdate = true;
      }
      material.depthWrite = !glass;
      mesh.renderOrder = glass ? 20 : 0;
      const shadowCaster = state.glass < 0.5;
      if (mesh.castShadow !== shadowCaster) {
        mesh.castShadow = shadowCaster;
        this._shadowDirty = true;
      }
      const outline = Math.max(state.glass * 0.9, state.select);
      edges.visible = outline > 0.01;
      edges.material.opacity = outline;
    }
    if (!anyMoving) this._animatingRooms = false;
    return true;
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this._applyInsets();
    this.renderer.setSize(w, h, false);
    this._cameraDirty = true;
    if (this.building && !this._pendingIntro) this._computeFit();
    this._maybeIntro();
  }

  // Shifts the camera's projection so the point it looks at lands in the middle
  // of the area not covered by UI (panels, buttons) instead of the whole canvas.
  _applyInsets() {
    const w = this.width;
    const h = this.height;
    const { top = 0, right = 0, bottom = 0, left = 0 } = this.getInsets?.() || {};
    const freeW = Math.max(120, w - left - right);
    const freeH = Math.max(120, h - top - bottom);
    this.freeExtent = { x: freeW / w, y: freeH / h };
    const cx = (left - right) / 2;
    const cy = (top - bottom) / 2;
    if (Math.abs(cx) < 0.5 && Math.abs(cy) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, -cx, -cy, w, h);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** Re-reads the insets (call after the floating UI changes size). */
  refreshInsets() {
    this._applyInsets();
    this._cameraDirty = true;
  }

  _tick() {
    const dt = Math.min(this._clock.getDelta(), 0.1);

    this.controls.update(dt);
    this._stepPlayback(dt);
    const roomsChanged = this._updateRoomStates(dt);

    if (this.width) {
      const tanHalfFov = Math.tan((this.camera.fov * DEG) / 2);
      this.pixelsPerMeter = this.height / 2 / (this.controls.distance * tanHalfFov);
      this.routeRenderer.update(dt, this.pixelsPerMeter);

      const cameraMoved = this._cameraDirty;
      if (this._cameraDirty && this.building) {
        this._cameraDirty = false;
        const labelsOn = this.controls.distance < this.fitDistance * LABEL_ZOOM_DISTANCE_FACTOR;
        if (labelsOn) this.labels.update(this.camera, this.width, this.height, this.pixelsPerMeter, this.building.walls);
        else this.labels.hideAll();
        this.userMarker.update(this.camera, this.width, this.height, this.building.walls);
        this.destinationPin.update(this.camera, this.width, this.height);
        this.controlsUI?.update(this.controls.bearing, this.controls.pitch);
      }

      // Idle frames (no camera motion, no route animating) are skipped entirely.
      if (this.building && (cameraMoved || roomsChanged || this.routeRenderer.hasRoute || this._shadowDirty)) {
        if (this._shadowDirty || roomsChanged) {
          this.renderer.shadowMap.needsUpdate = true;
          this._shadowDirty = false;
        }
        this.renderer.render(this.scene, this.camera);
      }
    }

    this._raf = requestAnimationFrame(() => this._tick());
  }

  _emit(type, detail) {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  getNodes() {
    return this.nodes;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.removeEventListener(type, fn);
    this.controls.dispose();
    this.routeRenderer.dispose();
    this.renderer.dispose();
    this.overlay.remove();
    this.renderer.domElement.remove();
  }
}
