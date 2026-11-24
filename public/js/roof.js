// Rooftop (top floor): garden, swimming pool and a basketball half-court.
// Purely scenery: nothing here pretends to be agent activity. Water and lamps follow the real clock.
import { sp, shade, px, poly, box, floorRect, faceQuad, wallText } from './draw.js';
import { W, H, BW, BH, RAIL_H, T, inside, live } from './scene.js';

const items = [];
const glows = [];
const add = (key, draw) => items.push({ key, draw });
const hash = (n) => { n = Math.imul(n | 0, 2654435761) >>> 0; return ((n ^ (n >>> 15)) >>> 0) / 4294967295; };

const PARAPET = '#d8d2c2';
/** Labels shown over the areas of the roof. */
export const AREAS = [
  { text: 'Garden', x: 3.5, y: 10.5, z: 16 },
  { text: 'Pool', x: 15, y: 2.2, z: 8 },
  { text: 'Basketball court', x: 24.5, y: 9.2, z: 6 },
];

// geometry
const POOL = { x: 12, y: 1.2, w: 6.6, h: 4 };
const GARDEN_FLOWERS = [[1.2, 10.2], [5.2, 10.4], [2.0, 13.6], [6.0, 13.2], [13.2, 11.0], [17.0, 13.4], [1.2, 3.4], [5.8, 3.0]];

const quadrant = (x, y) => {
  if (x >= 21) return 'court';
  if ((x >= 9 && x <= 10) || (y >= 7 && y <= 8) || x === 20) return 'path';
  if (x >= 11 && y <= 6) return 'deck';
  return 'lawn';
};

