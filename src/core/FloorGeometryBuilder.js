import * as THREE from '../vendor/three.module.js';
import {
  WALL_THICKNESS,
  WALL_HEIGHT_EXTERNAL,
  WALL_HEIGHT_INTERNAL,
  DOOR_HEADER_HEIGHT,
  BASEBOARD_HEIGHT,
  WALL_CAP_HEIGHT,
  WALL_COLOR_EXTERNAL,
  WALL_COLOR_INTERNAL,
  BASEBOARD_COLOR,
  WALL_CAP_COLOR,
  DOOR_FRAME_COLOR,
  EXCLUSION_COLOR,
  EXCLUSION_OPACITY,
  OBJECT_COLORS,
  FLOOR_TILE_METERS,
  CEILING_HEIGHT,
  CEILING_TILE_METERS,
  CEILING_COLOR,
  INTERIOR_LIGHT_SPACING,
  INTERIOR_LIGHT_HEIGHT_OFFSET,
  INTERIOR_LIGHT_COLOR,
  INTERIOR_LIGHT_INTENSITY,
  INTERIOR_LIGHT_DISTANCE,
  INTERIOR_LIGHT_MAX_COUNT,
  DOOR_OPEN_DISTANCE,
  DOOR_CLOSE_DISTANCE,
  DOOR_SLIDE_SPEED,
  DOOR_LEAF_MARGIN,
  GLASS_DOOR_COLOR,
} from './constants.js';
import { pointInPolygon } from './coords.js';
import { createLabelSprite } from './labelSprite.js';
import {
  createFloorTileTexture,
  createCeilingTileTexture,
  createWallNoiseTexture,
  applyPlanarUV,
} from './textures.js';
import { mergeGeometries, bakeTransform, MergedMeshBuilder } from './geometryMerge.js';

const wallNoiseTexture = createWallNoiseTexture();
wallNoiseTexture.repeat.set(4, 2);

