// The office map: four rooms around a cross-shaped corridor, built from
// isometric boxes. Furniture is sorted by depth together with the characters.
import { V, sp, shade, px, poly, box, floorRect, faceQuad, glow, wallText } from './draw.js';

export const BW = 20, BH = 16;   // main building
export const W = 28, H = 16;     // whole map: the building plus the meeting room on the east side
export const WALL_H = 34, PART_H = 22, RAIL_H = 7, T = 0.2;
export const OX = H * 16 + 16, OY = 44;
export const CANVAS_W = W * 16 + OX + 16, CANVAS_H = (W + H) * 8 + OY + 18;

/** Real agent status per id; updated by the app, read while drawing. */
export const live = { status: {}, sky: { color: '#a9dcf2', stars: false } };

export const ROOMS = {
  developer: { id: 'developer', x: 0, y: 0, w: 9, h: 7, wall: '#8d5b46', trim: '#5e3a2b', floor: ['#c28b54', '#b8814b'], label: 'Development' },
  documents: { id: 'documents', x: 11, y: 0, w: 9, h: 7, wall: '#d9bd90', trim: '#a07f55', floor: ['#e6d8b7', '#d8c8a2'], label: 'Documents' },
  email: { id: 'email', x: 0, y: 9, w: 9, h: 7, wall: '#b8645d', trim: '#7d3d39', floor: ['#a0605c', '#965753'], label: 'Email' },
  automation: { id: 'automation', x: 11, y: 9, w: 9, h: 7, wall: '#6a8aa0', trim: '#40586b', floor: ['#8398a7', '#788e9d'], label: 'Automation' },
};
const MEETING = { id: 'meeting', x: 21, y: 5, w: 7, h: 7, wall: '#8d97a8', trim: '#4f5b70', floor: ['#b5bcc8', '#a8b0be'], label: 'Meeting room' };
ROOMS.meeting = MEETING;
const CORR = { wall: '#c9a77a', trim: '#8f6f47', floor: ['#d3b78e', '#c9ac81'] };

export const STATIONS = {
  developer: { seat: { x: 2, y: 2 }, stand: { x: 3, y: 2 }, desk: { x: 2, y: 1, w: 3 } },
  documents: { seat: { x: 13, y: 2 }, stand: { x: 14, y: 2 }, desk: { x: 13, y: 1, w: 2 } },
  email: { seat: { x: 3, y: 11 }, stand: { x: 4, y: 11 }, desk: { x: 3, y: 10, w: 2 } },
  automation: { seat: { x: 13, y: 11 }, stand: { x: 14, y: 11 }, desk: { x: 13, y: 10, w: 3 } },
};

