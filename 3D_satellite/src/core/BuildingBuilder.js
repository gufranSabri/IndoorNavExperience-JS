import * as THREE from '../vendor/three.module.js';
import {
  BASE_HEIGHT,
  BASE_MARGIN,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_CORNER_RADIUS,
  ROOM_HEIGHT,
  ROOM_GAP,
  ROOM_CORNER_RADIUS,
  VOID_CORNER_RADIUS,
  COLORS,
  VOID_COLOR,
  CATEGORY_STYLE,
  CATEGORY_TINT,
  OPEN_CATEGORIES,
  OBJECT_STYLE,
} from './constants.js';
import {
  cleanPolygon,
  offsetPolygon,
  roundPolygon,
  miterRing,
  poleOfInaccessibility,
  polygonBounds,
  signedArea,
} from './polygon.js';
import { makeShape, extrude } from './shapes.js';
import { mergeGeometries } from './geometryMerge.js';
import { buildStairs } from './StairsBuilder.js';

// ---- boundary walls --------------------------------------------------

// Position along a ring (an array of {x,z}) by perimeter distance.
function makeRingSampler(ring) {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[n];
  return {
    perimeter,
    cum,
    at(u) {
      const uu = ((u % perimeter) + perimeter) % perimeter;
      let i = 0;
      while (i < n - 1 && cum[i + 1] <= uu) i++;
      const f = (uu - cum[i]) / (cum[i + 1] - cum[i] || 1);
      const a = ring[i];
      const b = ring[(i + 1) % n];
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    },
  };
}

// Turns each door on an external wall into an interval of perimeter distance
// along the boundary, so the wall ribbon can be opened up there.
function doorGaps(boundary, sampler, doors) {
  const n = boundary.length;
  const gaps = [];
  for (const door of doors) {
    const mid = { x: (door.a.x + door.b.x) / 2, z: (door.a.z + door.b.z) / 2 };
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % n];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((mid.x - a.x) * ex + (mid.z - a.z) * ez) / len2));
      const dist = Math.hypot(mid.x - (a.x + ex * t), mid.z - (a.z + ez * t));
      if (!best || dist < best.dist) best = { i, dist, len: Math.sqrt(len2), ex, ez, a };
    }
    if (!best || best.dist > 1) continue;
    const proj = (p) => ((p.x - best.a.x) * best.ex + (p.z - best.a.z) * best.ez) / best.len;
    const s = Math.max(0, Math.min(proj(door.a), proj(door.b)));
    const e = Math.min(best.len, Math.max(proj(door.a), proj(door.b)));
    if (e - s > 0.1) gaps.push([sampler.cum[best.i] + s, sampler.cum[best.i] + e]);
  }
  gaps.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else merged.push(g.slice());
  }
  return merged;
}

function buildWallGeometry(boundary, doors) {
  const outer = miterRing(boundary, WALL_THICKNESS / 2);
  const inner = miterRing(boundary, -WALL_THICKNESS / 2);
  const sampler = makeRingSampler(boundary);
  const outerSampler = makeRingSampler(outer);
  const innerSampler = makeRingSampler(inner);
  const gaps = doorGaps(boundary, sampler, doors);

  if (!gaps.length) return extrude(makeShape(outer, [inner]), WALL_HEIGHT);

  // Ring positions are index-aligned, so perimeter fractions carry over from
  // the centerline to the outer/inner ribbons (scaled to each ring's length).
  const P = sampler.perimeter;
  const geometries = [];
  for (let k = 0; k < gaps.length; k++) {
    const u0 = gaps[k][1];
    let u1 = gaps[(k + 1) % gaps.length][0];
    if (u1 <= u0) u1 += P;
    if (u1 - u0 < 0.1) continue;
    const chain = (ringSampler, ring) => {
      const scale = ringSampler.perimeter / P;
      const pts = [ringSampler.at(u0 * scale)];
      for (let i = 0; i < boundary.length; i++) {
        for (const m of [0, 1]) {
          const cu = sampler.cum[i] + m * P;
          if (cu > u0 + 1e-6 && cu < u1 - 1e-6) pts.push(ring[i]);
        }
      }
      pts.push(ringSampler.at(u1 * scale));
      return pts;
    };
    const a = chain(outerSampler, outer);
    const b = chain(innerSampler, inner).reverse();
    geometries.push(extrude(makeShape([...a, ...b]), WALL_HEIGHT));
  }
  return geometries.length ? mergeGeometries(geometries) : null;
}

// ---- rooms -----------------------------------------------------------

function roomBaseColor(category) {
  const tint = new THREE.Color((CATEGORY_STYLE[category] || CATEGORY_STYLE.default).color);
  return new THREE.Color(COLORS.room).lerp(tint, CATEGORY_TINT);
}

