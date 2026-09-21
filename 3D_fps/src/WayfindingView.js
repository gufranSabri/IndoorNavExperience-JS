import * as THREE from './vendor/three.module.js';
import { createProjector } from './core/coords.js';
import { buildFloorScene, updateDoorStates } from './core/FloorGeometryBuilder.js';
import { PathRenderer } from './core/PathRenderer.js';
import { WalkController } from './core/WalkController.js';
import { CameraRig } from './core/CameraRig.js';
import { loadFloorData, buildRouteNodes, buildPathIndex, findRoute } from './core/FloorDataLoader.js';
import { createSkyGradientTexture } from './core/textures.js';
import {
  EYE_HEIGHT,
  DEFAULT_STEP_METERS,
  WALK_SPEED_MPS,
  SKY_TOP_COLOR,
  SKY_HORIZON_COLOR,
  SKY_GROUND_COLOR,
} from './core/constants.js';

export const MOVE_EVENT = 'wayfinding:move';
export const MOVE_START_EVENT = 'wayfinding:move-start';
export const MOVE_STOP_EVENT = 'wayfinding:move-stop';
export const ROUTE_CHANGE_EVENT = 'wayfinding:route-change';
export const FLOOR_LOADED_EVENT = 'wayfinding:floor-loaded';
export const ROUTE_SET_EVENT = 'wayfinding:route-set';
export const ROUTE_ERROR_EVENT = 'wayfinding:route-error';
export const PROGRESS_EVENT = 'wayfinding:progress';

/**
 * Component 1: the actual first-person 3D view.
 *
 * Renders the full floor, then (once a start/destination is set) an
 * animated path and a first-person camera locked to that path. It never
 * reads UI controls directly — it only reacts to two DOM CustomEvents so it
 * stays decoupled from whatever HTML/controls happen to be on the page:
 *
 *   - 'wayfinding:move'          { direction: 'forward'|'backward', distance?: number } — one discrete step
 *   - 'wayfinding:move-start'    { direction: 'forward'|'backward' } — walk continuously until move-stop
 *   - 'wayfinding:move-stop'     {} — stop any continuous walk started by move-start
 *   - 'wayfinding:route-change'  { startId: string, destinationId: string }
 *
 * and emits its own so other components (a route selector, a progress bar)
 * can react without importing this class:
 *
 *   - 'wayfinding:floor-loaded'  { nodes: Array<{id,label,class}> }
 *   - 'wayfinding:route-set'     { startId, destinationId, distanceMeters }
 *   - 'wayfinding:route-error'   { startId, destinationId, reason }
 *   - 'wayfinding:progress'      { progress, distance, atStart, atEnd }
 */
export class WayfindingView {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.stepMeters = options.stepMeters ?? DEFAULT_STEP_METERS;