// A cheap "glass" look: plain transparency instead of MeshPhysicalMaterial's
// `transmission`, which forces an extra offscreen render pass per object —
// fine for a couple of panels on desktop, expensive with a whole floor of
// sliding doors on a phone GPU. Shared by every leaf, rendered as one
// InstancedMesh (see buildWallGroup), so this material is bound only once.
const glassLeafMaterial = new THREE.MeshStandardMaterial({
  color: GLASS_DOOR_COLOR,
  transparent: true,
  opacity: 0.45,
  roughness: 0.15,
  metalness: 0.2,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Reused scratch objects for composing InstancedMesh matrices every frame
// without allocating.
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);

// Flat (extruded-thin) shapes use this helper so every polygon in the scene
// shares one convention: a THREE.Shape lives in an (x, y) plane, and after
// rotateX(-PI/2) that plane becomes the world's flat (x, z) ground plane.
// Feeding y = -worldZ here cancels that rotation's sign flip so a shape's
// on-screen footprint matches the wall/path/object geometry built directly
// in world space elsewhere in this file.
function toShapeVec2(worldPoint) {
  return new THREE.Vector2(worldPoint.x, -worldPoint.z);
}

function flatGeometry(worldPoints, { thickness = 0.03, y = 0, planarUVWorldSize = null } = {}) {
  if (worldPoints.length < 3) return null;
  const shape = new THREE.Shape(worldPoints.map(toShapeVec2));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  if (planarUVWorldSize) applyPlanarUV(geometry, planarUVWorldSize);
  if (y) geometry.translate(0, y, 0);
  return geometry;
}

function flatMesh(worldPoints, options = {}) {
  const {
    thickness = 0.03,
    color,
    opacity = 1,
    y = 0,
    map = null,
    bumpMap = null,
    planarUVWorldSize = null,
    roughness = 0.9,
    metalness = 0.02,
    side = THREE.FrontSide,
  } = options;
  const geometry = flatGeometry(worldPoints, { thickness, planarUVWorldSize });
  if (!geometry) return null;

  const material = new THREE.MeshStandardMaterial({
    color,
    map,
    bumpMap,
    bumpScale: bumpMap ? 0.006 : 0,
    roughness,
    metalness,
    transparent: opacity < 1,
    opacity,
    side,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function projectPointOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  return t;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1] + 0.02) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

function setLeafMatrix(leaf, openAmount) {
  const p = leaf.baseParam + leaf.sign * leaf.travel * openAmount;
  _position.set(leaf.ax + leaf.cos * p, leaf.y, leaf.az + leaf.sin * p);
  _quaternion.setFromAxisAngle(_yAxis, leaf.rotationY);
  _scale.set(leaf.width, leaf.height, leaf.depth);
  _matrix.compose(_position, _quaternion, _scale);
  leaf.instancedMesh.setMatrixAt(leaf.index, _matrix);
}

// Walls, baseboards, ceiling-line caps, and door frames are all static once
// built, so every piece is baked (translated/rotated into world space) and
// merged into one Mesh per material — a few draw calls instead of one per
// wall segment. Sliding glass leaves are the one genuinely dynamic part, so
// they're a single InstancedMesh whose per-instance matrices get rewritten
// as doors open/close instead of moving separate Mesh objects.
function buildWallGroup(walls, doors, projector) {
  const group = new THREE.Group();
  group.name = 'walls';
  const doorStates = [];
  const pendingLeaves = [];
  const doorsByWall = new Map();
  for (const door of doors) {
    if (!doorsByWall.has(door.wall_id)) doorsByWall.set(door.wall_id, []);
    doorsByWall.get(door.wall_id).push(door);
  }

  const extMat = new THREE.MeshStandardMaterial({
    color: WALL_COLOR_EXTERNAL,
    roughness: 0.82,
    metalness: 0.08,
    roughnessMap: wallNoiseTexture,
  });
  const intMat = new THREE.MeshStandardMaterial({
    color: WALL_COLOR_INTERNAL,
    roughness: 0.88,
    metalness: 0.03,
    roughnessMap: wallNoiseTexture,
  });
  const baseboardMat = new THREE.MeshStandardMaterial({ color: BASEBOARD_COLOR, roughness: 0.6, metalness: 0.15 });
  const capMat = new THREE.MeshStandardMaterial({ color: WALL_CAP_COLOR, roughness: 0.4, metalness: 0.35 });
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: DOOR_FRAME_COLOR, roughness: 0.35, metalness: 0.5 });

  const builder = new MergedMeshBuilder();

  for (const wall of walls) {
    const [p1px, p2px] = wall.points;
    const a = projector.toWorldArr(p1px);
    const b = projector.toWorldArr(p2px);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;

    const isExternal = wall.class === 'Wall External';
    const height = isExternal ? WALL_HEIGHT_EXTERNAL : WALL_HEIGHT_INTERNAL;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const wallDoors = doorsByWall.get(wall.id) || [];
    const gaps = wallDoors.map((door) => {
      const ds = projector.toWorldArr(door.start);
      const de = projector.toWorldArr(door.end);
      const t1 = projectPointOnSegment(ds, a, b) * length;
      const t2 = projectPointOnSegment(de, a, b) * length;
      return [Math.max(0, Math.min(t1, t2)), Math.min(length, Math.max(t1, t2))];
    });
    const merged = mergeIntervals(gaps);

    const solidSegments = [];
    let cursor = 0;
    for (const [gs, ge] of merged) {
      if (gs - cursor > 0.05) solidSegments.push([cursor, gs]);
      cursor = Math.max(cursor, ge);
    }
    if (length - cursor > 0.05) solidSegments.push([cursor, length]);
    if (solidSegments.length === 0 && merged.length === 0) solidSegments.push([0, length]);

    for (const [s, e] of solidSegments) {
      const segLen = e - s;
      if (segLen <= 0.02) continue;
      const mid = (s + e) / 2;
      const cx = a.x + cos * mid;
      const cz = a.z + sin * mid;
      const rotationY = -angle;

      const wallGeo = bakeTransform(new THREE.BoxGeometry(segLen, height, WALL_THICKNESS), {
        x: cx,
        y: height / 2,
        z: cz,
        rotationY,
      });
      builder.add(isExternal ? 'wall-external' : 'wall-internal', wallGeo, isExternal ? extMat : intMat);

      const baseboardGeo = bakeTransform(new THREE.BoxGeometry(segLen, BASEBOARD_HEIGHT, WALL_THICKNESS + 0.015), {
        x: cx,
        y: BASEBOARD_HEIGHT / 2,
        z: cz,
        rotationY,
      });
      builder.add('baseboard', baseboardGeo, baseboardMat);

      const capGeo = bakeTransform(new THREE.BoxGeometry(segLen, WALL_CAP_HEIGHT, WALL_THICKNESS + 0.01), {
        x: cx,
        y: height - WALL_CAP_HEIGHT / 2,
        z: cz,
        rotationY,
      });
      builder.add('cap', capGeo, capMat);
    }

    // Doors: a header (lintel) bridging each gap, jamb posts framing it —
    // all static, merged in with the rest — and two sliding glass leaves
    // (collected here, built as one InstancedMesh once the total count
    // across every door on this floor is known).
    for (const [gs, ge] of merged) {
      const gapLen = ge - gs;
      if (gapLen <= 0.05) continue;
      const mid = (gs + ge) / 2;
      const rotationY = -angle;
      const leafHeight = height - DOOR_HEADER_HEIGHT - 0.04;

      const headerGeo = bakeTransform(new THREE.BoxGeometry(gapLen, DOOR_HEADER_HEIGHT, WALL_THICKNESS * 0.95), {
        x: a.x + cos * mid,
        y: height - DOOR_HEADER_HEIGHT / 2,
        z: a.z + sin * mid,
        rotationY,
      });
      builder.add('door-frame', headerGeo, doorFrameMat);

      for (const jambParam of [gs, ge]) {
        const jambGeo = bakeTransform(new THREE.BoxGeometry(0.04, leafHeight, WALL_THICKNESS), {
          x: a.x + cos * jambParam,
          y: leafHeight / 2,
          z: a.z + sin * jambParam,
          rotationY,
        });
        builder.add('door-frame', jambGeo, doorFrameMat);
      }

      const leafWidth = Math.max(0.05, (gapLen - DOOR_LEAF_MARGIN) / 2);
      const leafThickness = WALL_THICKNESS * 0.55;
      const leftBaseParam = gs + leafWidth / 2;
      const rightBaseParam = ge - leafWidth / 2;

      const leafCommon = { ax: a.x, az: a.z, cos, sin, y: leafHeight / 2, width: leafWidth, height: leafHeight, depth: leafThickness, rotationY };
      const leftLeaf = { ...leafCommon, baseParam: leftBaseParam, sign: -1, travel: leafWidth };
      const rightLeaf = { ...leafCommon, baseParam: rightBaseParam, sign: 1, travel: leafWidth };
      pendingLeaves.push(leftLeaf, rightLeaf);

      doorStates.push({
        center: { x: a.x + cos * mid, z: a.z + sin * mid },
        openAmount: 0,
        leaves: [leftLeaf, rightLeaf],
      });
    }
  }

  builder.buildInto(group, { castShadow: true, receiveShadow: true });

  let instancedLeaves = null;
  if (pendingLeaves.length > 0) {
    instancedLeaves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glassLeafMaterial, pendingLeaves.length);
    instancedLeaves.name = 'glass-door-leaves';
    pendingLeaves.forEach((leaf, index) => {
      leaf.instancedMesh = instancedLeaves;
      leaf.index = index;
      setLeafMatrix(leaf, 0);
    });
    instancedLeaves.instanceMatrix.needsUpdate = true;
    // InstancedMesh's default frustum-culling bounds come from the base
    // (unit-box) geometry alone, not the spread of per-instance transforms —
    // without this, doors far from world-origin can vanish incorrectly.
    // Sliding motion stays within a door's own gap, well inside this margin.
    instancedLeaves.computeBoundingSphere();
    group.add(instancedLeaves);
  }

  return { group, doorStates, instancedLeaves };
}

