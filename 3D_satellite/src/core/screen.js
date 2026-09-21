import * as THREE from '../vendor/three.module.js';

const _v = new THREE.Vector3();

// Projects a world point to CSS pixels inside a width x height viewport.
// `behind` is true when the point is behind the camera / past its far plane.
export function projectToScreen(camera, x, y, z, width, height, out = {}) {
  _v.set(x, y, z).project(camera);
  out.x = (_v.x * 0.5 + 0.5) * width;
  out.y = (-_v.y * 0.5 + 0.5) * height;
  out.behind = _v.z > 1 || _v.z < -1;
  return out;
}

const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

// True when `occluder` (a Mesh, here the tall boundary wall) sits between the
// camera and the world point — i.e. that point is hidden from view.
export function isOccluded(camera, x, y, z, occluder) {
  if (!occluder) return false;
  _target.set(x, y, z);
  _dir.subVectors(_target, camera.position);
  const dist = _dir.length();
  _raycaster.set(camera.position, _dir.divideScalar(dist));
  _raycaster.far = Math.max(0, dist - 0.1);
  return _raycaster.intersectObject(occluder, false).length > 0;
}
