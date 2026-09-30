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
  DEFAULT_VOID_DEPTH,
  RENDER_MODE,
  SKIP_ROOM_IDS,
  OBJECT_STYLE,
  DEFAULT_START,
  KIOSK,
} from './constants.js';
import {
  cleanPolygon,
  offsetPolygon,
  roundPolygon,
  miterRing,
  poleOfInaccessibility,
  polygonBounds,
  signedArea,
  pointInPolygon,
} from './polygon.js';
import { makeShape, extrude } from './shapes.js';
import { mergeGeometries } from './geometryMerge.js';
import { buildKiosk } from './KioskBuilder.js';
import { buildStairs } from './StairsBuilder.js';
import { resolveRoomProfile, profileStyle } from './roomProfiles.js';

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

// Up / down arrows on a dark plate — the elevator roof's marking.
function makeArrowsTexture(colorHex) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const css = `#${new THREE.Color(colorHex).getHexString()}`;
  g.fillStyle = '#0d1424';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = css;
  g.lineWidth = 10;
  g.strokeRect(14, 14, size - 28, size - 28);
  g.fillStyle = '#eef4ff';
  const tri = (cy, dir) => {
    g.beginPath();
    g.moveTo(size / 2, cy - dir * 38);
    g.lineTo(size / 2 + 46, cy + dir * 26);
    g.lineTo(size / 2 - 46, cy + dir * 26);
    g.closePath();
    g.fill();
  };
  tri(size * 0.32, 1); // up
  tri(size * 0.68, -1); // down
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A glowing cap sitting on a block's roof with a marked plate on top of it.
// Returns the meshes so the caller can hide them while the block is glassed.
function buildRoofCap(roof, footprint, height, center, radius) {
  const meshes = [];
  const inner = offsetPolygon(footprint, -roof.inset);
  if (inner.length >= 3 && Math.abs(signedArea(inner)) > 0.5) {
    const capGeometry = extrude(makeShape(roundPolygon(inner, ROOM_CORNER_RADIUS)), roof.thickness, 0.04);
    const cap = new THREE.Mesh(
      capGeometry,
      new THREE.MeshStandardMaterial({ color: roof.color, emissive: roof.color, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.2 })
    );
    cap.position.y = height - 0.02;
    meshes.push(cap);
  }
  const side = Math.min(radius * 1.15, 2.6);
  if (side > 0.6) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(side, side),
      new THREE.MeshBasicMaterial({ map: makeArrowsTexture(roof.color), toneMapped: false })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(center.x, height + roof.thickness + 0.01, center.z);
    meshes.push(plate);
  }
  return meshes;
}

// Closest point on a closed ring to `p`, plus that edge's unit normal pointing out of the ring.
function nearestOnRing(ring, p) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / (len * len)));
    const q = { x: a.x + ex * t, z: a.z + ez * t };
    const dist = Math.hypot(p.x - q.x, p.z - q.z);
    if (!best || dist < best.dist) {
      let nx = -ez / len;
      let nz = ex / len;
      if (pointInPolygon({ x: q.x + nx * 0.05, z: q.z + nz * 0.05 }, ring)) {
        nx = -nx;
        nz = -nz;
      }
      best = { dist, point: q, normal: { x: nx, z: nz } };
    }
  }
  return best;
}