// Advances every door's open/closed animation toward the walker's current
// (x, z) position. Called once per frame from WayfindingView — proximity
// alone drives it, so doors work the same whether the view is in first-person
// or the distant overview (where they simply never get close enough to open).
// Skips any door that's already settled at its target, and only touches the
// shared InstancedMesh's GPU buffer when at least one leaf actually moved.
export function updateDoorStates(doorStates, instancedLeaves, viewerX, viewerZ, dt) {
  let anyChanged = false;
  for (const door of doorStates) {
    const dx = viewerX - door.center.x;
    const dz = viewerZ - door.center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const threshold = door.openAmount > 0 ? DOOR_CLOSE_DISTANCE : DOOR_OPEN_DISTANCE;
    const target = dist < threshold ? 1 : 0;
    const diff = target - door.openAmount;
    if (Math.abs(diff) < 1e-4) continue;

    const step = Math.sign(diff) * Math.min(Math.abs(diff), DOOR_SLIDE_SPEED * dt);
    door.openAmount = Math.min(1, Math.max(0, door.openAmount + step));
    anyChanged = true;
    for (const leaf of door.leaves) setLeafMatrix(leaf, door.openAmount);
  }
  if (anyChanged && instancedLeaves) instancedLeaves.instanceMatrix.needsUpdate = true;
}

