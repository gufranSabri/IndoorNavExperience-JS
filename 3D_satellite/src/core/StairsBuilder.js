import * as THREE from '../vendor/three.module.js';
import { cleanPolygon, distanceToPolygon, distanceToSegment } from './polygon.js';
import { makeShape, extrude } from './shapes.js';
import { mergeGeometries } from './geometryMerge.js';
import { STAIR_RISE, STAIR_TREAD, STAIR_LIGHT, STAIR_DARK, DEFAULT_VOID_DEPTH } from './constants.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Keeps the part of a convex polygon where lo <= dot(p - origin, dir) <= hi
// (Sutherland-Hodgman against two half-planes).
function clipToBand(poly, origin, dir, lo, hi) {
  const clip = (pts, sign, limit) => {
    const out = [];
    const side = (p) => sign * ((p.x - origin.x) * dir.x + (p.z - origin.z) * dir.z - limit);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const sa = side(a);
      const sb = side(b);
      if (sa >= 0) out.push(a);
      if (sa >= 0 !== sb >= 0) {
        const t = sa / (sa - sb);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return out;
  };
  return clip(clip(poly, 1, lo), -1, hi);
}

function centroid(poly) {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / poly.length, z: z / poly.length };
}

// Distance from a point to whatever a flight hangs off: earlier-order segments
// in the same exclusion zone, and that zone's own exits.
function distanceToRefs(p, refPolys, exits) {
  let d = Infinity;
  for (const poly of refPolys) d = Math.min(d, Math.abs(distanceToPolygon(p, poly)));
  for (const e of exits) d = Math.min(d, distanceToSegment(p, e.a, e.b));
  return d;
}

