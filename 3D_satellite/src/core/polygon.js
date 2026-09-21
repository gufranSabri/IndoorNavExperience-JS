// 2D polygon helpers over world-space {x, z} points (open rings — the last
// point does not repeat the first).

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return a / 2;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    if (zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

// Drops repeated points and points that sit on a straight line between
// their neighbours — both produce degenerate offset corners.
export function cleanPolygon(pts, eps = 0.01) {
  let out = pts.slice();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length];
      const cur = out[i];
      const next = out[(i + 1) % out.length];
      const dupe = Math.hypot(cur.x - prev.x, cur.z - prev.z) < eps;
      const abx = cur.x - prev.x;
      const abz = cur.z - prev.z;
      const bcx = next.x - cur.x;
      const bcz = next.z - cur.z;
      const cross = abx * bcz - abz * bcx;
      const len = Math.hypot(abx, abz) * Math.hypot(bcx, bcz);
      const collinear = len > 0 && Math.abs(cross) / len < 1e-3 && abx * bcx + abz * bcz > 0;
      if (dupe || collinear) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / denom;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / denom;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { x: a.x + t * rx, z: a.z + t * rz };
}

// Offsetting can leave small inverted loops where features are narrower than
// the offset distance. Find each self-intersection, drop whichever half has
// the "wrong" winding, and repeat.
export function removeSelfLoops(pts, maxIterations = 64) {
  let ring = pts.slice();
  const sign = Math.sign(signedArea(ring)) || 1;
  for (let iter = 0; iter < maxIterations; iter++) {
    let found = null;
    const n = ring.length;
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const x = segmentIntersection(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]);
        if (x) {
          found = { i, j, x };
          break outer;
        }
      }
    }
    if (!found) return ring;
    const { i, j, x } = found;
    const kept = [...ring.slice(0, i + 1), x, ...ring.slice(j + 1)];
    const loop = [x, ...ring.slice(i + 1, j + 1)];
    const keptOk = Math.sign(signedArea(kept)) === sign;
    const loopOk = Math.sign(signedArea(loop)) === sign;
    if (keptOk && loopOk) ring = Math.abs(signedArea(kept)) >= Math.abs(signedArea(loop)) ? kept : loop;
    else ring = loopOk ? loop : kept;
    if (ring.length < 3) return pts;
  }
  return ring;
}

// Offsets a polygon: d > 0 grows it outward, d < 0 shrinks it. Outer corners
// are either mitered (limited, then bevelled) or rounded; inner corners are
// always a clean miter intersection.
export function offsetPolygon(pts, d, { join = 'miter', miterLimit = 3, arcStep = Math.PI / 10 } = {}) {
  const n = pts.length;
  const sign = Math.sign(signedArea(pts)) || 1;
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    normals.push({ x: (sign * ez) / len, z: (-sign * ex) / len }); // outward normal of edge i
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i];
    const n1 = normals[(i - 1 + n) % n];
    const n2 = normals[i];
    const e1 = { x: v.x - pts[(i - 1 + n) % n].x, z: v.z - pts[(i - 1 + n) % n].z };
    const e2 = { x: pts[(i + 1) % n].x - v.x, z: pts[(i + 1) % n].z - v.z };
    const convex = sign * (e1.x * e2.z - e1.z * e2.x) > 0;
    const outerCorner = (convex && d > 0) || (!convex && d < 0);
    const dot = n1.x * n2.x + n1.z * n2.z;

    if (outerCorner && join === 'round') {
      let a0 = Math.atan2(n1.z, n1.x);
      let a1 = Math.atan2(n2.z, n2.x);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / arcStep));
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (delta * s) / steps;
        out.push({ x: v.x + Math.cos(a) * d, z: v.z + Math.sin(a) * d });
      }
      continue;
    }

    const denom = 1 + dot;
    const miterScale = denom > 1e-6 ? 1 / denom : Infinity;
    const mx = (n1.x + n2.x) * miterScale;
    const mz = (n1.z + n2.z) * miterScale;
    if (Math.hypot(mx, mz) > miterLimit) {
      if (outerCorner) {
        out.push({ x: v.x + n1.x * d, z: v.z + n1.z * d });
        out.push({ x: v.x + n2.x * d, z: v.z + n2.z * d });
      } else {
        // A very sharp inner corner: clamp rather than overshoot.
        const l = Math.hypot(mx, mz) || 1;
        out.push({ x: v.x + (mx / l) * miterLimit * d, z: v.z + (mz / l) * miterLimit * d });
      }
    } else {
      out.push({ x: v.x + mx * d, z: v.z + mz * d });
    }
  }
  return removeSelfLoops(out);
}