function buildFloorScopeGroup(floorScope, projector) {
  const group = new THREE.Group();
  group.name = 'floor-scope';
  const exclusionPolygons = [];
  if (!floorScope) return { group, exclusionPolygons };

  // Only exclusion areas (real voids/atria) get a visual — stair/landing
  // geometry is routing-only metadata and isn't rendered as a distinct shape.
  for (const area of floorScope.exclusion_areas || []) {
    const worldPoints = (area.polygon || []).map((p) => projector.toWorldArr(p));
    exclusionPolygons.push(worldPoints);
    const mesh = flatMesh(worldPoints, {
      thickness: 0.04,
      color: EXCLUSION_COLOR,
      y: 0.008,
      opacity: EXCLUSION_OPACITY,
      roughness: 0.95,
      metalness: 0,
    });
    if (mesh) group.add(mesh);
  }

  return { group, exclusionPolygons };
}

function buildCeiling(outerWorld, ceilingTexture) {
  const mesh = flatMesh(outerWorld, {
    thickness: 0.08,
    color: CEILING_COLOR,
    y: CEILING_HEIGHT, // bottom face sits flush with the top of the walls
    map: ceilingTexture.map,
    planarUVWorldSize: ceilingTexture.worldSize,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (mesh) {
    mesh.name = 'ceiling';
    mesh.castShadow = false;
  }
  const group = new THREE.Group();
  group.name = 'ceiling-group';
  if (mesh) group.add(mesh);
  return group;
}

function buildInteriorLights(outerWorld, exclusionPolygons) {
  const group = new THREE.Group();
  group.name = 'interior-lights';
  const lights = [];
  if (outerWorld.length < 3) return { group, lights };

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of outerWorld) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const fixtureMaterial = new THREE.MeshBasicMaterial({ color: INTERIOR_LIGHT_COLOR });
  const lightY = CEILING_HEIGHT - INTERIOR_LIGHT_HEIGHT_OFFSET;
  const fixtureGeometries = [];

  let count = 0;
  for (let x = minX + INTERIOR_LIGHT_SPACING / 2; x < maxX && count < INTERIOR_LIGHT_MAX_COUNT; x += INTERIOR_LIGHT_SPACING) {
    for (let z = minZ + INTERIOR_LIGHT_SPACING / 2; z < maxZ && count < INTERIOR_LIGHT_MAX_COUNT; z += INTERIOR_LIGHT_SPACING) {
      const point = { x, z };
      if (!pointInPolygon(point, outerWorld)) continue;
      if (exclusionPolygons.some((poly) => pointInPolygon(point, poly))) continue;

      const light = new THREE.PointLight(
        INTERIOR_LIGHT_COLOR,
        INTERIOR_LIGHT_INTENSITY,
        INTERIOR_LIGHT_DISTANCE,
        2
      );
      light.position.set(x, lightY, z);
      light.visible = false; // activated per-frame only near the walker — see cullInteriorLights()
      group.add(light);
      lights.push(light);

      const fixtureGeo = new THREE.CircleGeometry(0.22, 20);
      fixtureGeo.rotateX(Math.PI / 2);
      fixtureGeo.translate(x, lightY + 0.01, z);
      fixtureGeometries.push(fixtureGeo);

      count += 1;
    }
  }

  if (fixtureGeometries.length) {
    const fixturesMesh = new THREE.Mesh(mergeGeometries(fixtureGeometries), fixtureMaterial);
    fixturesMesh.name = 'light-fixtures';
    group.add(fixturesMesh);
  }

  return { group, lights };
}

function buildObjectsGroup(objects, projector) {
  const group = new THREE.Group();
  group.name = 'objects';
  for (const [className, items] of Object.entries(objects || {})) {
    const color = OBJECT_COLORS[className] ?? OBJECT_COLORS.default;
    for (const item of items) {
      const pos = projector.toWorld(item.x, item.y);
      const pin = new THREE.Group();

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.1, 10),
        new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 })
      );
      pole.position.y = 0.55;
      pin.add(pole);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 16),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
      );
      head.position.y = 1.15;
      pin.add(head);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.26, 32),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      pin.add(ring);

      const labelText = item.label || className;
      const label = createLabelSprite(labelText);
      label.position.y = 1.55;
      pin.add(label);

      pin.position.set(pos.x, 0, pos.z);
      pin.userData = { className, label: item.label || null };
      group.add(pin);
    }
  }
  return group;
}

