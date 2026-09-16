import { DEFAULT_STEP_METERS, WALK_SPEED_MPS } from './constants.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Owns the user's position as a single scalar: meters traveled along the
// current PathRenderer's curve. Forward/backward only ever move this
// scalar, which is what keeps the user locked to the line while still
// giving a smoothly tweened walk instead of an instant jump.
export class WalkController {
  constructor({ stepMeters = DEFAULT_STEP_METERS, speedMps = WALK_SPEED_MPS } = {}) {
    this.pathRenderer = null;
    this.stepMeters = stepMeters;
    this.speedMps = speedMps;
    this.distance = 0;
    this.targetDistance = 0;
  }

  setPathRenderer(pathRenderer, { startAtEnd = false } = {}) {
    this.pathRenderer = pathRenderer;
    const start = startAtEnd ? this.maxDistance : 0;
    this.distance = start;
    this.targetDistance = start;
  }

  get maxDistance() {
    return this.pathRenderer ? this.pathRenderer.lengthMeters : 0;
  }

  get isAtStart() {
    return this.targetDistance <= 0.001;
  }

  get isAtEnd() {
    return this.targetDistance >= this.maxDistance - 0.001;
  }

  get progress() {
    return this.maxDistance > 0 ? this.distance / this.maxDistance : 0;
  }

  moveForward(step = this.stepMeters) {
    this.targetDistance = clamp(this.targetDistance + step, 0, this.maxDistance);
  }

  moveBackward(step = this.stepMeters) {
    this.targetDistance = clamp(this.targetDistance - step, 0, this.maxDistance);
  }

  update(dt) {
    const diff = this.targetDistance - this.distance;
    if (Math.abs(diff) < 0.0005) {
      this.distance = this.targetDistance;
      return;
    }
    const maxStep = this.speedMps * dt;
    this.distance += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
  }

  getPose() {
    if (!this.pathRenderer || this.maxDistance <= 0) return null;
    return {
      position: this.pathRenderer.getPointAtDistance(this.distance),
      tangent: this.pathRenderer.getTangentAtDistance(this.distance),
      distance: this.distance,
      progress: this.progress,
    };
  }
}
