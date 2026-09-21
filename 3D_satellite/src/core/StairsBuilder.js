import * as THREE from '../vendor/three.module.js';
import { cleanPolygon, distanceToPolygon, distanceToSegment } from './polygon.js';
import { makeShape, extrude } from './shapes.js';
import { mergeGeometries } from './geometryMerge.js';
import { STAIR_RISE, STAIR_TREAD, STAIR_LIGHT, STAIR_DARK } from './constants.js';

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

// Distance from a point to whatever a flight hangs off: the segments listed
// below it in the vertical order, and the openings in the floor ("exits").
function distanceToRefs(p, refPolys, exits) {
  let d = Infinity;
  for (const poly of refPolys) d = Math.min(d, Math.abs(distanceToPolygon(p, poly)));
  for (const e of exits) d = Math.min(d, distanceToSegment(p, e.a, e.b));
  return d;
}

// The floor scope's `segments` are stair flights and landings with a vertical
// `order`. Order 1 flights start at an exclusion "exit" in the floor; each
// flight then runs down to the segment of the next order. So a flight's top
// edge is the one that touches something lower in the order (or an exit),
// and its steps descend away from that edge.
//
// Returns the geometry group, a `heightAt(x, z)` giving the walkable surface
// height (so the route and the user dot can follow the stairs down), and the
// lowest y reached (used to size the stairwell).
export function buildStairs(floorScope, projector, { floorY }) {
  const segments = (floorScope?.segments || [])
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      order: s.order ?? 0,
      poly: cleanPolygon((s.polygon || []).map((p) => projector.toWorldArr(p))),
    }))
    .filter((s) => s.poly.length >= 3);
  const exits = (floorScope?.exclusion_exits || []).map((e) => ({
    a: projector.toWorldArr(e.start),
    b: projector.toWorldArr(e.end),
  }));

  const group = new THREE.Group();
  group.name = 'stairs';
  if (!segments.length) return { group, heightAt: () => floorY, bottomY: floorY, hasStairs: false };

  // 1. Geometry of each flight: top edge, descent direction, run length, step count.
  for (const seg of segments) {
    if (seg.kind === 'landing') continue;
    const below = segments.filter((o) => o.order < seg.order).map((o) => o.poly);
    const c = centroid(seg.poly);
    let best = null;
    seg.poly.forEach((a, i) => {
      const b = seg.poly[(i + 1) % seg.poly.length];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const score = distanceToRefs(mid, below, exits);
      if (!best || score < best.score) best = { i, a, b, mid, score };
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

  // 2. Levels (relative to the floor, negative = down). Flights sharing an
  // order are parallel branches, so they all drop by the same amount.
  const orders = [...new Set(segments.map((s) => s.order))].sort((a, b) => a - b);
  let level = 0;
  for (const order of orders) {
    const sameOrder = segments.filter((s) => s.order === order);
    const drop = Math.max(0, ...sameOrder.filter((s) => s.kind !== 'landing').map((s) => s.steps * STAIR_RISE));
    for (const s of sameOrder) {
      s.topLevel = level;
      s.drop = s.kind === 'landing' ? 0 : drop;
    }
    level -= drop;
  }
  const bottomY = floorY + level;

  // 3. Solids: every step (and landing) is a block reaching from the bottom of
  // the stairwell up to its own tread, so its riser is visible above the next step.
  const pieces = [];
  const solid = (poly, topY) => {
    if (poly.length < 3 || topY - bottomY < 0.05) return;
    const geometry = extrude(makeShape(poly), topY - bottomY, 0.02);
    geometry.translate(0, bottomY, 0);
    pieces.push(geometry);
  };
  for (const s of segments) {
    if (s.kind === 'landing') {
      solid(s.poly, floorY + s.topLevel);
      continue;
    }
    const rise = s.drop / s.steps;
    for (let j = 0; j < s.steps; j++) {
      const strip = clipToBand(s.poly, s.origin, s.dir, (s.run * j) / s.steps, (s.run * (j + 1)) / s.steps);
      solid(strip, floorY + s.topLevel - (j + 1) * rise);
    }
  }

  const merged = pieces.length ? mergeGeometries(pieces) : null;
  if (merged) {
    // Fade the stone from light at the top of the stairs to black at the bottom
    // of the well — a cheap ambient-occlusion look that gives the depth.
    const position = merged.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const light = new THREE.Color(STAIR_LIGHT);
    const dark = new THREE.Color(STAIR_DARK);
    const mix = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const t = clamp01((position.getY(i) - bottomY) / (floorY - bottomY || 1));
      mix.copy(dark).lerp(light, Math.pow(t, 1.15));
      colors.set([mix.r, mix.g, mix.b], i * 3);
    }
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.06 })
    );
    mesh.name = 'stair-steps';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Surface height at a point: interpolated along a flight's run (never below
  // the tread it is over), flat on a landing, the floor everywhere else.
  const heightAt = (x, z) => {
    const p = { x, z };
    let best = null;
    for (const s of segments) {
      const d = Math.abs(distanceToPolygon(p, s.poly));
      const inside = distanceToPolygon(p, s.poly) >= 0;
      const dist = inside ? 0 : d;
      if (dist > 0.6 || (best && dist >= best.dist)) continue;
      let y;
      if (s.kind === 'landing') y = floorY + s.topLevel;
      else {
        const t = clamp01(((x - s.origin.x) * s.dir.x + (z - s.origin.z) * s.dir.z) / s.run);
        y = floorY + s.topLevel - t * s.drop;
      }
      best = { dist, y };
    }
    return best ? best.y : floorY;
  };

  return { group, heightAt, bottomY, hasStairs: true };
}