// ---- floor ------------------------------------------------------------------------
export function drawFloor(ctx) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const q = quadrant(x, y);
      let base;
      if (q === 'lawn') base = x & 1 ? '#5fa355' : '#579a4e';          // mown stripes
      else if (q === 'deck') base = (x + y) & 1 ? '#ddd6c4' : '#d2cbb8';
      else if (q === 'path') base = (x + y) & 1 ? '#c9c4b6' : '#bfbaab';
      else base = y & 1 ? '#c98f50' : '#bf8546';                         // court planks
      floorRect(ctx, base, x, y, 1, 1);
      for (let k = 0; k < 3; k++) {
        const h1 = hash(x * 131 + y * 17 + k * 7), h2 = hash(x * 29 + y * 211 + k * 13);
        const [sx, sy] = sp(x + 0.2 + h1 * 0.6, y + 0.2 + h2 * 0.6, 0);
        const c = q === 'lawn' ? (k ? '#74b867' : '#4a8a42') : q === 'court' ? (k ? '#d39a5c' : '#a8733a') : (k ? '#e6e0d2' : '#a9a496');
        px(ctx, c, sx, sy, q === 'lawn' ? 1 : 2, 1);
      }
    }
  }

  // swimming pool: coping, water, darker inner back edges for depth, steps
  floorRect(ctx, '#efe9da', POOL.x - 0.35, POOL.y - 0.35, POOL.w + 0.7, POOL.h + 0.7);
  floorRect(ctx, '#49b0d8', POOL.x, POOL.y, POOL.w, POOL.h);
  for (let i = 0; i < POOL.h * 2; i++) if (i & 1) floorRect(ctx, '#58bde0', POOL.x, POOL.y + i * 0.5, POOL.w, 0.5);
  floorRect(ctx, '#2a7aa3', POOL.x, POOL.y, POOL.w, 0.18);
  floorRect(ctx, '#2a7aa3', POOL.x, POOL.y, 0.18, POOL.h);
  floorRect(ctx, '#d9f3ff', POOL.x + POOL.w - 1.1, POOL.y + POOL.h - 0.9, 1.0, 0.8); // steps
  for (let i = 0; i < 4; i++) floorRect(ctx, '#bfe6f5', POOL.x + POOL.w - 1.1 + i * 0.25, POOL.y + POOL.h - 0.9, 0.04, 0.8);
  for (let i = 0; i <= POOL.w; i += 1.1) floorRect(ctx, '#2f89b3', POOL.x + i, POOL.y + 1.9, 0.5, 0.05); // lane marks
  floorRect(ctx, '#2f89b3', POOL.x + 0.6, POOL.y + 1.95, POOL.w - 1.2, 0.05);

  // flower beds and veg patch
  for (const [fx, fy] of GARDEN_FLOWERS) {
    floorRect(ctx, '#6b4a2f', fx, fy, 1.8, 1.0);
    for (let i = 0; i < 9; i++) {
      const [sx, sy] = sp(fx + 0.15 + hash(fx * 9 + i) * 1.5, fy + 0.12 + hash(fy * 7 + i) * 0.7, 0);
      px(ctx, ['#e65f5c', '#f2c94c', '#f4f4f4', '#c77dd6', '#ff9f43'][i % 5], sx, sy, 2, 2);
    }
  }
  floorRect(ctx, '#6b4a2f', 1.0, 4.6, 3.6, 1.6);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const [sx, sy] = sp(1.3 + i * 0.55, 4.8 + r * 0.45, 0);
    px(ctx, i % 2 ? '#3f8a46' : '#5bb25f', sx, sy, 3, 2);
  }

  // basketball half-court markings
  const L = '#f4f1e8', cx = 24.5, hy = 5.95;
  floorRect(ctx, L, 21.3, 5.3, 6.4, 0.07); floorRect(ctx, L, 21.3, 11.6, 6.4, 0.07);
  floorRect(ctx, L, 21.3, 5.3, 0.07, 6.37); floorRect(ctx, L, 27.63, 5.3, 0.07, 6.37);
  floorRect(ctx, '#a8472f', cx - 1.3, 5.3, 2.6, 3.1);                                   // painted key
  floorRect(ctx, L, cx - 1.3, 5.3, 0.06, 3.1); floorRect(ctx, L, cx + 1.24, 5.3, 0.06, 3.1); floorRect(ctx, L, cx - 1.3, 8.34, 2.6, 0.06);
  for (let a = 0; a <= Math.PI; a += 0.07) {                                              // free-throw circle (far half)
    floorRect(ctx, L, cx + Math.cos(a) * 1.3 - 0.03, 8.4 + Math.sin(a) * 1.3 - 0.03, 0.07, 0.07);
  }
  for (let a = 0; a <= Math.PI; a += 0.035) {                                             // three-point arc
    floorRect(ctx, L, cx + Math.cos(a) * 3.5 - 0.03, hy + Math.sin(a) * 3.5 - 0.03, 0.07, 0.07);
  }
  floorRect(ctx, L, cx - 0.04, 11.0, 0.08, 0.6);

  // slab edge along the front sides
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y + 1)) poly(ctx, '#b9b2a0', [sp(x, y + 1, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x, y + 1, -7)]);
      if (!inside(x + 1, y)) poly(ctx, '#968f7e', [sp(x + 1, y, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x + 1, y, -7)]);
    }
  }
}

// ---- parapet --------------------------------------------------------------------------
function parapet(plane, i, c, h = 11) {
  add((plane === 'y' ? i + c : c + i) - 0.5, (ctx) => {
    if (plane === 'y') { box(ctx, i, c - T, 1, T, h, PARAPET, { top: '#efe9da' }); }
    else { box(ctx, c - T, i, T, 1, h, PARAPET, { top: '#efe9da' }); }
  });
}
function railing(plane, i, c) {
  add((plane === 'y' ? i + c : c + i) + 0.5, (ctx) => {
    const a = plane === 'y' ? [i, c - 0.05, 1, 0.05] : [c - 0.05, i, 0.05, 1];
    box(ctx, a[0], a[1], a[2], a[3], RAIL_H + 3, '#cfd6da', { top: '#eef2f4', left: 'rgba(190,225,240,0.55)', right: 'rgba(150,200,220,0.5)' });
  });
}

// ---- props ----------------------------------------------------------------------------
const obj = (x, y, w, d, draw) => add(x + w / 2 + y + d / 2, draw);

