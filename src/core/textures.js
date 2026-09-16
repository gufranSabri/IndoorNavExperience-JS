import * as THREE from '../vendor/three.module.js';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function drawGroutGrid(ctx, size, gridN, cell, strokeStyle) {
  const groutWidth = Math.max(2, cell * 0.045);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = groutWidth;
  ctx.beginPath();
  for (let g = 0; g <= gridN; g++) {
    ctx.moveTo(g * cell, 0);
    ctx.lineTo(g * cell, size);
    ctx.moveTo(0, g * cell);
    ctx.lineTo(size, g * cell);
  }
  ctx.stroke();
  return groutWidth;
}

// A warm, softly variegated ceramic tile texture, generated entirely on a
// <canvas> so the floor never depends on an external image. `worldSize` is
// how many real-world meters one full repeat of the texture covers — pair
// it with a world-aligned planar UV (see applyPlanarUV) so tiles line up
// seamlessly across every room and corridor instead of stretching per-shape.
export function createFloorTileTexture({ tileMeters = 0.6, gridN = 4, size = 512 } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const cell = size / gridN;

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const base = 214 + Math.floor(Math.random() * 14);
      ctx.fillStyle = `rgb(${base + 8}, ${base + 3}, ${base - 8})`;
      ctx.fillRect(gx * cell, gy * cell, cell, cell);

      for (let i = 0; i < 26; i++) {
        const x = gx * cell + Math.random() * cell;
        const y = gy * cell + Math.random() * cell;
        const a = 0.03 + Math.random() * 0.05;
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(70,60,48,${a})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }

      const grad = ctx.createLinearGradient(gx * cell, gy * cell, gx * cell + cell, gy * cell + cell);
      grad.addColorStop(0, 'rgba(255,255,255,0.06)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx * cell, gy * cell, cell, cell);
    }
  }
  drawGroutGrid(ctx, size, gridN, cell, '#b8b1a2');

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  if ('colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;

  const bumpCanvas = makeCanvas(size);
  const bctx = bumpCanvas.getContext('2d');
  bctx.fillStyle = '#8f8f8f';
  bctx.fillRect(0, 0, size, size);
  drawGroutGrid(bctx, size, gridN, cell, '#1c1c1c');
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap, worldSize: tileMeters * gridN };
}

// A plain acoustic-panel ceiling texture: flat off-white with a shallow
// panel-seam grid, generated on canvas like the floor tile texture so the
// ceiling never needs an external image either.
export function createCeilingTileTexture({ tileMeters = 0.6, gridN = 4, size = 512 } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const cell = size / gridN;

  ctx.fillStyle = '#f4f3ef';
  ctx.fillRect(0, 0, size, size);
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const shade = 240 + Math.floor(Math.random() * 8);
      ctx.fillStyle = `rgb(${shade}, ${shade - 1}, ${shade - 4})`;
      ctx.fillRect(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4);
    }
  }
  drawGroutGrid(ctx, size, gridN, cell, '#d7d3c9');

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;
  return { map, worldSize: tileMeters * gridN };
}

// Subtle speckled grayscale texture used as a roughnessMap on wall
// materials so painted partitions don't read as flat plastic under
// directional light. No alignment requirements, so a fixed small repeat
// per mesh is enough.
export function createWallNoiseTexture({ size = 256 } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * 0.06;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Cheap gradient sky used as scene.background — a flat vertical gradient
// stretched behind the scene. Not a physically-based sky dome, but gives an
// airy daylight backdrop for zero cost and zero external assets.
export function createSkyGradientTexture({ top, horizon, ground } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, horizon);
  grad.addColorStop(1, ground);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Rewrites a geometry's UVs from its own local (x, z) position instead of
// the shape-relative UVs THREE.ExtrudeGeometry generates. Every flat piece
// of the floor is built directly in world space with no extra transforms,
// so this makes a tile texture line up seamlessly across the slab and every
// room polygon rather than stretching to fit each shape's own bounding box.
export function applyPlanarUV(geometry, worldSize) {
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / worldSize;
    uv[i * 2 + 1] = position.getZ(i) / worldSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