const roomAt = (x, y) => Object.values(ROOMS).find((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) || null;
const hash = (n) => { n = Math.imul(n | 0, 2654435761) >>> 0; return ((n ^ (n >>> 15)) >>> 0) / 4294967295; };

// ---- registry -----------------------------------------------------------------
const items = [];
const glows = [];
export const blocked = new Set();
const add = (key, draw) => items.push({ key, draw });
function blockRect(x, y, w, d) {
  for (let i = Math.floor(x + 0.02); i < Math.ceil(x + w - 0.02); i++) {
    for (let j = Math.floor(y + 0.02); j < Math.ceil(y + d - 0.02); j++) blocked.add(`${i},${j}`);
  }
}
/** Furniture: key defaults to the centre of its footprint. */
function obj(x, y, w, d, draw, { block = true, key } = {}) {
  add(key ?? x + w / 2 + y + d / 2, draw);
  if (block) blockRect(x, y, w, d);
}

// ---- navigation across the whole office -----------------------------------------
// Walls are solid except at the doorways drawn in build(): [tileInside, tileOutside].
const DOORS = new Set();
for (const [a, b, c, d] of [[4, 6, 4, 7], [8, 3, 9, 3], [10, 3, 11, 3], [15, 6, 15, 7], [4, 8, 4, 9], [8, 12, 9, 12], [15, 8, 15, 9], [10, 12, 11, 12], [20, 7, 21, 7]]) {
  DOORS.add(`${a},${b}|${c},${d}`); DOORS.add(`${c},${d}|${a},${b}`);
}
export const GRID = { x: 0, y: 0, w: W, h: H };
/** Tiles that have floor: the main building, the corridor spur to the meeting room, and the meeting room. */
export const inside = (x, y) => (x >= 0 && y >= 0 && ((x < BW && y < BH) || (x === 20 && (y === 7 || y === 8)) || roomAt(x, y) === MEETING));
/** May a character step from tile a to the adjacent tile b? */
export function navStep(ax, ay, bx, by) {
  if (!inside(bx, by) || blocked.has(`${bx},${by}`)) return false;
  return roomAt(ax, ay) === roomAt(bx, by) || DOORS.has(`${ax},${ay}|${bx},${by}`);
}
/** Seats around the meeting-room table (tile, facing, seated). Dex, the boss, takes the head of the table. */
export const HUB = {
  developer: { x: 26, y: 8, dir: 'SW', sit: true }, documents: { x: 24, y: 6, dir: 'SW', sit: true },
  email: { x: 22, y: 8, dir: 'SE', sit: true }, automation: { x: 24, y: 9, dir: 'SE', sit: true },
};
export const roomOf = (x, y) => roomAt(x, y);

// ---- floor (cached by the renderer) --------------------------------------------
function rug(ctx, x, y, w, h, main, border) {
  floorRect(ctx, border, x, y, w, h);
  floorRect(ctx, main, x + 0.22, y + 0.22, w - 0.44, h - 0.44);
  floorRect(ctx, shade(border, 1.05), x + 0.55, y + 0.55, w - 1.1, h - 1.1);
  floorRect(ctx, main, x + 0.7, y + 0.7, w - 1.4, h - 1.4);
}

export function drawFloor(ctx) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const r = roomAt(x, y);
      const base = (r || CORR).floor[(x + y) & 1];
      floorRect(ctx, base, x, y, 1, 1);
      for (let k = 0; k < 3; k++) { // texture speckles
        const h1 = hash(x * 131 + y * 17 + k * 7), h2 = hash(x * 29 + y * 211 + k * 13);
        const [sx, sy] = sp(x + 0.2 + h1 * 0.6, y + 0.2 + h2 * 0.6, 0);
        px(ctx, shade(base, k ? 1.07 : 0.9), sx, sy, 2, 1);
      }
    }
  }
  // rugs
  rug(ctx, 3, 3.6, 5, 2.8, '#8c3b3b', '#d9b36a');
  rug(ctx, 12.2, 3.5, 4, 2.9, '#5f8a62', '#efe2bf');
  rug(ctx, 2.2, 12.6, 5.6, 2.8, '#c98a86', '#f1d9bf');
  rug(ctx, 12.2, 12.6, 6, 2.8, '#44627a', '#9db3c2');
  rug(ctx, 9, 7, 2, 2, '#8b3a3a', '#e3c27a');
  // door mats
  floorRect(ctx, '#5a3b28', 3.9, 7.0, 1.2, 0.6); floorRect(ctx, '#5a3b28', 9.0, 3.0, 0.6, 1.0);
  floorRect(ctx, '#5a3b28', 15.0, 7.0, 1.0, 0.6); floorRect(ctx, '#5a3b28', 10.4, 3.0, 0.6, 1.0);
  floorRect(ctx, '#5a3b28', 3.9, 8.4, 1.2, 0.6); floorRect(ctx, '#5a3b28', 10.4, 12.0, 0.6, 1.0);
  floorRect(ctx, '#5a3b28', 15.0, 8.4, 1.0, 0.6); floorRect(ctx, '#5a3b28', 20.4, 7.0, 0.6, 1.0);
  rug(ctx, 22.4, 6.4, 4.2, 3.2, '#3d4a5e', '#c9d1de'); // meeting-room rug
  // slab edge (the "dollhouse" thickness) along the two front sides
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y + 1)) poly(ctx, '#6b4a33', [sp(x, y + 1, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x, y + 1, -7)]);
      if (!inside(x + 1, y)) poly(ctx, '#4d3526', [sp(x + 1, y, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x + 1, y, -7)]);
    }
  }
}

// ---- walls ---------------------------------------------------------------------
function wallSeg(plane, i, c, height) {
  const r = plane === 'y' ? roomAt(i, c) || roomAt(i, c - 1) : roomAt(c, i) || roomAt(c - 1, i);
  const pal = r || CORR;
  add(plane === 'y' ? i + c - 0.6 : c + i - 0.6, (ctx) => {
    const wb = Math.min(9, height - 6);
    if (plane === 'y') {
      box(ctx, i, c - T, 1, T, height, pal.wall, { top: shade(pal.wall, 1.28) });
      box(ctx, i, c - T, 1, T, wb, pal.trim, { top: shade(pal.trim, 1.3) });
    } else {
      box(ctx, c - T, i, T, 1, height, pal.wall, { top: shade(pal.wall, 1.28) });
      box(ctx, c - T, i, T, 1, wb, pal.trim, { top: shade(pal.trim, 1.3) });
    }
  });
}

function doorFrame(plane, i, c, height) {
  const col = '#4a2f1d';
  add((plane === 'y' ? i + c : c + i) - 0.5, (ctx) => {
    if (plane === 'y') {
      box(ctx, i, c - T - 0.03, 0.12, T + 0.06, height, col);
      box(ctx, i + 0.88, c - T - 0.03, 0.12, T + 0.06, height, col);
      box(ctx, i, c - T - 0.03, 1, T + 0.06, 4, col, { z: height - 4 });
    } else {
      box(ctx, c - T - 0.03, i, T + 0.06, 0.12, height, col);
      box(ctx, c - T - 0.03, i + 0.88, T + 0.06, 0.12, height, col);
      box(ctx, c - T - 0.03, i, T + 0.06, 1, 4, col, { z: height - 4 });
    }
  });
}