// One offset point per input vertex (mitered, clamped) so an outer and an
// inner ring stay index-aligned — used to build the boundary wall ribbon.
export function miterRing(pts, d, miterLimit = 3) {
  const n = pts.length;
  const sign = Math.sign(signedArea(pts)) || 1;
  const normals = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    return { x: (sign * ez) / len, z: (-sign * ex) / len };
  });
  return pts.map((v, i) => {
    const n1 = normals[(i - 1 + n) % n];
    const n2 = normals[i];
    const denom = Math.max(1 + n1.x * n2.x + n1.z * n2.z, 1 / (miterLimit * miterLimit));
    let mx = ((n1.x + n2.x) / denom) * d;
    let mz = ((n1.z + n2.z) / denom) * d;
    const l = Math.hypot(mx, mz);
    if (l > Math.abs(d) * miterLimit) {
      mx *= (Math.abs(d) * miterLimit) / l;
      mz *= (Math.abs(d) * miterLimit) / l;
    }
    return { x: v.x + mx, z: v.z + mz };
  });
}

export function distanceToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

// Signed distance from a point to the polygon outline (positive inside).
export function distanceToPolygon(point, polygon) {
  let min = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    min = Math.min(min, distanceToSegment(point, polygon[j], polygon[i]));
  }
  return pointInPolygon(point, polygon) ? min : -min;
}

// The point inside a polygon that is farthest from every edge — the visual
// "center" of a room even when it is L-shaped and the centroid falls outside.
// Returns the point and that clearance (the inscribed circle radius).
export function poleOfInaccessibility(polygon) {
  const b = polygonBounds(polygon);
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  let best = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, d: -Infinity };
  const N = 24;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: b.minX + (w * i) / N, z: b.minZ + (h * j) / N };
      const d = distanceToPolygon(p, polygon);
      if (d > best.d) best = { ...p, d };
    }
  }
  let step = Math.max(w, h) / N;
  for (let iter = 0; iter < 9; iter++) {
    const c = best;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const p = { x: c.x + i * step, z: c.z + j * step };
        const d = distanceToPolygon(p, polygon);
        if (d > best.d) best = { ...p, d };
      }
    }
    step *= 0.5;
  }
  return { x: best.x, z: best.z, radius: Math.max(0, best.d) };
}

// Rounds every corner of a polygon with a true circular fillet (convex and
// concave alike). A corner's radius is reduced where the neighbouring edges
// are too short to hold it, so small features stay valid.
export function roundPolygon(pts, radius, arcStep = Math.PI / 10) {
  const n = pts.length;
  if (n < 3 || radius <= 0) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const V = pts[i];
    const P = pts[(i - 1 + n) % n];
    const N = pts[(i + 1) % n];
    const l1 = Math.hypot(P.x - V.x, P.z - V.z);
    const l2 = Math.hypot(N.x - V.x, N.z - V.z);
    if (l1 < 1e-6 || l2 < 1e-6) {
      out.push(V);
      continue;
    }
    const u1 = { x: (P.x - V.x) / l1, z: (P.z - V.z) / l1 };
    const u2 = { x: (N.x - V.x) / l2, z: (N.z - V.z) / l2 };
    const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.z * u2.z));
    const theta = Math.acos(cos); // interior angle between the two edges
    if (theta > Math.PI - 0.02 || theta < 0.02) {
      out.push(V); // straight (or a degenerate spike): nothing to round
      continue;
    }
    const tanHalf = Math.tan(theta / 2);
    const tangent = Math.min(radius / tanHalf, 0.5 * Math.min(l1, l2));
    const r = tangent * tanHalf;
    const A = { x: V.x + u1.x * tangent, z: V.z + u1.z * tangent };
    const B = { x: V.x + u2.x * tangent, z: V.z + u2.z * tangent };
    const bx = u1.x + u2.x;
    const bz = u1.z + u2.z;
    const bl = Math.hypot(bx, bz) || 1;
    const centerDist = r / Math.sin(theta / 2);
    const C = { x: V.x + (bx / bl) * centerDist, z: V.z + (bz / bl) * centerDist };
    const a0 = Math.atan2(A.z - C.z, A.x - C.x);
    const a1 = Math.atan2(B.z - C.z, B.x - C.x);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / arcStep));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (delta * k) / steps;
      out.push({ x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r });
    }
  }
  return out;
}
