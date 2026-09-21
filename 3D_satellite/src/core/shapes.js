import * as THREE from '../vendor/three.module.js';
import { BEVEL } from './constants.js';

// A THREE.Shape lives in an (x, y) plane and, after rotateX(-PI/2), that
// plane becomes the ground plane. Feeding y = -worldZ cancels the rotation's
// sign flip so the footprint lands exactly on the (x, z) it was built from.
const toVec2 = (p) => new THREE.Vector2(p.x, -p.z);

export function makeShape(outline, holes = []) {
  const shape = new THREE.Shape(outline.map(toVec2));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(toVec2)));
  return shape;
}

// Extrudes a footprint into a solid of exactly `height`, standing on y = 0,
// with a small chamfer along every top edge (the bottom chamfer is hidden).
export function extrude(shape, height, bevel = BEVEL) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}