function tree(x, y, tall = 1) {
  obj(x, y, 1, 1, (ctx, t) => {
    box(ctx, x + 0.35, y + 0.35, 0.3, 0.3, 10 * tall, '#6b4a2f');
    const sway = Math.sin(t * 0.8 + x * 3) > 0.7 ? 0.04 : 0;
    box(ctx, x - 0.05 + sway, y - 0.05, 1.1, 1.1, 7, '#3f8a46', { z: 9 * tall, top: '#4a9a50' });
    box(ctx, x + 0.1 + sway, y + 0.1, 0.8, 0.8, 6, '#4a9a50', { z: 15 * tall, top: '#5bb25f' });
    box(ctx, x + 0.28 + sway, y + 0.28, 0.44, 0.44, 5, '#5bb25f', { z: 20 * tall, top: '#74c978' });
  });
}
function bush(x, y, col = '#3c7f3d', flower = null) {
  obj(x, y, 0.8, 0.7, (ctx) => {
    box(ctx, x, y, 0.8, 0.7, 5, col, { top: shade(col, 1.4) });
    if (flower) { const [sx, sy] = sp(x + 0.2, y + 0.2, 5); px(ctx, flower, sx, sy, 2, 2); px(ctx, flower, sx + 5, sy + 2, 2, 2); }
  });
}
function hedge(x, y, w, d) { obj(x, y, w, d, (ctx) => box(ctx, x, y, w, d, 8, '#35793a', { top: '#4c9a50' })); }
function bench(x, y) {
  obj(x, y, 1.4, 0.5, (ctx) => {
    box(ctx, x + 0.1, y + 0.1, 0.12, 0.3, 4, '#5a3b28'); box(ctx, x + 1.18, y + 0.1, 0.12, 0.3, 4, '#5a3b28');
    box(ctx, x, y + 0.06, 1.4, 0.4, 2, '#b2814f', { z: 4, top: '#c99a66' });
    box(ctx, x, y + 0.02, 1.4, 0.07, 6, '#a87445', { z: 6 });
  });
}
function planter(x, y, col = '#c0643a') {
  obj(x, y, 0.8, 0.8, (ctx) => { box(ctx, x, y, 0.8, 0.8, 6, col); box(ctx, x + 0.06, y + 0.06, 0.68, 0.68, 4, '#4c9a50', { z: 6, top: '#63b567' }); });
}
function lounger(x, y, col = '#f4f1e8') {
  obj(x, y, 0.8, 1.9, (ctx) => {
    box(ctx, x + 0.05, y + 0.1, 0.1, 0.1, 4, '#9aa0a6'); box(ctx, x + 0.65, y + 1.7, 0.1, 0.1, 4, '#9aa0a6');
    box(ctx, x, y + 0.7, 0.8, 1.2, 2, col, { z: 4, top: shade(col, 1.05) });
    box(ctx, x, y, 0.8, 0.75, 2, col, { z: 5, top: shade(col, 1.05) });
  });
}
function parasol(x, y, col) {
  obj(x, y, 0.3, 0.3, (ctx) => {
    box(ctx, x + 0.12, y + 0.12, 0.06, 0.06, 26, '#d9d2c0');
    const [bx, by] = sp(x + 0.15, y + 0.15, 26);
    poly(ctx, shade(col, 0.8), [[bx - 15, by + 6], [bx, by - 10], [bx, by + 12]]);
    poly(ctx, col, [[bx, by - 10], [bx + 15, by + 6], [bx, by + 12]]);
    poly(ctx, shade(col, 1.15), [[bx - 15, by + 6], [bx, by - 10], [bx + 15, by + 6], [bx, by + 2]]);
  });
}
function gardenLamp(x, y) {
  obj(x, y, 0.3, 0.3, (ctx) => { box(ctx, x + 0.12, y + 0.12, 0.07, 0.07, 14, '#2a2a2a'); box(ctx, x + 0.06, y + 0.06, 0.2, 0.2, 4, '#ffe2a0', { z: 14, top: '#fff2c8' }); });
  const [gx, gy] = sp(x + 0.15, y + 0.15, 16);
  glows.push({ x: gx, y: gy, r: 34, rgb: '255,205,120', a: 0.4, night: true });
}
function pergola(x, y, w, d) {
  const H0 = 26;
  [[x, y], [x + w - 0.14, y], [x, y + d - 0.14], [x + w - 0.14, y + d - 0.14]].forEach(([px0, py0]) => obj(px0, py0, 0.14, 0.14, (ctx) => box(ctx, px0, py0, 0.14, 0.14, H0, '#e8dcc0')));
  add(x + w + y + d + 2, (ctx) => {
    for (let i = 0; i <= 6; i++) box(ctx, x + (i * (w - 0.1)) / 6, y, 0.1, d, 1.5, '#c9b98f', { z: H0 });
    box(ctx, x, y, w, 0.14, 2, '#d9c9a0', { z: H0 - 2 }); box(ctx, x, y + d - 0.14, w, 0.14, 2, '#d9c9a0', { z: H0 - 2 });
  });
  obj(x + 0.7, y + 0.6, w - 1.4, d - 1.2, (ctx) => { // table + stools underneath
    box(ctx, x + 0.9, y + 0.9, w - 1.8, d - 1.8, 2, '#a87445', { z: 8, top: '#c99a66' });
    box(ctx, x + w / 2 - 0.07, y + d / 2 - 0.07, 0.14, 0.14, 8, '#6b4a2f');
  });
}

