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
  const ring = occluder.userData.ring;
  if (ring) return ringOccludes(camera.position, x, y, z, ring, occluder.userData.baseY, occluder.userData.topY);
  _target.set(x, y, z);
  _dir.subVectors(_target, camera.position);
  const dist = _dir.length();
  _raycaster.set(camera.position, _dir.divideScalar(dist));
  _raycaster.far = Math.max(0, dist - 0.1);
  return _raycaster.intersectObject(occluder, false).length > 0;
}

// Same question answered analytically: does the camera->point sight line cross
// the wall ring (2D segment test) below the wall's top? A few dozen segment
// checks instead of ray-testing every triangle of the wall mesh per label.
function ringOccludes(cam, x, y, z, ring, baseY, topY) {
  const dx = x - cam.x;
  const dz = z - cam.z;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const den = dx * ez - dz * ex;
    if (den === 0) continue;
    const u = ((a.x - cam.x) * ez - (a.z - cam.z) * ex) / den; // along camera->point
    const v = ((a.x - cam.x) * dz - (a.z - cam.z) * dx) / den; // along the wall segment
    if (u <= 0 || u >= 1 || v < 0 || v > 1) continue;
    const h = cam.y + (y - cam.y) * u;
    if (h < topY && h > baseY) return true;
  }
  return false;
}