// Splits the editor's rooms into solid `rooms` and label-only `areas`
// (open floor such as open offices, which stay unbuilt).
function buildRooms(floorDoc, projector) {
  const rooms = [];
  const areas = [];
  for (const room of floorDoc.elements?.rooms || []) {
    if (room.id === 'floor-space' || room.category === 'floor_space') continue; // open space stays empty
    if (room.status && room.status !== 'active') continue;
    const world = cleanPolygon((room.polygon || []).map((p) => projector.toWorldArr(p)));
    if (world.length < 3) continue;

    const category = room.category || null;
    const pole = poleOfInaccessibility(world);
    const common = {
      id: room.id,
      nodeId: `room-${room.id}`,
      name: room.name || 'Room',
      category,
      style: CATEGORY_STYLE[category] || CATEGORY_STYLE.default,
      polygon: world,
      bounds: polygonBounds(world),
      area: Math.abs(signedArea(world)),
      center: { x: pole.x, z: pole.z },
      radius: pole.radius,
    };

    if (OPEN_CATEGORIES.includes(category)) {
      areas.push({ ...common, height: 0, mesh: null });
      continue;
    }

    // A hair of inset on every side: two rooms sharing a wall end up
    // ROOM_GAP apart, which is what draws the "wall" between them. Corners are rounded.
    const inset = offsetPolygon(world, -ROOM_GAP / 2);
    if (inset.length < 3 || Math.abs(signedArea(inset)) < 0.5) continue;
    const footprint = roundPolygon(inset, ROOM_CORNER_RADIUS);

    const restricted = category === 'non_traversable';
    const height = restricted ? ROOM_HEIGHT * 0.35 : ROOM_HEIGHT;
    const geometry = extrude(makeShape(footprint), height);

    const baseColor = roomBaseColor(category || 'default');
    const material = new THREE.MeshStandardMaterial({
      color: baseColor.clone(),
      roughness: 0.78,
      metalness: 0.04,
      emissive: new THREE.Color(COLORS.accent),
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = BASE_HEIGHT;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: COLORS.hover, transparent: true, opacity: 0, depthWrite: false })
    );
    edges.visible = false;
    edges.renderOrder = 30;
    mesh.add(edges);

    const record = {
      ...common,
      style: restricted ? CATEGORY_STYLE.non_traversable : common.style,
      restricted,
      mesh,
      edges,
      material,
      baseColor,
      height,
      // Animated visual state (see SatelliteView._updateRoomStates).
      state: { hover: 0, glass: 0, accent: 0, select: 0 },
      target: { hover: 0, glass: 0, accent: 0, select: 0 },
    };
    mesh.userData.room = record;
    rooms.push(record);
  }
  return { rooms, areas };
}

// ---- assembly --------------------------------------------------------

export function buildBuilding(floorDoc, projector) {
  const root = new THREE.Group();
  root.name = 'building';

  const boundary = roundPolygon(
    cleanPolygon((floorDoc.boundary || []).map((p) => projector.toWorldArr(p))),
    WALL_CORNER_RADIUS
  );
  const externalIds = new Set(
    (floorDoc.elements?.walls || []).filter((w) => w.class === 'Wall External').map((w) => w.id)
  );
  const externalDoors = (floorDoc.elements?.doors || [])
    .filter((d) => externalIds.has(d.wall_id))
    .map((d) => ({ a: projector.toWorldArr(d.start), b: projector.toWorldArr(d.end) }));

  // Openings in the floor (atria / stairwells). The base is cut open there and
  // a dark shaft, with the stairs inside it, sits underneath.
  const openings = (floorDoc.elements?.floor_scope?.exclusion_areas || [])
    .map((area) => roundPolygon(cleanPolygon((area.polygon || []).map((p) => projector.toWorldArr(p))), VOID_CORNER_RADIUS))
    .filter((outline) => outline.length >= 3);

  const stairs = buildStairs(floorDoc.elements?.floor_scope, projector, { floorY: BASE_HEIGHT });
  root.add(stairs.group);

  // Base plinth: the building's own outline, a little larger, rounded.
  const baseOutline = offsetPolygon(boundary, BASE_MARGIN, { join: 'round' });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.9, metalness: 0.02 });
  const base = new THREE.Mesh(extrude(makeShape(baseOutline, openings), BASE_HEIGHT, 0.09), baseMaterial);
  base.name = 'base';
  base.castShadow = true; // so the stairwell's rim shades the stairs
  base.receiveShadow = true;
  root.add(base);

  // The stairwell itself: an open-topped black shaft, only its inside faces drawn.
  const voidMaterial = new THREE.MeshStandardMaterial({ color: VOID_COLOR, roughness: 1, metalness: 0, side: THREE.BackSide });
  const wellBottom = Math.min(stairs.bottomY - 0.5, -1.2);
  for (const outline of openings) {
    const shaft = new THREE.Mesh(extrude(makeShape(outline), -wellBottom, 0), voidMaterial);
    shaft.position.y = wellBottom;
    shaft.receiveShadow = true;
    shaft.name = 'stairwell';
    root.add(shaft);
  }

  // Boundary walls.
  const wallGeometry = buildWallGeometry(boundary, externalDoors);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.5,
    metalness: 0.06,
    emissive: 0x15171a,
  });
  let wallMesh = null;
  if (wallGeometry) {
    wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.name = 'boundary-walls';
    wallMesh.position.y = BASE_HEIGHT;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    root.add(wallMesh);
  }

  // Rooms.
  const roomGroup = new THREE.Group();
  roomGroup.name = 'rooms';
  const { rooms, areas } = buildRooms(floorDoc, projector);
  for (const room of rooms) roomGroup.add(room.mesh);
  root.add(roomGroup);

  // Point objects (exits, elevators...) — data only; they are drawn as
  // labels, not geometry.
  const objects = [];
  for (const [className, items] of Object.entries(floorDoc.objects || {})) {
    const style = OBJECT_STYLE[className] || OBJECT_STYLE.default;
    items.forEach((item, index) => {
      const pos = projector.toWorld(item.x, item.y);
      objects.push({ id: `${className}-${index}`, className, name: item.label || style.label, style, x: pos.x, z: pos.z });
    });
  }

  const box = new THREE.Box3().setFromPoints(baseOutline.map((p) => new THREE.Vector3(p.x, 0, p.z)));
  box.max.y = BASE_HEIGHT + WALL_HEIGHT;

  return {
    root,
    rooms,
    areas,
    roomGroup,
    objects,
    boundary,
    outline: baseOutline,
    walls: wallMesh,
    bounds: box,
    heightAt: stairs.heightAt,
    materials: { base: baseMaterial, wall: wallMaterial },
  };
}
