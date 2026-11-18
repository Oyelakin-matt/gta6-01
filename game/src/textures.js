// Solara Bay — every texture is drawn on a canvas at load time. No image files,
// no network: the game ships zero assets and generates its own art.
import * as THREE from 'three';
import { CITY, ROADS, BLOCKS, PALETTE, mulberry32 } from './config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

// One building facade: window grid, a few lit windows, shopfront at the base.
export function makeFacadeTexture(baseColor, seed) {
  const r = mulberry32(seed);
  const [c, g] = canvas(128, 256);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // windows: 6 columns x 12 rows
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 8 + col * 20, y = 8 + row * 19;
      const lit = r() < 0.16;
      g.fillStyle = lit ? '#ffd98a' : (r() < 0.5 ? '#2b3a4a' : '#1d2836');
      g.fillRect(x, y, 13, 12);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, y, 13, 3);
    }
  }
  // shopfront at the base
  g.fillStyle = '#20242c';
  g.fillRect(0, 228, 128, 28);
  g.fillStyle = '#3a4a5c';
  g.fillRect(4, 232, 120, 18);
  g.fillStyle = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'][Math.floor(r() * 4)];
  g.fillRect(0, 226, 128, 3);
  return toTexture(c);
}

// The whole city painted onto one 2048px ground map: asphalt, lane dashes,
// crosswalks, sidewalks, parks, parking lots, sand and the north canal.
// plan: { type: Map<"cx,cz", "build"|"park"|"lot"> } from city.js
export function makeGroundTexture(plan) {
  const SIZE = 2048;
  const [c, g] = canvas(SIZE, SIZE);
  // World -> canvas: plane covers x -230..230 (460m) and z -214..222 (436m).
  // The north canal is a separate water plane; the ground texture ends at z=-214.
  const X0 = -230, Z0 = -214, SPAN_X = 460, SPAN_Z = 436;
  const px = (x) => ((x - X0) / SPAN_X) * SIZE;
  const pz = (z) => ((z - Z0) / SPAN_Z) * SIZE;
  const w = (m) => (m / SPAN_X) * SIZE;

  // asphalt base
  g.fillStyle = '#33343a';
  g.fillRect(0, 0, SIZE, SIZE);

  // beach sand (south strip)
  g.fillStyle = '#e8d29a';
  g.fillRect(0, pz(200), SIZE, SIZE - pz(200));
  g.fillStyle = '#dfc184';
  for (let i = 0; i < 24; i++) {
    g.beginPath();
    g.ellipse((i * 173) % SIZE, pz(206) + (i % 5) * 8, 90, 5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // sidewalks + block interiors
  for (const cz of BLOCKS) {
    for (const cx of BLOCKS) {
      const t = plan.type.get(`${cx},${cz}`) || 'build';
      const x = px(cx - CITY.BLOCK / 2), y = pz(cz - CITY.BLOCK / 2);
      const s = w(CITY.BLOCK);
      if (t === 'park') {
        g.fillStyle = '#5f9e4d';
        g.fillRect(x, y, s, s);
        g.fillStyle = '#548c44';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(x + s * (0.15 + 0.7 * ((i * 37) % 10) / 10), y + s * (0.2 + 0.6 * ((i * 53) % 10) / 10), s * 0.09, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = '#d8cfae';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x + s / 2, y); g.lineTo(x + s / 2, y + s); g.stroke();
        g.beginPath(); g.moveTo(x, y + s / 2); g.lineTo(x + s, y + s / 2); g.stroke();
      } else if (t === 'lot') {
        g.fillStyle = '#3d3e45';
        g.fillRect(x, y, s, s);
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const lx = x + s * 0.15 + i * s * 0.17;
          g.beginPath(); g.moveTo(lx, y + s * 0.2); g.lineTo(lx, y + s * 0.45); g.stroke();
          g.beginPath(); g.moveTo(lx, y + s * 0.55); g.lineTo(lx, y + s * 0.8); g.stroke();
        }
      } else {
        g.fillStyle = '#9d9a8e';
        g.fillRect(x, y, s, s);
        g.fillStyle = '#8d8a7e';
        g.fillRect(x + 4, y + 4, s - 8, s - 8);
      }
    }
  }

  // lane dashes on every road
  g.fillStyle = '#e8c33a';
  for (const rx of ROADS) {
    for (let z = -200; z < 200; z += 10) {
      g.fillRect(px(rx) - 1.5, pz(z), 3, w(4));
    }
  }
  for (const rz of ROADS) {
    for (let x = -200; x < 200; x += 10) {
      g.fillRect(px(x), pz(rz) - 1.5, w(4), 3);
    }
  }
  // road edge lines
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (const rx of ROADS) {
    g.beginPath(); g.moveTo(px(rx - 6), pz(-200)); g.lineTo(px(rx - 6), pz(200)); g.stroke();
    g.beginPath(); g.moveTo(px(rx + 6), pz(-200)); g.lineTo(px(rx + 6), pz(200)); g.stroke();
  }
  for (const rz of ROADS) {
    g.beginPath(); g.moveTo(px(-200), pz(rz - 6)); g.lineTo(px(200), pz(rz - 6)); g.stroke();
    g.beginPath(); g.moveTo(px(-200), pz(rz + 6)); g.lineTo(px(200), pz(rz + 6)); g.stroke();
  }
  // crosswalks at every intersection
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(px(rx + i * 2) - 1.5, pz(rz - 9), 3, w(4));
        g.fillRect(px(rx + i * 2) - 1.5, pz(rz + 5), 3, w(4));
      }
    }
  }
  return toTexture(c);
}

// Ocean surface: blue with pale wave streaks, tiled and scrolled at runtime.
export function makeOceanTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2e7fb8';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 2;
  const r = mulberry32(99);
  for (let i = 0; i < 34; i++) {
    const x = r() * 256, y = r() * 256, len = 20 + r() * 50;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y + 4, x + len, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 20; i++) g.fillRect(r() * 256, r() * 256, 30 + r() * 40, 6);
  const t = toTexture(c, 24, 24);
  return t;
}

// Small round "blob" texture for particles / muzzle flash sprites.
export function makeGlowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,220,140,0.7)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

export { PALETTE };
