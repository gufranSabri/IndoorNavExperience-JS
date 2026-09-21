import * as THREE from '../vendor/three.module.js';

// Renders short text to a canvas and returns a billboard sprite. Avoids any
// external font/asset dependency so the whole library stays self-contained.
export function createLabelSprite(text, { color = '#1c2430', background = 'rgba(255,255,255,0.92)' } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 42;
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const padding = 18;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = fontSize + padding * 1.4;

  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const r = 14;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.012;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}