function railSeg(plane, i, c, room) {
  add(plane === 'y' ? i + c + 0.5 : c + i + 0.5, (ctx) => {
    if (plane === 'y') box(ctx, i, c - T, 1, T, RAIL_H, room.trim, { top: shade(room.wall, 1.15) });
    else box(ctx, c - T, i, T, 1, RAIL_H, room.trim, { top: shade(room.wall, 1.15) });
  });
}

function wall(plane, from, to, c, height, doorAt) {
  for (let i = from; i <= to; i++) {
    if (i === doorAt) { doorFrame(plane, i, c, height); continue; }
    wallSeg(plane, i, c, height);
  }
}
function rail(plane, from, to, c, room, doorAt) {
  for (let i = from; i <= to; i++) if (i !== doorAt) railSeg(plane, i, c, room);
}

// ---- wall decorations ----------------------------------------------------------
function sky() { return live.sky; }

function windowOn(plane, c, i, w = 0.78) {
  const key = (plane === 'y' ? i + c : c + i) - 0.55;
  add(key, (ctx, t) => {
    const u0 = i + (1 - w) / 2, u1 = u0 + w;
    faceQuad(ctx, '#f3e7c9', plane, c, u0 - 0.04, u1 + 0.04, 11, 28);
    faceQuad(ctx, sky().color, plane, c, u0 + 0.03, u1 - 0.03, 13, 26);
    if (sky().stars) for (let k = 0; k < 5; k++) {
      const u = u0 + 0.08 + hash(i * 7 + k) * (w - 0.2), z = 15 + Math.floor(hash(i * 13 + k) * 9);
      const p = plane === 'y' ? sp(u, c, z) : sp(c, u, z);
      px(ctx, '#fff6c8', p[0], p[1] + (Math.floor(t * 2 + k) % 4 === 0 ? 1 : 0));
    }
    faceQuad(ctx, '#f3e7c9', plane, c, (u0 + u1) / 2 - 0.02, (u0 + u1) / 2 + 0.02, 13, 26);
    faceQuad(ctx, '#f3e7c9', plane, c, u0 + 0.03, u1 - 0.03, 19, 20);
    faceQuad(ctx, sky().stars ? '#2c3b66' : '#c5eaf7', plane, c, u0 + 0.05, u0 + 0.2, 14, 17); // glass glint
    faceQuad(ctx, '#a35a3a', plane, c, u0 - 0.1, u0 + 0.12, 11, 29); // curtains
    faceQuad(ctx, '#a35a3a', plane, c, u1 - 0.12, u1 + 0.1, 11, 29);
  });
}

function poster(plane, c, u0, u1, z0, z1, col, accent) {
  add((plane === 'y' ? u0 + c : c + u0) - 0.5, (ctx) => {
    faceQuad(ctx, '#3a2a20', plane, c, u0 - 0.03, u1 + 0.03, z0 - 1, z1 + 1);
    faceQuad(ctx, col, plane, c, u0, u1, z0, z1);
    faceQuad(ctx, accent, plane, c, u0 + (u1 - u0) * 0.2, u0 + (u1 - u0) * 0.8, z0 + (z1 - z0) * 0.25, z0 + (z1 - z0) * 0.6);
  });
}

function whiteboard(plane, c, u0, u1, lines, z0 = 9, z1 = 27) {
  add((plane === 'y' ? u0 + c : c + u0) - 0.5, (ctx) => {
    faceQuad(ctx, '#8d8f93', plane, c, u0 - 0.04, u1 + 0.04, z0 - 1, z1 + 1);
    faceQuad(ctx, '#f4f3ec', plane, c, u0, u1, z0, z1);
    lines.forEach(([a, b, row, col]) => faceQuad(ctx, col, plane, c, u0 + (u1 - u0) * a, u0 + (u1 - u0) * b, z1 - 3 - row * 3.2, z1 - 2 - row * 3.2));
  });
}

