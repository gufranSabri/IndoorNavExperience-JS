import * as THREE from '../vendor/three.module.js';
import { PATH_COLOR, PATH_RADIUS, PATH_DRAW_DURATION_MS } from './constants.js';

const PATH_Y = 0.04; // meters above floor, keeps the tube from z-fighting the slab
const TUBE_TUBULAR_SEGMENTS = 96;
const TUBE_RADIAL_SEGMENTS = 10;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function sampleCurveRange(curve, u0, u1, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? u0 : u0 + (u1 - u0) * (i / (count - 1));
    points.push(curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1)));
  }
  return points;
}

// Renders the wayfinding route as an animated, glowing tube and doubles as
// the authoritative "spine" that WalkController samples for camera position
// and heading, so what the user sees matches exactly what they walk along.
export class PathRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.curve = null;
    this.lengthMeters = 0;
    this._raf = null;
    this._clock = new THREE.Clock();
    this.material = new THREE.MeshStandardMaterial({
      color: PATH_COLOR,
      emissive: PATH_COLOR,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
    });
  }

  setPoints(worldPoints2D) {
    this.clear();
    if (!worldPoints2D || worldPoints2D.length < 2) return;

    const vec3Points = worldPoints2D.map((p) => new THREE.Vector3(p.x, PATH_Y, p.z));
    this.curve = new THREE.CatmullRomCurve3(vec3Points, false, 'catmullrom', 0.4);
    this.curve.arcLengthDivisions = Math.max(200, vec3Points.length * 25);
    this.lengthMeters = this.curve.getLength();

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = 'wayfinding-path';
    this.scene.add(this.mesh);
    this._animateDraw();
  }

  _setGeometryForFraction(t) {
    if (!this.mesh || !this.curve) return;
    const safeT = Math.max(t, 0.02);
    const count = Math.max(2, Math.round(TUBE_TUBULAR_SEGMENTS * safeT) + 1);
    const points = sampleCurveRange(this.curve, 0, safeT, count);
    const subCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
    const geometry = new THREE.TubeGeometry(subCurve, Math.max(1, count - 1), PATH_RADIUS, TUBE_RADIAL_SEGMENTS, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }

  _animateDraw() {
    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / PATH_DRAW_DURATION_MS);
      this._setGeometryForFraction(easeOutCubic(t));
      if (t < 1) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._raf = requestAnimationFrame(this._pulse.bind(this));
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  _pulse() {
    if (!this.material) return;
    const t = this._clock.getElapsedTime();
    this.material.emissiveIntensity = 0.45 + Math.sin(t * 2.2) * 0.2;
    this._raf = requestAnimationFrame(this._pulse.bind(this));
  }

  getPointAtDistance(distanceMeters) {
    if (!this.curve || this.lengthMeters <= 0) return new THREE.Vector3();
    const u = THREE.MathUtils.clamp(distanceMeters / this.lengthMeters, 0, 1);
    return this.curve.getPointAt(u);
  }

  getTangentAtDistance(distanceMeters) {
    if (!this.curve || this.lengthMeters <= 0) return new THREE.Vector3(0, 0, -1);
    const u = THREE.MathUtils.clamp(distanceMeters / this.lengthMeters, 0.0001, 0.9999);
    return this.curve.getTangentAt(u);
  }

  clear() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.curve = null;
    this.lengthMeters = 0;
  }

  dispose() {
    this.clear();
    this.material.dispose();
  }
}
