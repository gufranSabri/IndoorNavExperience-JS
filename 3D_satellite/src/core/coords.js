// All floor-plan geometry from the editor lives in image-space pixels
// (origin top-left, x right, y down). Every pixel point is converted to a
// world-space (x, z) pair in meters, centered on the image. With the default
// upDirection ("up"), image "up" (north) is world -z.
//
// upDirection is the side of the SOURCE IMAGE the editor's Upload page marked
// as north - "up" (the image's own top edge, unchanged), "right", "down", or
// "left". Whichever side is picked gets rotated to world -z here, once, so
// every consumer of world coordinates (walls, rooms, routing, the camera)
// is automatically correct without needing to know this setting exists.
const ROTATIONS = {
  up: (dx, dy) => [dx, dy],
  right: (dx, dy) => [dy, -dx],
  down: (dx, dy) => [-dx, -dy],
  left: (dx, dy) => [-dy, dx],
};

export function createProjector(imageInfo, metersPerPixel, upDirection) {
  const scale = metersPerPixel || 1; // fall back to raw pixel units if uncalibrated
  const cx = imageInfo.width / 2;
  const cy = imageInfo.height / 2;
  const rotate = ROTATIONS[upDirection] || ROTATIONS.up;

  function toWorld(px, py) {
    const [rx, ry] = rotate(px - cx, py - cy);
    return { x: rx * scale, z: ry * scale };
  }
  function toWorldArr(point) {
    return toWorld(point[0], point[1]);
  }
  return { scale, imageInfo, toWorld, toWorldArr };
}