function clock(x, y, z) {
  add(x + y - 0.4, (ctx, t) => {
    const [cx, cy] = sp(x, y, z);
    px(ctx, '#3a2a20', cx - 4, cy - 4, 9, 9); px(ctx, '#f6efdc', cx - 3, cy - 3, 7, 7);
    const d = new Date();
    const ma = (d.getMinutes() / 60) * Math.PI * 2, ha = (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2;
    px(ctx, '#2b1d17', cx, cy); px(ctx, '#2b1d17', cx + Math.round(Math.sin(ma) * 3), cy - Math.round(Math.cos(ma) * 3));
    px(ctx, '#b5442f', cx + Math.round(Math.sin(ha) * 2), cy - Math.round(Math.cos(ha) * 2));
  });
}

// ---- furniture -----------------------------------------------------------------
const BOOKS = ['#c0392b', '#2e86c1', '#d4ac0d', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];

function shelf(ctx, plane, a, b, len, h = 26, col = '#7a4e2e', rows = 3, seed = 1, content = 'books') {
  let c, u0;
  if (plane === 'y') { box(ctx, a, b, len, 0.6, h, col); c = b + 0.6; u0 = a; } else { box(ctx, a, b, 0.6, len, h, col); c = a + 0.6; u0 = b; }
  const rowH = (h - 2) / rows;
  for (let r = 0; r < rows; r++) {
    const z0 = 1 + r * rowH;
    faceQuad(ctx, shade(col, 0.42), plane, c, u0 + 0.06, u0 + len - 0.06, z0, z0 + rowH - 1.5);
    for (let u = 0; u < len - 0.22; u += content === 'books' ? 0.11 : 0.34) {
      const hh = hash(seed * 100 + r * 31 + Math.floor(u * 100));
      if (content === 'books') {
        faceQuad(ctx, BOOKS[Math.floor(hh * 8)], plane, c, u0 + 0.09 + u, u0 + 0.18 + u, z0, z0 + 3 + Math.floor(hh * (rowH - 5.5)));
      } else if (hh > 0.25) { // binders / mail
        faceQuad(ctx, hh > 0.6 ? '#f2eada' : '#d9c9a0', plane, c, u0 + 0.1 + u, u0 + 0.36 + u, z0 + 1, z0 + 4);
        if (hh > 0.8) faceQuad(ctx, '#c0392b', plane, c, u0 + 0.14 + u, u0 + 0.3 + u, z0 + 2, z0 + 3);
      }
    }
  }
}

function sofa(ctx, plane, x, y, len, col) {
  const dark = shade(col, 0.78);
  if (plane === 'y') {
    box(ctx, x, y, len, 0.3, 14, dark);
    box(ctx, x, y + 0.3, len, 0.7, 6, col);
    box(ctx, x, y + 0.3, 0.2, 0.7, 10, dark); box(ctx, x + len - 0.2, y + 0.3, 0.2, 0.7, 10, dark);
  } else {
    box(ctx, x, y, 0.3, len, 14, dark);
    box(ctx, x + 0.3, y, 0.7, len, 6, col);
    box(ctx, x + 0.3, y, 0.7, 0.2, 10, dark); box(ctx, x + 0.3, y + len - 0.2, 0.7, 0.2, 10, dark);
  }
}

function plant(x, y, s = 1) {
  return (ctx, t) => {
    box(ctx, x + 0.28, y + 0.28, 0.44, 0.44, 7, '#b0592f');
    const [bx, by] = sp(x + 0.5, y + 0.5, 7);
    for (let k = 0; k < 7; k++) {
      const a = k * 0.95 + x;
      const sway = Math.sin(t * 1.3 + x * 2 + k) * 0.9;
      const tx = bx + Math.round(Math.cos(a) * 7 * s + sway), ty = by - Math.round((9 + (k % 3) * 3) * s);
      poly(ctx, k % 2 ? '#4f9a4a' : '#3c7f3d', [[bx - 1, by], [bx + 2, by], [tx + 1, ty]]);
      px(ctx, '#6fbf61', tx, ty, 2, 2);
    }
  };
}

function desk(x, y, w) {
  return (ctx) => {
    box(ctx, x + 0.06, y + 0.12, 0.14, 0.78, 8, '#6e4726');
    box(ctx, x + w - 0.75, y + 0.08, 0.68, 0.84, 8, '#8a5a30');
    faceQuad(ctx, '#6a4424', 'y', y + 0.92, x + w - 0.7, x + w - 0.12, 4, 5);
    faceQuad(ctx, '#d8b878', 'y', y + 0.92, x + w - 0.45, x + w - 0.37, 5.5, 6.5);
    box(ctx, x, y, w, 1, 2, '#b98650', { z: 8, top: '#d3a066' });
  };
}

function monitor(ctx, t, cx, cy, status, hw = 0.3, z = 10) {
  box(ctx, cx - 0.05, cy - 0.03, 0.1, 0.06, 2, '#3a3a42', { z });
  box(ctx, cx - hw - 0.04, cy - 0.05, 2 * hw + 0.08, 0.1, 9, '#2c2c34', { z: z + 2 });
  const c0 = cy + 0.05, u0 = cx - hw, u1 = cx + hw, z0 = z + 3.5, z1 = z + 10.5;
  let bg = '#15191f', fg = null;
  if (status === 'working') { bg = '#0d2430'; fg = ['#6fe3a5', '#7bc4ff', '#ffd479', '#c9a0ff']; }
  else if (status === 'waiting_approval') { bg = '#2b2310'; fg = ['#ffd35a']; }
  else if (status === 'error') { bg = '#2d1212'; fg = ['#ff7a70']; }
  faceQuad(ctx, bg, 'y', c0, u0, u1, z0, z1);
  if (fg) {
    const s = status === 'working' ? Math.floor(t * 3) : 0;
    for (let i = 0; i < 4; i++) {
      const rz = z1 - 1.8 - i * 1.7;
      const len = 0.08 + hash(i * 7 + s * 13 + Math.round(cx * 10)) * (2 * hw - 0.2);
      faceQuad(ctx, fg[(i + s) % fg.length], 'y', c0, u0 + 0.05, u0 + 0.05 + len, rz, rz + 1);
    }
  } else faceQuad(ctx, '#252b33', 'y', c0, u0 + 0.05, u0 + 0.14, z1 - 2.2, z1 - 1.2);
}

function workstation(id, mons) {
  const st = STATIONS[id], d = st.desk;
  obj(d.x, d.y, d.w, 1, desk(d.x, d.y, d.w), { key: d.x + d.y + 1.2 });
  add(d.x + d.y + 1.3, (ctx, t) => {
    const status = live.status[id] || 'idle';
    for (const cx of mons) monitor(ctx, t, d.x + cx, d.y + 0.35, status, mons.length > 2 ? 0.25 : 0.3);
    box(ctx, d.x + 0.2, d.y + 0.55, 0.6, 0.25, 1, '#ddd5c4', { z: 10 }); // keyboard
    box(ctx, d.x + 0.9, d.y + 0.65, 0.12, 0.16, 1.5, '#ddd5c4', { z: 10 }); // mouse
    box(ctx, d.x + d.w - 0.5, d.y + 0.7, 0.14, 0.14, 3, '#f2efe6', { z: 10 }); // mug
  });
  const s = st.seat; // chair
  add(s.x + s.y + 0.5, (ctx) => {
    const col = ROOMS[id].trim;
    box(ctx, s.x + 0.45, s.y + 0.45, 0.1, 0.1, 5, '#2a2a2a');
    box(ctx, s.x + 0.12, s.y + 0.15, 0.76, 0.66, 3, shade(col, 1.2), { z: 5 });
    box(ctx, s.x + 0.12, s.y + 0.72, 0.76, 0.12, 10, shade(col, 1.1), { z: 8 });
  });
}

function emptyDesk(x, y, w, mons, rid) {
  obj(x, y, w, 1, desk(x, y, w), { key: x + y + 1.2 });
  add(x + y + 1.3, (ctx, t) => {
    mons.forEach((cx) => monitor(ctx, t, x + cx, y + 0.35, 'off'));
    box(ctx, x + 0.2, y + 0.55, 0.6, 0.25, 1, '#ddd5c4', { z: 10 });
  });
  add(x + y + 1.9, (ctx) => { // chair pushed in
    box(ctx, x + 0.45, y + 0.5, 0.1, 0.1, 5, '#2a2a2a');
    box(ctx, x + 0.14, y + 0.3, 0.72, 0.6, 3, shade(ROOMS[rid].trim, 1.1), { z: 5 });
    box(ctx, x + 0.14, y + 0.82, 0.72, 0.12, 10, shade(ROOMS[rid].trim, 1), { z: 8 });
  });
}

function floorLamp(x, y) {
  obj(x, y, 0.5, 0.5, (ctx) => {
    box(ctx, x + 0.18, y + 0.18, 0.14, 0.14, 2, '#2a2a2a');
    box(ctx, x + 0.22, y + 0.22, 0.06, 0.06, 22, '#3a3a3a', { z: 2 });
    box(ctx, x + 0.08, y + 0.08, 0.34, 0.34, 6, '#ffd890', { z: 22 });
  });
  const [gx, gy] = sp(x + 0.25, y + 0.25, 24);
  glows.push({ x: gx, y: gy, r: 34, rgb: '255,196,110', a: 0.35 });
}

function table(x, y, w, d, h = 9, col = '#a87445') {
  return (ctx) => {
    [[0.06, 0.06], [w - 0.2, 0.06], [0.06, d - 0.2], [w - 0.2, d - 0.2]].forEach(([ax, ay]) => box(ctx, x + ax, y + ay, 0.14, 0.14, h - 2, shade(col, 0.7)));
    box(ctx, x, y, w, d, 2, col, { z: h - 2 });
  };
}

function paper(ctx, x, y, z, w = 0.4, d = 0.3) { box(ctx, x, y, w, d, 0.8, '#f6f1e2', { z, top: '#ffffff' }); }

function serverRack(x, y, id) {
  obj(x, y, 0.9, 0.9, (ctx, t) => {
    box(ctx, x, y, 0.9, 0.9, 30, '#2f3640');
    const c = y + 0.9, working = live.status[id] === 'working';
    for (let r = 0; r < 5; r++) {
      const z0 = 3 + r * 5.4;
      faceQuad(ctx, '#1b2027', 'y', c, x + 0.08, x + 0.82, z0, z0 + 4);
      const blink = working ? Math.floor(t * 6 + r + x) % 3 : 0;
      const [lx, ly] = sp(x + 0.14, c, z0 + 2);
      px(ctx, working ? (blink ? '#5dd37a' : '#2d6a3e') : '#2d6a3e', lx, ly + 0, 1, 1);
      px(ctx, working && blink === 1 ? '#ffb347' : '#6b4a1f', lx + 3, ly + 1, 1, 1);
      faceQuad(ctx, '#3b444f', 'y', c, x + 0.3, x + 0.78, z0 + 1.5, z0 + 2.5);
    }
  });
}

function coffeeMachine(x, y) {
  obj(x, y, 0.8, 0.8, (ctx, t) => {
    box(ctx, x, y, 0.8, 0.8, 26, '#c9514a');
    faceQuad(ctx, '#1d2530', 'y', y + 0.8, x + 0.1, x + 0.7, 14, 23);
    faceQuad(ctx, '#7fd6ff', 'y', y + 0.8, x + 0.15, x + 0.4, 17, 20);
    faceQuad(ctx, '#ffd35a', 'y', y + 0.8, x + 0.48, x + 0.62, 17, 20);
    faceQuad(ctx, '#2b1d17', 'y', y + 0.8, x + 0.15, x + 0.65, 6, 12);
  });
}

function waterCooler(x, y) {
  obj(x, y, 0.6, 0.6, (ctx) => {
    box(ctx, x, y, 0.6, 0.6, 14, '#e9eef0');
    box(ctx, x + 0.08, y + 0.08, 0.44, 0.44, 12, '#8fd3f4', { z: 14, top: '#b9e6fb' });
    faceQuad(ctx, '#3d7fb0', 'y', y + 0.6, x + 0.22, x + 0.38, 7, 9);
  });
}

// ---- build rooms ----------------------------------------------------------------
function build() {
  // Outer back walls (full height) and the partitions (shorter, so you can see in).
  for (let i = 0; i < BW; i++) wallSeg('y', i, 0, WALL_H);
  for (let j = 0; j < BH; j++) wallSeg('x', j, 0, WALL_H);
  add(-0.7, (ctx) => box(ctx, -T, -T, T, T, WALL_H, CORR.wall));
  wall('x', 0, 6, 11, PART_H, 3);        // documents
  wall('y', 0, 8, 9, PART_H, 4);         // email
  wall('y', 11, 19, 9, PART_H, 15);      // automation
  wall('x', 9, 15, 11, PART_H, 12);      // automation
  add(20.4, (ctx) => box(ctx, 11 - T, 9 - T, T, T, PART_H, ROOMS.automation.wall));
  // Low rails along the open front edges (with doorways).
  rail('y', 0, 8, 7, ROOMS.developer, 4); rail('x', 0, 6, 9, ROOMS.developer, 3);
  rail('y', 11, 19, 7, ROOMS.documents, 15); rail('x', 0, 6, 20, ROOMS.documents);
  rail('x', 9, 15, 9, ROOMS.email, 12); rail('y', 0, 8, 16, ROOMS.email);
  rail('x', 9, 15, 20, ROOMS.automation); rail('y', 11, 19, 16, ROOMS.automation);
  for (const [p, i, c] of [['y', 4, 7], ['x', 3, 9], ['y', 15, 7]]) doorFrame(p, i, c, RAIL_H + 12);

  // Sign
  add(8.0, (ctx, t) => {
    faceQuad(ctx, '#2a1c16', 'y', 0, 7.7, 12.3, 13, 30);
    faceQuad(ctx, '#5a3b28', 'y', 0, 7.7, 12.3, 29, 30);
    wallText(ctx, 'ai-office', 7.95, 0, 17, '#ffcf6a', 2);
    const [gx, gy] = sp(10, 0, 22);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, gx, gy, 46, '255,190,90', 0.16 + Math.sin(t * 1.5) * 0.02); ctx.restore();
  });

  // ---------------- Development ----------------
  windowOn('y', 0, 3); windowOn('y', 0, 5); windowOn('x', 0, 5); windowOn('x', 0, 2);
  poster('y', 0, 6.3, 7.1, 13, 24, '#2f5d73', '#f0b95a'); clock(1.2, 0, 24);
  whiteboard('x', 0, 3.1, 4.6, [[0.1, 0.8, 0, '#2e86c1'], [0.1, 0.55, 1, '#c0392b'], [0.25, 0.9, 2, '#27ae60'], [0.1, 0.7, 3, '#2e86c1']], 8, 24);
  obj(0.1, 0.05, 2.0, 0.6, (ctx) => shelf(ctx, 'y', 0.1, 0.05, 1.9, 26, '#7a4e2e', 3, 1));
  workstation('developer', [1.3, 2.05]);
  emptyDesk(6, 1, 2, [1.4], 'developer');
  obj(0.1, 4.0, 1.0, 2.5, (ctx) => sofa(ctx, 'x', 0.1, 4.0, 2.5, '#4f7d91'));
  obj(1.5, 4.3, 0.8, 1.6, (ctx) => { table(1.5, 4.3, 0.8, 1.6, 5, '#7a4e2e')(ctx); box(ctx, 1.75, 4.7, 0.16, 0.16, 3, '#f2efe6', { z: 5 }); });
  obj(7.7, 0.15, 1, 0.8, plant(7.7, 0.15, 1.2), { key: 8.6 });
  obj(7.8, 5.6, 1, 1, plant(7.8, 5.6, 1));
  floorLamp(7.7, 3.2);
  obj(5.4, 5.3, 0.9, 0.9, (ctx) => box(ctx, 5.5, 5.4, 0.7, 0.7, 6, '#d9a441', { top: '#efc460' }), { block: true }); // pouf

  // ---------------- Documents ----------------
  windowOn('y', 0, 13); windowOn('y', 0, 16); windowOn('y', 0, 18);
  clock(14.2, 0, 26);
  obj(15.5, 0.05, 1, 0.8, (ctx) => { box(ctx, 15.5, 0.05, 1, 0.7, 17, '#8e969c'); [0, 1].forEach((k) => { faceQuad(ctx, '#6e767c', 'y', 0.75, 15.58, 16.42, 2 + k * 8, 8 + k * 8); faceQuad(ctx, '#d6dadd', 'y', 0.75, 15.9, 16.1, 4.5 + k * 8, 5.5 + k * 8); }); });
  obj(16.5, 0.05, 1, 0.8, (ctx) => { box(ctx, 16.5, 0.05, 1, 0.7, 17, '#8e969c'); [0, 1].forEach((k) => { faceQuad(ctx, '#6e767c', 'y', 0.75, 16.58, 17.42, 2 + k * 8, 8 + k * 8); faceQuad(ctx, '#d6dadd', 'y', 0.75, 16.9, 17.1, 4.5 + k * 8, 5.5 + k * 8); }); });
  obj(17.7, 0.2, 1.2, 0.9, (ctx) => { box(ctx, 17.7, 0.2, 1.2, 0.9, 12, '#d9dde0'); box(ctx, 17.75, 0.25, 1.1, 0.8, 1, '#4a5560', { z: 12 }); faceQuad(ctx, '#2e3a46', 'y', 1.1, 17.9, 18.4, 5, 9); });
  obj(11.1, 2.0, 0.6, 3.0, (ctx) => shelf(ctx, 'x', 11.1, 2.0, 3.0, 28, '#8a6a47', 3, 5, 'binders'));
  workstation('documents', [1.4]);
  add(13.1 + 1 + 1.35, (ctx) => { paper(ctx, 13.1, 1.1, 10, 0.4, 0.3); paper(ctx, 13.18, 1.15, 10.8, 0.4, 0.3); });
  obj(16, 3.6, 3, 1.6, (ctx) => { table(16, 3.6, 3, 1.6, 9, '#b98650')(ctx); paper(ctx, 16.3, 3.9, 9, 0.5, 0.4); paper(ctx, 17.4, 4.1, 9, 0.5, 0.4); paper(ctx, 18.0, 3.8, 9, 0.4, 0.5); box(ctx, 17.0, 4.5, 0.4, 0.3, 2, '#2e86c1', { z: 9 }); });
  add(16.7 + 5.2 + 0.1, (ctx) => box(ctx, 16.9, 5.4, 0.6, 0.6, 3, '#7b9e6b', { z: 5 })); // stool
  obj(19.0, 5.6, 1, 1, plant(19.0, 5.6, 1.1));
  floorLamp(12.0, 5.8);

  // ---------------- Email ----------------
  windowOn('x', 0, 14);
  poster('x', 0, 12.2, 13.0, 12, 22, '#f0d9a5', '#b8645d');
  obj(0.05, 10.0, 0.6, 3.6, (ctx) => shelf(ctx, 'x', 0.05, 10.0, 3.6, 28, '#6e4528', 4, 3, 'binders'));
  workstation('email', [1.4]);
  add(3.1 + 10 + 1.4, (ctx) => { paper(ctx, 3.15, 10.1, 10); box(ctx, 3.5, 10.12, 0.35, 0.25, 1.5, '#fffdf4', { z: 10 }); });
  obj(6.6, 9.3, 2, 0.9, (ctx) => { table(6.6, 9.3, 1.8, 0.8, 8, '#8f6b44')(ctx); box(ctx, 6.9, 9.45, 0.9, 0.5, 6, '#e8e8e8', { z: 10 }); box(ctx, 7.0, 9.95, 0.7, 0.2, 1, '#fff', { z: 10 }); });
  obj(5.0, 13.0, 2.6, 1.0, (ctx) => sofa(ctx, 'y', 5.0, 13.0, 2.6, '#6f9a76'));
  obj(5.3, 14.4, 1.4, 0.7, table(5.3, 14.4, 1.4, 0.7, 5, '#8f6b44'));
  obj(0.3, 14.8, 1, 1, plant(0.3, 14.8, 1.1)); obj(8.0, 9.4, 1, 0.9, plant(8.0, 9.4, 1.0), { key: 18.3 });
  floorLamp(8, 12);

  // ---------------- Automation ----------------
  poster('y', 9, 18.0, 18.9, 8, 18, '#3a566b', '#7fd6ff');
  whiteboard('x', 11, 10.0, 13.6, [[0.05, 0.25, 0, '#2e86c1'], [0.35, 0.55, 0, '#27ae60'], [0.65, 0.95, 0, '#8e44ad'], [0.25, 0.35, 1, '#555'], [0.55, 0.65, 1, '#555'], [0.05, 0.25, 2, '#e67e22'], [0.65, 0.95, 2, '#c0392b']], 5, 21);
  serverRack(16.2, 9.1, 'automation'); serverRack(17.2, 9.1, 'automation');
  coffeeMachine(18.9, 9.2);
  workstation('automation', [1.15, 1.7, 2.25]);
  add(13.1 + 10 + 1.4, (ctx) => { // small robot toy on the desk
    box(ctx, 15.6, 10.2, 0.25, 0.2, 4, '#d8dde2', { z: 10 }); box(ctx, 15.63, 10.22, 0.19, 0.16, 3, '#f0c040', { z: 14 });
  });
  obj(15.5, 13.2, 3, 1.2, (ctx) => { table(15.5, 13.2, 3, 1.2, 9, '#7d8c97')(ctx); box(ctx, 16.0, 13.5, 0.7, 0.5, 3, '#e8b030', { z: 9 }); box(ctx, 17.4, 13.4, 0.5, 0.5, 4, '#3b4a56', { z: 9 }); });
  obj(11.3, 14.6, 1, 1, plant(11.3, 14.6, 1.1)); obj(19.0, 14.5, 1, 1, plant(19.0, 14.5, 1.0));
  floorLamp(11.4, 12.2);

  // ---------------- Meeting room ----------------
  wall('x', 5, 11, 21, PART_H, 7);                       // west wall, doorway to the corridor
  for (let i = 21; i < 28; i++) wallSeg('y', i, 5, WALL_H); // back wall
  add(26.7, (ctx) => box(ctx, 21 - T, 5 - T, T, T, WALL_H, MEETING.wall));
  rail('x', 5, 11, 28, MEETING); rail('y', 21, 27, 12, MEETING);
  doorFrame('x', 7, 21, RAIL_H + 12);
  windowOn('y', 5, 21); windowOn('y', 5, 26); windowOn('x', 21, 9);
  whiteboard('y', 5, 22.6, 25.4, [[0.1, 0.9, 0, '#2e86c1'], [0.1, 0.6, 1, '#c0392b'], [0.1, 0.8, 2, '#27ae60'], [0.1, 0.5, 3, '#8e44ad']], 6, 27);
  clock(25.9, 5, 27);
  obj(23, 7, 3, 2, (ctx) => { // long table with laptops, papers and a coffee pot
    table(23, 7, 3, 2, 9, '#8f7b66')(ctx);
    paper(ctx, 23.3, 7.3, 9, 0.5, 0.4); paper(ctx, 24.4, 7.2, 9, 0.5, 0.4); paper(ctx, 23.5, 8.3, 9, 0.5, 0.4); paper(ctx, 24.7, 8.4, 9, 0.5, 0.4);
    box(ctx, 24.0, 7.8, 0.35, 0.35, 4, '#e8e8e8', { z: 9 }); box(ctx, 24.07, 7.87, 0.2, 0.2, 2, '#5a3b28', { z: 13 });
    box(ctx, 25.2, 7.7, 0.4, 0.3, 1, '#2c2c34', { z: 9 });
  });
  const seat = (x, y, side) => {
    add(x + y + 0.5, (ctx) => { box(ctx, x + 0.45, y + 0.45, 0.1, 0.1, 5, '#2a2a2a'); box(ctx, x + 0.14, y + 0.14, 0.72, 0.72, 3, shade(MEETING.trim, 1.35), { z: 5 }); });
    const back = { n: [0.14, 0.08, 0.72, 0.12], s: [0.14, 0.8, 0.72, 0.12], w: [0.08, 0.14, 0.12, 0.72], e: [0.8, 0.14, 0.12, 0.72] }[side];
    add(x + y + (side === 's' || side === 'e' ? 1.6 : 0.4), (ctx) => box(ctx, x + back[0], y + back[1], back[2], back[3], 10, shade(MEETING.trim, 1.15), { z: 8 }));
  };
  seat(24, 6, 'n'); seat(22, 8, 'w'); seat(24, 9, 's'); seat(26, 8, 'e');
  obj(26.3, 5.2, 0.8, 0.8, (ctx) => { box(ctx, 26.3, 5.2, 0.8, 0.8, 26, '#c9514a'); faceQuad(ctx, '#1d2530', 'y', 6.0, 26.4, 27.0, 14, 23); faceQuad(ctx, '#7fd6ff', 'y', 6.0, 26.45, 26.7, 17, 20); });
  obj(27.0, 10.9, 1, 1, plant(27.0, 10.9, 1.2)); obj(21.2, 10.7, 1, 1, plant(21.2, 10.7, 1.0));
  floorLamp(21.3, 5.4);

  // ---------------- Corridor & lounge ----------------
  waterCooler(10.1, 0.5);
  obj(9.0, 0.4, 1, 1, plant(9.0, 0.4, 1.3));
  obj(9.1, 5.0, 1, 1, plant(9.1, 5.0, 1.0));
  obj(9.05, 11.0, 1.9, 1, (ctx) => sofa(ctx, 'x', 9.05, 11.0, 1.9, '#c98a4b'), { block: false });
  obj(9.2, 14.8, 1, 1, plant(9.2, 14.8, 1.1), { block: false });
}

build();
items.sort((a, b) => a.key - b.key);

export const sceneItems = items;
export const sceneGlows = glows;
export function setOrigin() { V.ox = OX; V.oy = OY; }
