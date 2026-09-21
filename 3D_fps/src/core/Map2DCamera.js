import * as THREE from '../vendor/three.module.js';
import { MAP2D_MIN_HALF_EXTENT, MAP2D_MAX_HALF_EXTENT } from './constants.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// A top-down "map" camera: orthographic, fixed to look straight down, with
// wheel/pinch zoom. Rotation is set once via Euler angles (not `lookAt`),
// since looking straight down is exactly the direction three.js's default
// up vector is parallel to — the classic lookAt-singularity case.
export class Map2DCamera {
  constructor(domElement, { initialHalfExtent = 16 } = {}) {
    this.domElement = domElement;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.camera.rotation.set(-Math.PI / 2, 0, 0);
    this.halfExtent = initialHalfExtent;
    this.aspect = 1;
    this._lastPinchDist = null;

    this._onWheel = this._onWheel.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    domElement.addEventListener('touchstart', this._onTouchStart, { passive: true });
    domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
    domElement.addEventListener('touchend', this._onTouchEnd);
    domElement.addEventListener('touchcancel', this._onTouchEnd);

    this._updateProjection();
  }

  _onWheel(event) {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.001);
    this._setZoom(this.halfExtent * factor);
  }

  _onTouchStart(event) {
    if (event.touches.length === 2) this._lastPinchDist = this._touchDist(event.touches);
  }

  _onTouchMove(event) {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const dist = this._touchDist(event.touches);
    if (this._lastPinchDist) this._setZoom(this.halfExtent * (this._lastPinchDist / dist));
    this._lastPinchDist = dist;
  }

  _onTouchEnd(event) {
    if (event.touches.length < 2) this._lastPinchDist = null;
  }

  _touchDist(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  _setZoom(halfExtent) {
    this.halfExtent = clamp(halfExtent, MAP2D_MIN_HALF_EXTENT, MAP2D_MAX_HALF_EXTENT);
    this._updateProjection();
  }

  setAspect(aspect) {
    this.aspect = aspect || 1;
    this._updateProjection();
  }

  setHalfExtent(halfExtent) {
    this.halfExtent = clamp(halfExtent, MAP2D_MIN_HALF_EXTENT, MAP2D_MAX_HALF_EXTENT);
    this._updateProjection();
  }

  _updateProjection() {
    const h = this.halfExtent;
    const w = h * this.aspect;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  setTarget(x, z, height = 200) {
    this.camera.position.set(x, height, z);
  }

  dispose() {
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('touchstart', this._onTouchStart);
    this.domElement.removeEventListener('touchmove', this._onTouchMove);
    this.domElement.removeEventListener('touchend', this._onTouchEnd);
    this.domElement.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