function fountain() {
  add(9.5 + 7.5 + 1.2, (ctx, t) => {
    box(ctx, 9.15, 7.15, 1.7, 1.7, 4, '#d8d4c8', { top: '#e6e2d6' });
    box(ctx, 9.3, 7.3, 1.4, 1.4, 1, '#6ec6e8', { z: 4, top: '#8fd6f0' });
    box(ctx, 9.88, 7.88, 0.24, 0.24, 9, '#d8d4c8', { z: 4 });
    box(ctx, 9.7, 7.7, 0.6, 0.6, 1.5, '#d8d4c8', { z: 12, top: '#e6e2d6' });
    const [bx, by] = sp(10, 8, 14);
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.6 + i / 6) % 1, a = (i / 6) * Math.PI * 2;
      px(ctx, '#d6f3ff', bx + Math.round(Math.cos(a) * ph * 7), by + Math.round(ph * ph * 12 - 5 * Math.sin(ph * Math.PI)), 1, 1);
    }
  });
}

function hoop() {
  const cx = 24.5;
  add(cx + 5.6 + 0.4, (ctx) => {
    box(ctx, cx - 0.05, 5.32, 0.1, 0.1, 30, '#4a4f55');
    box(ctx, cx - 0.6, 5.5, 1.2, 0.06, 11, '#f4f4f4', { z: 22, top: '#ffffff' });
    faceQuad(ctx, '#d8342c', 'y', 5.56, cx - 0.22, cx + 0.22, 24, 28);
    box(ctx, cx - 0.2, 5.62, 0.4, 0.4, 0.8, '#e8742a', { z: 23 });
    faceQuad(ctx, '#f2f2f2', 'y', 6.02, cx - 0.14, cx + 0.14, 19.5, 23);
  });
  add(26.4 + 9.2 + 0.3, (ctx) => box(ctx, 26.2, 9.0, 0.32, 0.32, 3, '#e8742a', { top: '#ff9a4d' })); // ball on the court
}

function roofAccess() {
  add(0.3 + 2.2 + 2.2 + 1.5, (ctx) => {
    box(ctx, 0.3, 0.3, 2.2, 2.2, 32, '#e4dcc8', { top: '#f3ecd9' });
    faceQuad(ctx, '#4a5560', 'y', 2.5, 0.9, 1.9, 0, 19);
    faceQuad(ctx, '#2e3a46', 'y', 2.5, 1.35, 1.45, 0, 19);
    faceQuad(ctx, '#10202c', 'y', 2.5, 0.55, 2.25, 22, 30);
    wallText(ctx, 'roof', 0.7, 2.5, 24, '#ffffff', 1);
  });
}

