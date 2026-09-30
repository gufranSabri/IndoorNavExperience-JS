import * as THREE from '../vendor/three.module.js';
import { KIOSK } from './constants.js';

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

  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(k.width - 0.3, k.screenHeight - 0.3),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  display.position.z = k.headDepth / 2 + 0.02;
  head.add(display);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(k.width * 0.5, 0.05, 0.05), glow);
  bar.position.set(0, k.screenHeight / 2 + 0.01, 0);
  head.add(bar);

  return group;
}