    this.scene = new THREE.Scene();
    this.scene.background = createSkyGradientTexture({
      top: SKY_TOP_COLOR,
      horizon: SKY_HORIZON_COLOR,
      ground: SKY_GROUND_COLOR,
    });
    this.scene.fog = new THREE.Fog(0xdfeaf5, 25, 90);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.userSelect = 'none';
    this.renderer.domElement.style.webkitUserSelect = 'none';
    this.renderer.domElement.style.webkitTouchCallout = 'none';
    this.renderer.domElement.style.webkitTapHighlightColor = 'transparent';
    this.container.appendChild(this.renderer.domElement);

    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement);
    this.pathRenderer = new PathRenderer(this.scene);
    this.walkController = new WalkController({ stepMeters: this.stepMeters });

    this.floorGroup = null;
    this.projector = null;
    this.pathIndex = null;
    this.nodes = [];
    this.doorStates = [];
    this.instancedLeaves = null;
    this.ceilingGroup = null;
    this.interiorLightsGroup = null;
    this.route = null; // { startId, destinationId }
    this.mode = 'overview'; // 'overview' | 'walking'
    this._holdDirection = null; // set by move-start/move-stop, drives continuous walking each frame

    this._clock = new THREE.Clock();
    this._overviewAngle = 0;
    this._overviewCenter = new THREE.Vector3();
    this._overviewRadius = 10;

    this._onMove = this._onMove.bind(this);
    this._onMoveStart = this._onMoveStart.bind(this);
    this._onMoveStop = this._onMoveStop.bind(this);
    this._onRouteChange = this._onRouteChange.bind(this);
    this.eventTarget.addEventListener(MOVE_EVENT, this._onMove);
    this.eventTarget.addEventListener(MOVE_START_EVENT, this._onMoveStart);
    this.eventTarget.addEventListener(MOVE_STOP_EVENT, this._onMoveStop);
    this.eventTarget.addEventListener(ROUTE_CHANGE_EVENT, this._onRouteChange);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.container);
    this._resize();

    this._setupLights();

    this._raf = requestAnimationFrame(() => this._tick());
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xeaf3ff, 0x9aa4b2, 0.6);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3e0, 1.35);
    sun.position.set(30, 45, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    fill.position.set(-20, 20, -25);
    this.scene.add(fill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);
  }

  async loadFloor(dataBaseUrl) {
    const floorData = await loadFloorData(dataBaseUrl);
    this._buildFromFloorData(floorData);
    return this.nodes;
  }

  loadFloorFromData(floorData) {
    this._buildFromFloorData(floorData);
    return this.nodes;
  }

  _buildFromFloorData(floorData) {
    if (this.floorGroup) {
      this.scene.remove(this.floorGroup);
    }
    this.pathRenderer.clear();
    this.route = null;
    this._setMode('overview');

    const { boundary } = floorData;
    this.projector = createProjector(boundary.image, boundary.scale?.metersPerPixel);
    const { root, boundingBox, doorStates, instancedLeaves, ceilingGroup, interiorLightsGroup } = buildFloorScene(
      boundary,
      this.projector
    );
    this.floorGroup = root;
    this.doorStates = doorStates;
    this.instancedLeaves = instancedLeaves;
    this.ceilingGroup = ceilingGroup;
    this.interiorLightsGroup = interiorLightsGroup;
    this.scene.add(root);

    this.pathIndex = buildPathIndex(floorData.paths);
    this.nodes = buildRouteNodes(floorData);

    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    this._overviewCenter.set(center.x, 0, center.z);

    // Frame the whole floor regardless of its footprint: pick a camera
    // distance from the bounding sphere and the vertical FOV, then split
    // that distance into a steep "dollhouse" pitch so the plan reads
    // clearly from above rather than nearly edge-on.
    const sphereRadius = size.length() / 2;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const camDistance = (sphereRadius / Math.sin(fovRad / 2)) * 1.2;
    const pitch = THREE.MathUtils.degToRad(52);
    this._overviewRadius = camDistance * Math.cos(pitch);
    this._overviewHeight = camDistance * Math.sin(pitch);

    // Fog should never wash out the whole overview shot, but still gives
    // first-person walks a soft horizon. Scale it to this floor's size.
    this.scene.fog.near = camDistance * 0.9;
    this.scene.fog.far = camDistance * 3;

    this._emit(FLOOR_LOADED_EVENT, { nodes: this.nodes });
  }

  /** Programmatic equivalent of dispatching a 'wayfinding:route-change' event. */
  setRoute(startId, destinationId) {
    if (!this.pathIndex) return;
    const result = findRoute(this.pathIndex, startId, destinationId);
    if (!result) {
      this._emit(ROUTE_ERROR_EVENT, { startId, destinationId, reason: 'no-path' });
      return;
    }

    this.route = { startId, destinationId };
    this.cameraRig.resetLook();
    this._holdDirection = null;

    if (result.sameNode || result.points.length < 2) {
      this.pathRenderer.clear();
      this.walkController.setPathRenderer(null);
      this._setMode('overview');
      this._emit(ROUTE_SET_EVENT, { startId, destinationId, distanceMeters: 0 });
      return;
    }

    const worldPoints = result.points.map((p) => this.projector.toWorldArr(p));
    this.pathRenderer.setPoints(worldPoints);
    this.walkController.setPathRenderer(this.pathRenderer, { startAtEnd: false });
    this._setMode('walking');

    this._emit(ROUTE_SET_EVENT, {
      startId,
      destinationId,
      distanceMeters: this.pathRenderer.lengthMeters,
    });
    this._emitProgress();
  }

  /** Programmatic equivalent of dispatching a 'wayfinding:move' event. */
  moveForward(distance = this.stepMeters) {
    this.walkController.moveForward(distance);
  }

  moveBackward(distance = this.stepMeters) {
    this.walkController.moveBackward(distance);
  }

  getNodes() {
    return this.nodes;
  }

  // The ceiling and its light fixtures only make sense once the camera is
  // actually inside the floor: shown while walking, hidden for the overview
  // dollhouse shot so the open-top plan is still the first thing rendered.
  _setMode(mode) {
    this.mode = mode;
    const showEnclosed = mode === 'walking';
    if (this.ceilingGroup) this.ceilingGroup.visible = showEnclosed;
    if (this.interiorLightsGroup) this.interiorLightsGroup.visible = showEnclosed;
  }

  _onMove(event) {
    const { direction, distance } = event.detail || {};
    if (this.mode !== 'walking') return;
    if (direction === 'forward') this.moveForward(distance);
    else if (direction === 'backward') this.moveBackward(distance);
  }

  _onMoveStart(event) {
    const { direction } = event.detail || {};
    if (direction === 'forward' || direction === 'backward') this._holdDirection = direction;
  }

  _onMoveStop() {
    this._holdDirection = null;
  }

  _onRouteChange(event) {
    const { startId, destinationId } = event.detail || {};
    this.setRoute(startId, destinationId);
  }

  _emit(type, detail) {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  _emitProgress() {
    this._emit(PROGRESS_EVENT, {
      progress: this.walkController.progress,
      distance: this.walkController.distance,
      atStart: this.walkController.isAtStart,
      atEnd: this.walkController.isAtEnd,
    });
  }

  _resize() {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  _tick() {
    const dt = Math.min(this._clock.getDelta(), 0.1);

    if (this.doorStates.length) {
      updateDoorStates(this.doorStates, this.instancedLeaves, this.camera.position.x, this.camera.position.z, dt);
    }

    if (this.mode === 'walking') {
      if (this._holdDirection === 'forward') this.walkController.moveForward(dt * WALK_SPEED_MPS);
      else if (this._holdDirection === 'backward') this.walkController.moveBackward(dt * WALK_SPEED_MPS);

      const before = this.walkController.distance;
      this.walkController.update(dt);
      const pose = this.walkController.getPose();
      this.cameraRig.applyPose(pose, EYE_HEIGHT);
      if (Math.abs(this.walkController.distance - before) > 1e-6) this._emitProgress();
    } else {
      this._overviewAngle += dt * 0.12;
      const x = this._overviewCenter.x + Math.cos(this._overviewAngle) * this._overviewRadius;
      const z = this._overviewCenter.z + Math.sin(this._overviewAngle) * this._overviewRadius;
      this.camera.position.set(x, this._overviewHeight || 12, z);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this._overviewCenter);
    }

    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(() => this._tick());
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.eventTarget.removeEventListener(MOVE_EVENT, this._onMove);
    this.eventTarget.removeEventListener(MOVE_START_EVENT, this._onMoveStart);
    this.eventTarget.removeEventListener(MOVE_STOP_EVENT, this._onMoveStop);
    this.eventTarget.removeEventListener(ROUTE_CHANGE_EVENT, this._onRouteChange);
    this.cameraRig.dispose();
    this.pathRenderer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
