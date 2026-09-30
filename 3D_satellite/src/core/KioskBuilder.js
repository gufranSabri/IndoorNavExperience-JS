import * as THREE from '../vendor/three.module.js';
import { KIOSK } from './constants.js';

// The glowing wayfinding UI painted on the kiosk's display.
function makeScreenTexture() {
  const w = 640;
  const h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');

  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#16233f');
  bg.addColorStop(1, '#0b1224');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // soft "map" grid
  g.strokeStyle = 'rgba(138,180,248,0.12)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

  // route line ending in a pin
  g.strokeStyle = '#4285f4';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(70, 340); g.lineTo(200, 340); g.lineTo(200, 250); g.lineTo(400, 250); g.lineTo(400, 190);
  g.stroke();
  g.fillStyle = '#ea4335';
  g.beginPath(); g.arc(400, 160, 26, Math.PI, 0); g.lineTo(400, 214); g.closePath(); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(400, 160, 10, 0, Math.PI * 2); g.fill();
  // you-are-here dot
  g.fillStyle = 'rgba(66,133,244,0.3)';
  g.beginPath(); g.arc(70, 340, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4285f4'; g.strokeStyle = '#fff'; g.lineWidth = 6;
  g.beginPath(); g.arc(70, 340, 15, 0, Math.PI * 2); g.fill(); g.stroke();

  // header bar + title
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, w, 92);
  g.fillStyle = '#eef1f5';
  g.font = '700 44px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('Find your way', 34, 48);
  g.fillStyle = '#8ab4f8';
  g.font = '600 26px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'right';
  g.fillText('Touch to start', w - 34, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let sharedScreen = null;

// A freestanding wayfinding kiosk, ~KIOSK.height tall. Built facing local +z
// (the screen's direction), standing on y = 0 — the caller positions and turns it.
export function buildKiosk() {
  const group = new THREE.Group();
  group.name = 'kiosk';
  const k = KIOSK;

  const add = (parent, mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const body = new THREE.MeshStandardMaterial({ color: k.bodyColor, roughness: 0.42, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: k.baseColor, roughness: 0.6, metalness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: k.accentColor, toneMapped: false });

  // plinth, with a glowing strip on the face the screen looks out of
  const plinth = add(group, new THREE.Mesh(new THREE.BoxGeometry(k.width * 0.78, k.plinthHeight, k.depth), dark));
  plinth.position.y = k.plinthHeight / 2;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(k.width * 0.78 - 0.1, 0.06, 0.03), glow);
  strip.position.set(0, k.plinthHeight * 0.55, k.depth / 2 + 0.005);
  group.add(strip);

  // stem
  const stemHeight = k.screenY - k.plinthHeight;
  const stem = add(group, new THREE.Mesh(new THREE.BoxGeometry(k.width * 0.3, stemHeight, k.depth * 0.42), body));
  stem.position.y = k.plinthHeight + stemHeight / 2;

  // tilted screen assembly: housing, bezel, display, top light bar
  const head = new THREE.Group();
  head.position.set(0, k.screenY, 0);
  head.rotation.x = -k.tilt; // top leans away from the viewer
  group.add(head);

  add(head, new THREE.Mesh(new THREE.BoxGeometry(k.width, k.screenHeight, k.headDepth), body));
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(k.width - 0.14, k.screenHeight - 0.14, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.25, metalness: 0.5 })
  );
  bezel.position.z = k.headDepth / 2 + 0.005;
  head.add(bezel);

  sharedScreen ||= makeScreenTexture();
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(k.width - 0.3, k.screenHeight - 0.3),
    new THREE.MeshBasicMaterial({ map: sharedScreen, toneMapped: false })
  );
  display.position.z = k.headDepth / 2 + 0.02;
  head.add(display);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(k.width * 0.5, 0.05, 0.05), glow);
  bar.position.set(0, k.screenHeight / 2 + 0.01, 0);
  head.add(bar);

  return group;
}