// A sliding double door (frame, two steel panels, a glowing call light above)
// on the block's face at every door opening belonging to the room. Local
// origin is on the floor, x along the face, z pointing out of the block.
function buildDoors(spec, room, footprint, blockHeight, doors, projector) {
  const meshes = [];
  const wallIds = new Set(room.wall_ids || []);
  const height = blockHeight * spec.heightFactor;
  const frameMat = new THREE.MeshStandardMaterial({ color: spec.frame, roughness: 0.5, metalness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({ color: spec.panel, roughness: 0.3, metalness: 0.55 });
  const lightMat = new THREE.MeshBasicMaterial({ color: spec.light, toneMapped: false });
  for (const door of doors) {
    if (!wallIds.has(door.wall_id)) continue;
    const a = projector.toWorldArr(door.start);
    const b = projector.toWorldArr(door.end);
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const hit = nearestOnRing(footprint, mid);
    if (!hit || hit.dist > 2) continue; // the door belongs to a wall on the far side of the room
    const width = Math.max(1, Math.min(3, Math.hypot(b.x - a.x, b.z - a.z)));

    const g = new THREE.Group();
    g.position.set(hit.point.x, 0, hit.point.z);
    g.rotation.y = Math.atan2(hit.normal.x, hit.normal.z);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
    };
    box(width + 0.24, height + 0.12, 0.1, frameMat, 0, (height + 0.12) / 2, 0.02); // frame
    const pw = (width - 0.04) / 2;
    box(pw, height, 0.08, panelMat, -pw / 2 - 0.01, height / 2, 0.08); // left panel
    box(pw, height, 0.08, panelMat, pw / 2 + 0.01, height / 2, 0.08); // right panel
    box(0.03, height, 0.09, frameMat, 0, height / 2, 0.085); // seam
    box(0.5, 0.09, 0.05, lightMat, 0, height + 0.3, 0.05); // call light above the door
    meshes.push(g);
  }
  return meshes;
}

// Splits the editor's rooms, by their profile (see ROOM_PROFILES), into
// interactive `rooms` (RENDER_MODE.BLOCK: clickable, hoverable, take part in
// route highlighting) and `areas` (GLASS: a static translucent box nothing ever
// picks or animates; NONE: nothing built, label only).
function buildRooms(floorDoc, projector) {
  const rooms = [];
  const areas = [];
  for (const room of floorDoc.elements?.rooms || []) {
    if (SKIP_ROOM_IDS.includes(room.id)) continue;
    if (room.status && room.status !== 'active') continue;
    const world = cleanPolygon((room.polygon || []).map((p) => projector.toWorldArr(p)));
    if (world.length < 3) continue;

    const profile = resolveRoomProfile(room);
    const pole = poleOfInaccessibility(world);
    const common = {
      id: room.id,
      nodeId: `room-${room.id}`,
      name: room.name || 'Room',
      category: room.category || null,
      profile,
      navigable: !!room.navigable,
      style: profileStyle(profile),
      polygon: world,
      bounds: polygonBounds(world),
      area: Math.abs(signedArea(world)),
      center: { x: pole.x, z: pole.z },
      radius: pole.radius,
    };

    if (profile.mode === RENDER_MODE.NONE) {
      areas.push({ ...common, height: 0, mesh: null });
      continue;
    }

    if (profile.mode === RENDER_MODE.GLASS) {
      // Shrunk further inward than a normal room's ROOM_GAP inset (profile
      // padding), so the box reads as visibly smaller than its real boundary.
      const inset = offsetPolygon(world, -(ROOM_GAP / 2 + (profile.padding || 0)));
      if (inset.length < 3 || Math.abs(signedArea(inset)) < 0.5) {
        areas.push({ ...common, height: 0, mesh: null });
        continue;
      }
      const geometry = extrude(makeShape(roundPolygon(inset, ROOM_CORNER_RADIUS)), profile.height);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(profile.fill),
        roughness: 0.6,
        metalness: 0.04,
        transparent: true,
        opacity: profile.opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = BASE_HEIGHT;
      mesh.renderOrder = 20;
      if (profile.edge != null) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 30),
          new THREE.LineBasicMaterial({ color: profile.edge, transparent: true, opacity: 1, depthWrite: false })
        );
        edges.renderOrder = 30;
        mesh.add(edges);
      }
      areas.push({ ...common, height: profile.height, mesh });
      continue;
    }

    // BLOCK. A hair of inset on every side: two rooms sharing a wall end up
    // ROOM_GAP apart, which is what draws the "wall" between them. Corners are rounded.
    const inset = offsetPolygon(world, -ROOM_GAP / 2);
    if (inset.length < 3 || Math.abs(signedArea(inset)) < 0.5) continue;
    const footprint = roundPolygon(inset, ROOM_CORNER_RADIUS);

    const height = profile.height;
    const geometry = extrude(makeShape(footprint), height);

    const baseColor = new THREE.Color(profile.fill);
    const hasEdge = profile.edge != null;
    const emissiveFloor = 0; // the emissive is the route-red (see _updateRoomStates), never a resting glow
    const material = new THREE.MeshStandardMaterial({
      color: baseColor.clone(),
      roughness: profile.roughness ?? 0.78,
      metalness: profile.metalness ?? 0.04,
      emissive: new THREE.Color(COLORS.destination),
      emissiveIntensity: emissiveFloor,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = BASE_HEIGHT;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Edges are hidden unless the profile sets one, or the room is on a route
    // (SatelliteView._updateRoomStates fades them in).
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: hasEdge ? profile.edge : COLORS.hover, transparent: true, opacity: hasEdge ? 1 : 0, depthWrite: false })
    );
    edges.visible = hasEdge;
    edges.renderOrder = 30;
    mesh.add(edges);

    // Optional extras standing on the roof (see profile.roof); hidden while the
    // block is glassed for a route (SatelliteView._updateRoomStates).
    const decor = profile.roof ? buildRoofCap(profile.roof, footprint, height, common.center, common.radius) : [];
    if (profile.door) {
      decor.push(...buildDoors(profile.door, room, footprint, height, floorDoc.elements?.doors || [], projector));
    }
    for (const d of decor) {
      d.castShadow = d.receiveShadow = false;
      mesh.add(d);
    }

    const record = {
      ...common,
      decor,
      mesh,
      edges,
      material,
      baseColor,
      height,
      outlineFloor: hasEdge ? 1 : 0,
      emissiveFloor,
      // Animated visual state (see SatelliteView._updateRoomStates): hover on
      // pointer-over, glass+accent while part of an active route.
      state: { hover: 0, glass: 0, accent: 0 },
      target: { hover: 0, glass: 0, accent: 0 },
    };
    mesh.userData.room = record;
    rooms.push(record);
  }
  return { rooms, areas };
}

