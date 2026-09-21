// All floor-plan geometry from the editor lives in image-space pixels
// (origin top-left, x right, y down). Every pixel point is converted to a
// world-space (x, z) pair in meters, centered on the image. Image "up"
// (north) is world -z.
export function createProjector(imageInfo, metersPerPixel) {
  const scale = metersPerPixel || 1; // fall back to raw pixel units if uncalibrated
  const cx = imageInfo.width / 2;
  const cy = imageInfo.height / 2;

  function toWorld(px, py) {
    return { x: (px - cx) * scale, z: (py - cy) * scale };
  }
  function toWorldArr(point) {
    return toWorld(point[0], point[1]);
  }
  return { scale, imageInfo, toWorld, toWorldArr };
}