// The floor scope's `segments` are stair flights and landings. `order` is a
// vertical sequence number **scoped to one exclusion zone**
// (`exclusion_area_id`) — a floor can have several independent stair cores,
// each numbering its own sequence from 1 (see docs/MAP_DATA_STORAGE.md §5).
// Order-1 flights start at that zone's own exclusion exit; each flight then
// runs on to the next order's segment, so the edge nearest an exit / a
// lower-order segment is always a flight's "near" (floor-level) edge.
//
// On every floor but the lowest, a zone's stairs descend from the floor into
// a shaft dug into the base (there being a real floor below to reveal). On
// the lowest floor there is nothing below, so the same zone instead climbs
// *up* from the floor with no shaft at all — `isLowestFloor` is the one
// switch between the two.
//
// Returns the geometry group, a `heightAt(x, z)` giving the walkable surface
// height at any point (so a route/user dot can follow the stairs), and
// `zoneDepths` — the lowest y each descending zone reaches, keyed by
// `exclusion_area_id`, so the caller can size that zone's stairwell shaft.
export function buildStairs(floorScope, projector, { floorY, isLowestFloor = false } = {}) {
  const allExits = (floorScope?.exclusion_exits || []).map((e) => ({
    areaId: e.exclusion_area_id ?? null,
    a: projector.toWorldArr(e.start),
    b: projector.toWorldArr(e.end),
  }));
  const allSegments = (floorScope?.segments || [])
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      order: s.order ?? 0,
      areaId: s.exclusion_area_id ?? null,
      poly: cleanPolygon((s.polygon || []).map((p) => projector.toWorldArr(p))),
    }))
    .filter((s) => s.poly.length >= 3);

  const group = new THREE.Group();
  group.name = 'stairs';
  if (!allSegments.length) {
    return { group, heightAt: () => floorY, zoneDepths: new Map(), hasStairs: false };
  }

  const direction = isLowestFloor ? 1 : -1; // +1 climbs above the floor, -1 descends below it
  const zoneIds = [...new Set(allSegments.map((s) => s.areaId))];
  const zoneDepths = new Map(); // areaId -> lowest y reached (descending zones only)
  const pieces = [];

  for (const zoneId of zoneIds) {
    const segments = allSegments.filter((s) => s.areaId === zoneId);
    const exits = allExits.filter((e) => e.areaId === zoneId);

    // 1. Geometry of each flight: top edge, direction of travel, run length,
    // step count — the same regardless of which way the flight goes.
    for (const seg of segments) {
      if (seg.kind === 'landing') continue;
      const earlier = segments.filter((o) => o.order < seg.order).map((o) => o.poly);
      const c = centroid(seg.poly);
      let best = null;
      seg.poly.forEach((a, i) => {
        const b = seg.poly[(i + 1) % seg.poly.length];
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const score = distanceToRefs(mid, earlier, exits);
        if (!best || score < best.score) best = { a, b, mid, score };
      });
      const ex = best.b.x - best.a.x;
      const ez = best.b.z - best.a.z;
      const el = Math.hypot(ex, ez) || 1;
      let dir = { x: -ez / el, z: ex / el };
      if ((c.x - best.mid.x) * dir.x + (c.z - best.mid.z) * dir.z < 0) dir = { x: -dir.x, z: -dir.z };
      seg.origin = best.mid;
      seg.dir = dir;
      seg.run = Math.max(...seg.poly.map((p) => (p.x - best.mid.x) * dir.x + (p.z - best.mid.z) * dir.z));
      seg.steps = Math.max(2, Math.round(seg.run / STAIR_TREAD));
    }

    // 2. Levels relative to the floor: `baseLevel` is the level at a
    // segment's near edge, `delta` the signed change over its own run
    // (negative = descending, positive = climbing). Flights sharing an
    // order are parallel branches, so they move by the same amount.
    const orders = [...new Set(segments.map((s) => s.order))].sort((a, b) => a - b);
    let level = 0;
    for (const order of orders) {
      const sameOrder = segments.filter((s) => s.order === order);
      const rise = Math.max(0, ...sameOrder.filter((s) => s.kind !== 'landing').map((s) => s.steps * STAIR_RISE));
      const delta = direction * rise;
      for (const s of sameOrder) {
        s.baseLevel = level;
        s.delta = s.kind === 'landing' ? 0 : delta;
      }
      level += delta;
    }

    // 3. Solids: every step (and landing) shares one base for this zone —
    // the bottom of its shaft when descending, or just the floor when
    // climbing — and extrudes up from it to its own tread height, so a
    // step's riser is exposed above the next one down.
    const zoneBaseY = isLowestFloor ? floorY : floorY + level;
    if (!isLowestFloor) zoneDepths.set(zoneId, zoneBaseY);

    const solid = (poly, topY) => {
      const height = topY - zoneBaseY;
      if (poly.length < 3 || height < 0.05) return;
      const geometry = extrude(makeShape(poly), height, 0.02);
      geometry.translate(0, zoneBaseY, 0);
      pieces.push(geometry);
    };
    for (const s of segments) {
      if (s.kind === 'landing') {
        solid(s.poly, floorY + s.baseLevel);
        continue;
      }
      const stepDelta = s.delta / s.steps;
      for (let j = 0; j < s.steps; j++) {
        const strip = clipToBand(s.poly, s.origin, s.dir, (s.run * j) / s.steps, (s.run * (j + 1)) / s.steps);
        solid(strip, floorY + s.baseLevel + (j + 1) * stepDelta);
      }
    }
  }

  const merged = pieces.length ? mergeGeometries(pieces) : null;
  if (merged) {
    let material;
    if (isLowestFloor) {
      // Climbing into open air, lit like everything else — no pit to fake AO for.
      material = new THREE.MeshStandardMaterial({ color: STAIR_LIGHT, roughness: 0.62, metalness: 0.06 });
    } else {
      // Fade the stone from light at the top of the stairs to black at the
      // bottom of the deepest shaft on this floor — a cheap ambient-occlusion
      // look that gives the depth. Shallower zones simply never reach full black.
      const deepest = Math.min(floorY + DEFAULT_VOID_DEPTH, ...zoneDepths.values());
      const position = merged.attributes.position;
      const colors = new Float32Array(position.count * 3);
      const light = new THREE.Color(STAIR_LIGHT);
      const dark = new THREE.Color(STAIR_DARK);
      const mix = new THREE.Color();
      for (let i = 0; i < position.count; i++) {
        const t = clamp01((position.getY(i) - deepest) / (floorY - deepest || 1));
        mix.copy(dark).lerp(light, Math.pow(t, 1.15));
        colors.set([mix.r, mix.g, mix.b], i * 3);
      }
      merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.06 });
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'stair-steps';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Surface height at a point: interpolated along a flight's run (never past
  // the tread it is over), flat on a landing, the floor everywhere else.
  const heightAt = (x, z) => {
    const p = { x, z };
    let best = null;
    for (const s of allSegments) {
      const d = Math.abs(distanceToPolygon(p, s.poly));
      const inside = distanceToPolygon(p, s.poly) >= 0;
      const dist = inside ? 0 : d;
      if (dist > 0.6 || (best && dist >= best.dist)) continue;
      let y;
      if (s.kind === 'landing') y = floorY + s.baseLevel;
      else {
        const t = clamp01(((x - s.origin.x) * s.dir.x + (z - s.origin.z) * s.dir.z) / s.run);
        y = floorY + s.baseLevel + t * s.delta;
      }
      best = { dist, y };
    }
    return best ? best.y : floorY;
  };

  return { group, heightAt, zoneDepths, hasStairs: true };
}