// ---- assembly --------------------------------------------------------

export function buildBuilding(floorDoc, projector, pointObjects = floorDoc.objects) {
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

  const floorScope = floorDoc.elements?.floor_scope;
  // A plain user toggle on the Floor Scope page: whether this floor has
  // nothing below it. Everywhere else it governs how a floor's exclusion
  // zones (atria/stairwells) are built — see buildStairs.
  const isLowestFloor = !!floorScope?.is_lowest_floor;

  const stairs = buildStairs(floorScope, projector, { floorY: BASE_HEIGHT, isLowestFloor });
  root.add(stairs.group);

  // Openings in the floor (atria / stairwells) only make sense where there is
  // a real floor below to reveal — on the lowest floor the same zones instead
  // just carry stairs climbing up out of solid ground (see buildStairs).
  const exclusionAreas = floorScope?.exclusion_areas || [];
  const openings = isLowestFloor
    ? []
    : exclusionAreas
        .map((area) => ({
          id: area.id,
          outline: roundPolygon(cleanPolygon((area.polygon || []).map((p) => projector.toWorldArr(p))), VOID_CORNER_RADIUS),
        }))
        .filter((o) => o.outline.length >= 3);

  // Base plinth: the building's own outline, a little larger, rounded.
  const baseOutline = offsetPolygon(boundary, BASE_MARGIN, { join: 'round' });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.9, metalness: 0.02 });
  const base = new THREE.Mesh(
    extrude(makeShape(baseOutline, openings.map((o) => o.outline)), BASE_HEIGHT, 0.09),
    baseMaterial
  );
  base.name = 'base';
  base.castShadow = true; // so a stairwell's rim shades the stairs below it
  base.receiveShadow = true;
  root.add(base);

  // Each stairwell: an open-topped black shaft, only its inside faces drawn,
  // sized to how deep that particular zone's own stairs actually go.
  const voidMaterial = new THREE.MeshStandardMaterial({ color: VOID_COLOR, roughness: 1, metalness: 0, side: THREE.BackSide });
  for (const { id, outline } of openings) {
    const zoneBottom = stairs.zoneDepths.get(id) ?? BASE_HEIGHT + DEFAULT_VOID_DEPTH;
    const wellBottom = Math.min(zoneBottom - 0.5, BASE_HEIGHT - 1.2);
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
    wallMesh.userData = { ring: boundary, baseY: BASE_HEIGHT, topY: BASE_HEIGHT + WALL_HEIGHT }; // for cheap label occlusion (core/screen.js)
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

  // Glass areas: a static translucent box each, deliberately outside
  // roomGroup so picking (SatelliteView._pick) never selects one.
  const areaGroup = new THREE.Group();
  areaGroup.name = 'glass-areas';
  for (const area of areas) if (area.mesh) areaGroup.add(area.mesh);
  root.add(areaGroup);

  // Point objects (exits, elevators...) — data only; they are drawn as
  // labels, not geometry.
  const objects = [];
  for (const [className, items] of Object.entries(pointObjects || {})) {
    const style = OBJECT_STYLE[className] || OBJECT_STYLE.default;
    items.forEach((item, index) => {
      const pos = projector.toWorld(item.x, item.y);
      objects.push({ id: `${className}-${index}`, className, name: item.label || style.label, style, x: pos.x, z: pos.z });
    });
  }

  // Kiosks: a real 3D model each, screen turned toward the nearest main exit
  // (any exit if the floor has no main one; unturned if it has none at all).
  const exits = objects.filter((o) => o.className === 'exits');
  const mainExits = exits.filter((o) => DEFAULT_START.exitLabel.test(o.name));
  const facingCandidates = mainExits.length ? mainExits : exits;
  for (const object of objects) {
    if (!DEFAULT_START.nodeClass.test(object.className)) continue;
    let target = null;
    let best = Infinity;
    for (const e of facingCandidates) {
      const d = Math.hypot(e.x - object.x, e.z - object.z);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    const kiosk = buildKiosk();
    kiosk.position.set(object.x, stairs.heightAt(object.x, object.z), object.z);
    if (target) kiosk.rotation.y = Math.atan2(target.x - object.x, target.z - object.z);
    root.add(kiosk);
    object.labelHeight = KIOSK.height + 0.3;
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
