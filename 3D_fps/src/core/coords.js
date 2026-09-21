// All floor-plan geometry from the editor lives in image-space pixels
// (origin top-left, x right, y down). We convert every pixel point to a
// world-space (x, z) pair in meters, centered on the image, and keep that
// mapping consistent across walls, rooms, doors, objects and paths so
// everything lines up in the same Three.js scene.
export function createProjector(imageInfo, metersPerPixel) {
  const scale = metersPerPixel || 1; // fall back to raw pixel units if uncalibrated
  const cx = imageInfo.width / 2;
  const cy = imageInfo.height / 2;

  function toWorld(px, py) {
    return {
      x: (px - cx) * scale,
      z: (py - cy) * scale,
    };
  }

  function toWorldArr(point) {
    return toWorld(point[0], point[1]);
  }

  return {
    scale,
    imageInfo,
    toWorld,
    toWorldArr,
  };
}

export function distance2D(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Standard ray-casting point-in-polygon test over world-space {x, z} points
// (an open ring, matching how boundary/room polygons are stored everywhere
// else in this codebase).
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