// ---- build ----------------------------------------------------------------------------
function build() {
  // parapet walls on the back edges, glass railings on the front edges
  for (let i = 0; i < BW; i++) parapet('y', i, 0);
  for (let j = 0; j < BH; j++) parapet('x', j, 0);
  add(-0.7, (ctx) => box(ctx, -T, -T, T, T, 11, PARAPET, { top: '#efe9da' }));
  for (let i = 21; i < 28; i++) parapet('y', i, 5);
  parapet('y', 20, 7);
  add(26.7, (ctx) => box(ctx, 21 - T, 5 - T, T, T, 11, PARAPET, { top: '#efe9da' }));
  for (let i = 0; i < BW; i++) railing('y', i, 16);
  for (let j = 0; j < BH; j++) if (j < 7 || j > 8) railing('x', j, 20);
  for (let i = 21; i < 28; i++) railing('y', i, 12);
  for (let j = 5; j < 12; j++) railing('x', j, 28);
  for (let j = 5; j < 7; j++) railing('x', j, 21);
  for (let j = 9; j < 12; j++) railing('x', j, 21);
  railing('y', 20, 9);

  roofAccess();

  // garden
  hedge(0.2, 3.0, 8.4, 0.5); hedge(0.2, 6.2, 8.4, 0.5);
  tree(6.2, 0.8, 1.1); tree(3.6, 1.2); tree(7.4, 5.2, 0.9);
  bush(0.4, 3.7, '#3c7f3d', '#f2c94c'); bush(7.2, 3.8, '#46913e', '#e65f5c');
  bench(2.2, 6.4); bench(5.0, 6.4);
  tree(0.8, 11.2, 1.1); tree(7.4, 11.0); tree(4.0, 14.0, 0.9);
  planter(0.4, 14.6, '#c0643a'); planter(8.0, 14.6, '#8f9aa0');
  bench(3.6, 12.2);
  pergola(11.3, 9.6, 3.4, 2.6);
  tree(16.0, 9.4, 1.1); tree(18.2, 12.4); bush(15.4, 14.2, '#3c7f3d', '#c77dd6'); bush(17.6, 14.4, '#46913e', '#f4f4f4');
  planter(11.4, 13.6); planter(12.4, 13.6, '#8f9aa0');
  gardenLamp(8.4, 9.2); gardenLamp(8.4, 2.4); gardenLamp(11.2, 6.2); gardenLamp(19.2, 6.2); gardenLamp(15.0, 8.6);
  fountain();

  // pool deck
  parasol(11.2, 6.1, '#d8342c'); parasol(14.6, 6.1, '#2e86c1'); parasol(18.0, 6.1, '#f2c94c');
  lounger(12.0, 5.2 + 0.8, '#f4f1e8'); lounger(13.0, 5.2 + 0.8, '#f4f1e8');
  lounger(15.4, 5.2 + 0.8, '#bfe6f5'); lounger(16.4, 5.2 + 0.8, '#bfe6f5');
  planter(18.8, 0.4, '#c0643a'); planter(10.9, 0.4, '#8f9aa0'); planter(18.8, 2.6);
  // ladder at the corner of the pool
  add(POOL.x + POOL.w + POOL.y + 0.4, (ctx) => {
    box(ctx, POOL.x + POOL.w - 0.4, POOL.y - 0.28, 0.06, 0.06, 12, '#cfd6da'); box(ctx, POOL.x + POOL.w - 0.1, POOL.y - 0.28, 0.06, 0.06, 12, '#cfd6da');
    box(ctx, POOL.x + POOL.w - 0.4, POOL.y - 0.28, 0.36, 0.05, 1, '#cfd6da', { z: 12 });
  });
  // water sparkle (follows the clock, nothing to do with agents)
  add(POOL.x + POOL.w / 2 + POOL.y + POOL.h / 2 - 1.5, (ctx, t) => {
    for (let i = 0; i < 16; i++) {
      if ((Math.floor(t * 2 + i * 0.7) % 4) !== 0) continue;
      const [sx, sy] = sp(POOL.x + 0.3 + hash(i * 7) * (POOL.w - 0.6), POOL.y + 0.3 + hash(i * 13) * (POOL.h - 0.6), 0);
      px(ctx, '#ffffff', sx, sy, 2, 1);
    }
  });
  glows.push({ ...(() => { const [gx, gy] = sp(POOL.x + POOL.w / 2, POOL.y + POOL.h / 2, 0); return { x: gx, y: gy }; })(), r: 70, rgb: '90,220,255', a: 0.22, night: true });

  hoop();
  [[21.4, 11.2], [27.2, 11.2]].forEach(([x, y]) => planter(x, y, '#8f9aa0'));
}

build();
items.sort((a, b) => a.key - b.key);

export const sceneItems = items;
export const sceneGlows = glows;
