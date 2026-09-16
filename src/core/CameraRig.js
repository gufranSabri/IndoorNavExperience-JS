import * as THREE from '../vendor/three.module.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// First-person camera that always sits on the walk path (position is fully
// controlled by WalkController) but supports free look via pointer drag,
// like Street View. Dragging never moves the user off the line.
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.yawOffset = 0;
    this.pitch = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    domElement.style.touchAction = 'none';
    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointerleave', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
  }

  _onPointerDown(e) {
    this._dragging = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this.domElement.setPointerCapture?.(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this.yawOffset -= dx * 0.0035;
    this.pitch = clamp(this.pitch - dy * 0.0035, -1.1, 1.1);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  applyPose(pose, eyeHeight) {
    if (!pose) return;
    const { position, tangent } = pose;
    this.camera.position.set(position.x, eyeHeight, position.z);
    const lookTarget = new THREE.Vector3(
      position.x + tangent.x * 5,
      eyeHeight,
      position.z + tangent.z * 5
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(lookTarget);
    this.camera.rotateY(this.yawOffset);
    this.camera.rotateX(this.pitch);
  }

  resetLook() {
    this.yawOffset = 0;
    this.pitch = 0;
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointerleave', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
  }
}