export function buildFloorScene(floorDocument, projector) {
  const { boundary, elements, objects } = floorDocument;
  const root = new THREE.Group();
  root.name = 'floor-root';

  const outerWorld = (boundary || []).map((p) => projector.toWorldArr(p));
  const { map: tileMap, bumpMap: tileBumpMap, worldSize: tileWorldSize } = createFloorTileTexture({
    tileMeters: FLOOR_TILE_METERS,
  });
  const slabThickness = 0.06;
  const slab = flatMesh(outerWorld, {
    thickness: slabThickness,
    color: 0xffffff,
    y: -slabThickness, // top face sits exactly at y=0, below every overlay (rooms, exclusion zones)
    map: tileMap,
    bumpMap: tileBumpMap,
    planarUVWorldSize: tileWorldSize,
    roughness: 0.72,
    metalness: 0.02,
  });
  if (slab) {
    slab.name = 'floor-slab';
    root.add(slab);
  }

  const { group: wallGroup, doorStates, instancedLeaves } = buildWallGroup(
    elements?.walls || [],
    elements?.doors || [],
    projector
  );
  root.add(wallGroup);

  const { group: floorScopeGroup, exclusionPolygons } = buildFloorScopeGroup(elements?.floor_scope, projector);
  root.add(floorScopeGroup);

  root.add(buildObjectsGroup(objects || {}, projector));

  const ceilingTexture = createCeilingTileTexture({ tileMeters: CEILING_TILE_METERS });
  const ceilingGroup = buildCeiling(outerWorld, ceilingTexture);
  ceilingGroup.visible = false; // shown only once the walker goes first-person — see WayfindingView
  root.add(ceilingGroup);

  const { group: interiorLightsGroup, lights: interiorLights } = buildInteriorLights(outerWorld, exclusionPolygons);
  interiorLightsGroup.visible = false;
  root.add(interiorLightsGroup);

  const box = new THREE.Box3().setFromObject(root);
  return { root, boundingBox: box, doorStates, instancedLeaves, ceilingGroup, interiorLightsGroup, interiorLights };
}

// Only lights within range of the walker are turned on each frame — with a
// grid covering the whole floor there can be dozens of fixtures, and every
// *visible* THREE.Light adds a per-fragment shading term, so capping how
// many are ever simultaneously active keeps this cheap regardless of floor
// size. Called every frame; cheap since it's just a distance check per light.
export function cullInteriorLights(lights, viewerX, viewerZ, activeRadius) {
  const r2 = activeRadius * activeRadius;
  for (const light of lights) {
    const dx = light.position.x - viewerX;
    const dz = light.position.z - viewerZ;
    light.visible = dx * dx + dz * dz < r2;
  }
}
