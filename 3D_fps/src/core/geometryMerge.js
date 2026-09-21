import * as THREE from '../vendor/three.module.js';

// A minimal, dependency-free stand-in for three/examples/jsm's
// BufferGeometryUtils.mergeGeometries — vendoring the whole utils module
// just for this one function isn't worth it. Every geometry this project
// merges (BoxGeometry, ExtrudeGeometry, CircleGeometry) carries indexed
// position/normal/uv attributes, so that's all this needs to handle.
//
// Mobile GPU drivers pay a real per-draw-call cost, and a floor plan built
// from one box per wall segment plus a baseboard and a cap on each produces
// hundreds of draw calls for otherwise-static geometry. Callers bake each
// piece's world transform into its geometry with .translate()/.rotateY()
// *before* merging (see FloorGeometryBuilder's `bakeTransform`), so the
// merged result can be a single Mesh at the identity transform.
export function mergeGeometries(geometries) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;

    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
    }

    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) {
        indices.push(geometry.index.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < position.count; i++) indices.push(i + vertexOffset);
    }
    vertexOffset += position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  return merged;
}

// Bakes a box/extrude piece's world position + Y-rotation directly into its
// vertices, so many pieces sharing a material can be merged into one static
// mesh at the identity transform instead of staying as separate Mesh objects.
export function bakeTransform(geometry, { x = 0, y = 0, z = 0, rotationY = 0 } = {}) {
  if (rotationY) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

// Collects geometry pieces per material key and merges each group into one
// Mesh at the end — the common pattern every "static chunk" builder below
// uses instead of adding one Mesh per piece to the scene graph.
export class MergedMeshBuilder {
  constructor() {
    this._byKey = new Map(); // key -> { geometries, material }
  }

  add(key, geometry, material) {
    let entry = this._byKey.get(key);
    if (!entry) {
      entry = { geometries: [], material };
      this._byKey.set(key, entry);
    }
    entry.geometries.push(geometry);
  }

  buildInto(group, { castShadow = false, receiveShadow = false } = {}) {
    for (const { geometries, material } of this._byKey.values()) {
      if (!geometries.length) continue;
      const merged = mergeGeometries(geometries);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
  }
}
