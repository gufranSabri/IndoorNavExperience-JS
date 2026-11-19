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

// Three.js builds the chamfer by offsetting the footprint ring inward at the
// top. On rings with tiny segments or sharp concave spots (rounded room
// corners squeezed by a neighbour, etc.) that offset folds over itself and the
// top cap gets flipped triangles — which show up as a stray line cutting
// across the room where there is no wall. A healthy cap is all upward-facing.
function topCapIsFlipped(geometry, topY) {
  const p = geometry.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    if (Math.abs(a.y - topY) > 1e-3 || Math.abs(b.y - topY) > 1e-3 || Math.abs(c.y - topY) > 1e-3) continue;
    if (b.sub(a).cross(c.sub(a)).y < 0) return true;
  }
  return false;
}

function build(shape, height, bevel) {
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

// Extrudes a footprint into a solid of exactly `height`, standing on y = 0,
// with a small chamfer along every top edge (the bottom chamfer is hidden).
// If the chamfer would corrupt the top cap (see above), that footprint is
// extruded square instead.
export function extrude(shape, height, bevel = BEVEL) {
  const geometry = build(shape, height, bevel);
  if (bevel > 0 && topCapIsFlipped(geometry, height)) {
    geometry.dispose();
    return build(shape, height, 0);
  }
  return geometry;
}
