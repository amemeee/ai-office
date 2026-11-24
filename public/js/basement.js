// Basement (level B1): a parking garage for cars and motorcycles. Same footprint
// as the ground floor. The agents' own vehicles drive out when that agent is really Working and
// drive back when it is not. A few visitor cars come and go as background traffic (decorative).
import { V, sp, shade, px, poly, box, floorRect, faceQuad, wallText } from './draw.js';
import { W, H, BW, BH, WALL_H, RAIL_H, T, inside } from './scene.js';

const items = [];
const glows = [];
const add = (key, draw) => items.push({ key, draw });
const hash = (n) => { n = Math.imul(n | 0, 2654435761) >>> 0; return ((n ^ (n >>> 15)) >>> 0) / 4294967295; };

const CONC = '#7d8186';
const YELLOW = '#d1a826';
const LINE = '#d9dde0';

/** Labels for the vehicles that belong to an agent: { owner, base, mover }. */
export const VEHICLES = [];

// ---- floor ------------------------------------------------------------------------
export function drawFloor(ctx) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const base = (x + y) & 1 ? '#6b6f74' : '#64686d';
      floorRect(ctx, base, x, y, 1, 1);
      for (let k = 0; k < 3; k++) {
        const h1 = hash(x * 131 + y * 17 + k * 7), h2 = hash(x * 29 + y * 211 + k * 13);
        const [sx, sy] = sp(x + 0.2 + h1 * 0.6, y + 0.2 + h2 * 0.6, 0);
        px(ctx, k ? '#777b80' : '#585c61', sx, sy, 2, 1);
      }
    }
  }
  // driving lane (asphalt) with a dashed centre line and arrows
  floorRect(ctx, '#505459', 0, 7, 28, 2);
  for (let x = 0.4; x < 27; x += 1.3) floorRect(ctx, '#e0bd3a', x, 7.95, 0.75, 0.1);
  for (const ax of [3, 9.5, 16, 23]) {
    floorRect(ctx, LINE, ax, 7.42, 1.3, 0.1);
    poly(ctx, LINE, [sp(ax + 1.3, 7.08), sp(ax + 1.75, 7.47), sp(ax + 1.3, 7.86)]);
    floorRect(ctx, LINE, ax + 0.4, 8.5, 1.3, 0.1);
    poly(ctx, LINE, [sp(ax + 0.4, 8.12), sp(ax, 8.55), sp(ax + 0.4, 8.98)]);
  }
  // car bays: north row (nose to the wall) and south row
  for (let k = 0; k <= 9; k++) {
    floorRect(ctx, LINE, 1 + 2 * k - 0.04, 3.4, 0.08, 3.5);
    floorRect(ctx, LINE, 1 + 2 * k - 0.04, 9.1, 0.08, 3.5);
  }
  floorRect(ctx, LINE, 1, 3.36, 18, 0.08); floorRect(ctx, LINE, 1, 12.56, 18, 0.08);
  // motorcycle zone: yellow outline, one slot per bike
  floorRect(ctx, YELLOW, 0.8, 13.15, 18.4, 0.08); floorRect(ctx, YELLOW, 0.8, 15.85, 18.4, 0.08);
  for (let i = 0; i <= 18; i++) floorRect(ctx, YELLOW, 0.8 + i * 1.0, 13.15, 0.06, 2.78);
  // wing: bike bays on the north side, EV bays on the south side
  for (let i = 0; i <= 6; i++) floorRect(ctx, YELLOW, 21.5 + i * 1.0 - 0.04, 5.2, 0.06, 1.6);
  for (let k = 0; k <= 3; k++) floorRect(ctx, '#58c28a', 21.8 + k * 2.2 - 0.04, 9.1, 0.08, 2.7);
  // pedestrian crossing in front of the stairs
  for (let i = 0; i < 7; i++) floorRect(ctx, LINE, 1.1 + i * 0.5, 6.7, 0.28, 0.55);
  // oil stains
  for (const [ox, oy, r] of [[12.2, 5.3, 0.45], [8.6, 10.6, 0.35], [16.4, 11.2, 0.4], [4.3, 5.6, 0.3]]) {
    floorRect(ctx, '#4a4e53', ox, oy, r * 1.6, r);
    floorRect(ctx, '#41454a', ox + r * 0.3, oy + r * 0.2, r, r * 0.6);
  }
  // slab edge along the front sides
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y + 1)) poly(ctx, '#55595e', [sp(x, y + 1, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x, y + 1, -7)]);
      if (!inside(x + 1, y)) poly(ctx, '#3d4045', [sp(x + 1, y, 0), sp(x + 1, y + 1, 0), sp(x + 1, y + 1, -7), sp(x + 1, y, -7)]);
    }
  }
}

// ---- walls, pillars, barriers --------------------------------------------------------
function wallSeg(plane, i, c, height) {
  add((plane === 'y' ? i + c : c + i) - 0.6, (ctx) => {
    const stripe = i % 2 ? YELLOW : '#2a2c2f';
    if (plane === 'y') {
      box(ctx, i, c - T, 1, T, height, CONC, { top: shade(CONC, 1.28) });
      box(ctx, i, c - T, 1, T, 5, stripe);
    } else {
      box(ctx, c - T, i, T, 1, height, CONC, { top: shade(CONC, 1.28) });
      box(ctx, c - T, i, T, 1, 5, stripe);
    }
  });
}

function barrier(plane, i, c) {
  add((plane === 'y' ? i + c : c + i) + 0.5, (ctx) => {
    if (plane === 'y') box(ctx, i, c - T, 1, T, RAIL_H, '#8a8e93', { top: YELLOW });
    else box(ctx, c - T, i, T, 1, RAIL_H, '#8a8e93', { top: YELLOW });
  });
}

function pillar(x, y) {
  add(x + y + 0.6, (ctx) => {
    box(ctx, x, y, 0.5, 0.5, 26, '#8b8f94');
    box(ctx, x - 0.02, y - 0.02, 0.54, 0.54, 5, YELLOW);
    box(ctx, x - 0.02, y - 0.02, 0.54, 0.54, 2, '#2a2c2f');
  });
}

// ---- vehicles -----------------------------------------------------------------------
const KINDS = {
  sedan: { body: 6, cab: 5, cy: 0.65, cl: 1.1 },
  hatch: { body: 6, cab: 5, cy: 0.55, cl: 1.4 },
  suv: { body: 7, cab: 5, cy: 0.45, cl: 1.6 },
  van: { body: 9, cab: 5, cy: 0.12, cl: 2.05 },
};
const noseAtPlus = (dir) => dir === 'S' || dir === 'E';

/** Maps "along the vehicle / across it" coordinates onto the world for the four driving directions. */
function frame(dir, cx, cy, l, w) {
  const alongY = dir === 'N' || dir === 'S';
  return {
    box(ctx, u, ul, v, vw, h, col, o) {
      if (alongY) box(ctx, cx - w / 2 + v, cy - l / 2 + u, vw, ul, h, col, o);
      else box(ctx, cx - l / 2 + u, cy - w / 2 + v, ul, vw, h, col, o);
    },
    end(ctx, col, v0, v1, z0, z1, u) { // face at the +end of the vehicle (visible from the camera)
      if (alongY) faceQuad(ctx, col, 'y', cy - l / 2 + u, cx - w / 2 + v0, cx - w / 2 + v1, z0, z1);
      else faceQuad(ctx, col, 'x', cx - l / 2 + u, cy - w / 2 + v0, cy - w / 2 + v1, z0, z1);
    },
    side(ctx, col, u0, u1, z0, z1, v) { // face on the +side
      if (alongY) faceQuad(ctx, col, 'x', cx - w / 2 + v, cy - l / 2 + u0, cy - l / 2 + u1, z0, z1);
      else faceQuad(ctx, col, 'y', cy - w / 2 + v, cx - l / 2 + u0, cx - l / 2 + u1, z0, z1);
    },
    shadow(ctx) {
      if (alongY) floorRect(ctx, 'rgba(0,0,0,0.3)', cx - w / 2 - 0.04, cy - l / 2 + 0.04, w + 0.14, l + 0.1);
      else floorRect(ctx, 'rgba(0,0,0,0.3)', cx - l / 2 - 0.04, cy - w / 2 + 0.04, l + 0.1, w + 0.14);
    },
  };
}

function drawCar(ctx, c) {
  const w = 1.1, l = 2.4, k = KINDS[c.kind || 'sedan'], plus = noseAtPlus(c.dir), f = frame(c.dir, c.cx, c.cy, l, w);
  const zb = 2 + k.body, cabU = plus ? k.cy : l - k.cy - k.cl; // the cabin sits nearer the tail
  f.shadow(ctx);
  for (const u of [0.25, l - 0.65]) { f.box(ctx, u, 0.4, -0.02, 0.1, 4, '#17181a'); f.box(ctx, u, 0.4, w - 0.08, 0.1, 4, '#17181a'); }
  f.box(ctx, 0, l, 0, w, k.body, c.col, { z: 2 });
  f.box(ctx, cabU, k.cl, 0.1, w - 0.2, k.cab, shade(c.col, 1.04), { z: zb });
  f.side(ctx, '#27313c', cabU + 0.08, cabU + k.cl - 0.08, zb + 1, zb + k.cab - 0.8, w - 0.1);
  f.side(ctx, '#4d6479', cabU + 0.12, cabU + 0.4, zb + 1.4, zb + k.cab - 1.4, w - 0.1);
  f.end(ctx, '#27313c', 0.17, w - 0.17, zb + 1, zb + k.cab - 0.8, cabU + k.cl);
  const lc = plus ? '#fff4c2' : '#d8342c';
  f.end(ctx, lc, 0.08, 0.3, 4, 5.6, l); f.end(ctx, lc, w - 0.3, w - 0.08, 4, 5.6, l); f.end(ctx, '#f1f1e6', 0.4, w - 0.4, 3.2, 4.4, l);
}

function drawBike(ctx, c) {
  const l = 1.6, w = 0.5, plus = noseAtPlus(c.dir), f = frame(c.dir, c.cx, c.cy, l, w);
  const fu = plus ? 1.2 : 0.02, ru = plus ? 0.02 : 1.2;
  f.shadow(ctx);
  f.box(ctx, fu, 0.38, 0.17, 0.16, 6, '#17181a');                              // front wheel
  f.box(ctx, ru, 0.38, 0.17, 0.16, 6, '#17181a');                              // rear wheel
  f.box(ctx, plus ? 1.1 : 0.1, 0.34, 0.22, 0.06, 7, '#9aa0a6', { z: 1 });      // fork
  f.box(ctx, plus ? 0.62 : 0.42, 0.55, 0.12, 0.26, 4, c.col, { z: 4 });        // tank
  f.box(ctx, plus ? 0.3 : 0.9, 0.4, 0.14, 0.22, 2, '#222427', { z: 5 });       // seat
  f.box(ctx, plus ? 0.98 : 0.3, 0.06, -0.02, 0.54, 1, '#3a3d41', { z: 11 });   // handlebar
  f.end(ctx, plus ? '#fff4c2' : '#d8342c', 0.2, 0.3, 5, 6.4, l - 0.02);
}

// ---- parking slots (a returning vehicle takes a random free one) ----------------------
const SLOTS = [];
for (let k = 0; k < 9; k++) SLOTS.push({ type: 'car', cx: 2 + 2 * k, cy: 5.05, dir: 'N', taken: false }, { type: 'car', cx: 2 + 2 * k, cy: 11.0, dir: 'S', taken: false });
for (let i = 0; i < 18; i++) SLOTS.push({ type: 'bike', cx: 1.55 + i, cy: 14.3, dir: 'S', taken: false });
const slotAt = (type, cx, cy) => SLOTS.find((q) => q.type === type && Math.abs(q.cx - cx) < 0.6 && Math.abs(q.cy - cy) < 0.6);
const occupy = (type, cx, cy) => { const q = slotAt(type, cx, cy); if (q) q.taken = true; return q; };

// ---- what can be clicked ---------------------------------------------------------------
const COLOUR = {
  '#e8e8ea': 'White', '#b03a35': 'Red', '#d9b63a': 'Yellow', '#b9bec4': 'Silver', '#23324d': 'Navy', '#7a3f8f': 'Purple', '#3d86c6': 'Blue',
  '#2b2e33': 'Black', '#8d9298': 'Grey', '#f1f1f1': 'White', '#1c1d20': 'Black', '#5d7a99': 'Blue-grey', '#4f9a6a': 'Green',
  '#2d6fb0': 'Blue', '#9aa0a6': 'Grey', '#e67e22': 'Orange', '#e8e8e8': 'White', '#c0392b': 'Red',
};
const KIND_NAME = { sedan: 'sedan', hatch: 'hatchback', suv: 'SUV', van: 'van' };
const describe = (col, kind, type) => `${COLOUR[col] || 'Parked'} ${type === 'bike' ? 'motorcycle' : KIND_NAME[kind] || 'car'}`;
const CLICK = []; // { type, desc, owner, slot, mover, fixed:{x,y} }
const bayName = (q) => (!q ? null : q.type === 'bike' ? `motorcycle bay ${Math.round(q.cx - 1.55) + 1}` : `row ${q.dir === 'N' ? 'A' : 'B'} · bay ${(q.cx - 2) / 2 + 1}`);

const entryPos = (e) => (e.mover ? (e.mover.state === 'away' ? { x: e.mover.home.cx, y: e.mover.home.cy } : e.mover.pos) : e.fixed);
const entryVisible = (e) => !e.mover || e.mover.state !== 'away';
export const entryOf = (m) => CLICK.find((e) => e.mover === m);
/** Position of a clickable vehicle (an away vehicle is shown at the bay it left). */
export const posOf = (e) => entryPos(e);
/** Which vehicle is under the point (bx, by) of the office picture? The one nearest the camera wins. */
export function pickAt(bx, by) {
  const hits = [];
  for (const e of CLICK) {
    if (!entryVisible(e)) continue;
    const p = entryPos(e), [fx, fy] = sp(p.x, p.y, 0);
    const bike = e.type === 'bike', hw = bike ? 12 : 29, top = bike ? 20 : (e.desc.endsWith('van') ? 32 : 27), bot = bike ? 7 : 12;
    if (Math.abs(bx - fx) <= hw && by >= fy - top && by <= fy + bot) hits.push({ e, k: p.x + p.y });
  }
  hits.sort((a, b) => b.k - a.k);
  return hits.length ? hits[0].e : null;
}
/** Turntable for the box vehicles: the four diagonal views, redrawn facing each way. */
const BOX_VIEWS = [
  { name: 'Rear · right side', dir: 'N' }, { name: 'Rear · left side', dir: 'W' },
  { name: 'Front · left side', dir: 'E' }, { name: 'Front · right side', dir: 'S' },
];
/** Turntable for 2D-art vehicles: every angle comes from the artwork (mirrored where noted). */
const ART_VIEWS = [
  { name: 'Rear · right side', img: 'rear' }, { name: 'Rear', img: 'flatRear', flat: true }, { name: 'Rear · left side', img: 'rear', mirror: true },
  { name: 'Left side', img: 'flatSide', flat: true }, { name: 'Front · left side', img: 'front', mirror: true },
  { name: 'Front', img: 'flatFront', flat: true }, { name: 'Front · right side', img: 'front' },
  { name: 'Right side', img: 'flatSide', flat: true, mirror: true }, { name: 'Top', img: 'flatTop', flat: true },
];
export const viewsFor = (e) => (e.mover && e.mover.art && artReady ? ART_VIEWS : BOX_VIEWS);

/**
 * Draws one vehicle large into the preview canvas, seen from the chosen angle.
 * 2D-art vehicles use the artwork; the others are redrawn facing that way.
 * Returns false while the artwork is still loading.
 */
export function drawPreview(cv, e, view, art) {
  const views = viewsFor(e), v = views[((view % views.length) + views.length) % views.length], ctx = cv.getContext('2d');
  if (e.mover && e.mover.art && artReady) {
    cv.width = 460; cv.height = 260; cv.classList.remove('pixel');
    const img = art[v.img];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const w = v.flat ? img.naturalWidth * 0.84 : 400, h = (w * img.naturalHeight) / img.naturalWidth;
    ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.translate(230, 140); if (v.mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
    return true;
  }
  const bike = e.type === 'bike', z = bike ? 3.2 : 1.7, W = 116, Hh = 66, cx = 10, cy = 10;
  cv.width = W; cv.height = Hh; cv.classList.add('pixel');
  const keep = { x: V.ox, y: V.oy };
  V.ox = W / 2 / z - (cx - cy) * 16; V.oy = (Hh * 0.68) / z - (cx + cy) * 8;
  ctx.save(); ctx.scale(z, z);
  (bike ? drawBike : drawCar)(ctx, { cx, cy, dir: v.dir, col: e.col, kind: e.kind });
  ctx.restore();
  V.ox = keep.x; V.oy = keep.y;
  return true;
}

/** Live facts about a vehicle (the office adds the owner's real agent status). */
export function infoFor(e) {
  const m = e.mover;
  const state = m ? m.state : 'parked';
  const bay = bayName(m ? (state === 'parked' ? m.slot : null) : e.slot);
  const text = state === 'parked' ? `Parked in ${bay || 'the garage'}` : state === 'leaving' ? 'Driving out of the garage' : state === 'arriving' ? 'Driving into the garage' : 'Out of the garage';
  return { desc: e.desc, owner: e.owner || null, state, text };
}

function car(x, y, col, facing, kind = 'sedan') { // static parked car: x, y = top-left of the 1.1 x 2.4 footprint
  const c = { cx: x + 0.55, cy: y + 1.2, dir: facing === 'n' ? 'N' : 'S', col, kind };
  const slot = occupy('car', c.cx, c.cy);
  CLICK.push({ type: 'car', desc: describe(col, kind, 'car'), owner: null, slot, col, kind, fixed: { x: c.cx, y: c.cy } });
  add(c.cx + c.cy + 0.2, (ctx) => drawCar(ctx, c));
}
function bike(x, y, col, facing) {
  const c = { cx: x + 0.25, cy: y + 0.8, dir: facing === 'n' ? 'N' : 'S', col };
  const slot = occupy('bike', c.cx, c.cy);
  CLICK.push({ type: 'bike', desc: describe(col, null, 'bike'), owner: null, slot, col, fixed: { x: c.cx, y: c.cy } });
  add(c.cx + c.cy + 0.2, (ctx) => drawBike(ctx, c));
}

// ---- moving vehicles ------------------------------------------------------------------
const LANE_OUT = 8.3, LANE_IN = 7.5, EXIT_X = 29.5, SPEED = { car: 2.6, bike: 3.2, sprite: 2.6 };
let clock = 0;
let barrierOpen = false;
let lastStatus = {};
const movers = [];
let artReady = false; // true only when every optional artwork file loaded; otherwise the box car is drawn
export const setArtReady = (v) => { artReady = !!v; };
export const SPRITE_ART = {
  rear: 'assets/vehicles/sportscar-rear.png', front: 'assets/vehicles/sportscar-front.png',
  flatSide: 'assets/vehicles/sportscar-flat-side.png', flatFront: 'assets/vehicles/sportscar-flat-front.png',
  flatRear: 'assets/vehicles/sportscar-flat-rear.png', flatTop: 'assets/vehicles/sportscar-flat-top.png',
};

class Mover {
  constructor(o) {
    Object.assign(this, o);
    this.pos = { x: o.cx, y: o.cy }; this.dir = o.dir; this.home = { cx: o.cx, cy: o.cy, dir: o.dir };
    this.state = 'parked'; this.route = []; this.awayAt = 0; this.returnAt = 0;
    this.slot = occupy(o.type === 'bike' ? 'bike' : 'car', o.cx, o.cy);
  }
  get key() { return this.pos.x + this.pos.y + 0.2; }
  outRoute() {
    const h = this.home;
    if (this.type === 'bike') return [{ x: h.cx, y: 12.9, dir: 'N' }, { x: 0.5, y: 12.9, dir: 'W' }, { x: 0.5, y: LANE_OUT, dir: 'N' }, { x: EXIT_X, y: LANE_OUT, dir: 'E' }];
    return [{ x: h.cx, y: LANE_OUT, dir: h.dir }, { x: EXIT_X, y: LANE_OUT, dir: 'E' }]; // reverse out of the bay, then drive to the exit
  }
  inRoute() {
    const h = this.home;
    if (this.type === 'bike') return [{ x: 0.5, y: LANE_IN, dir: 'W' }, { x: 0.5, y: 12.9, dir: 'S' }, { x: h.cx, y: 12.9, dir: 'E' }, { x: h.cx, y: h.cy, dir: 'S' }];
    return [{ x: h.cx, y: LANE_IN, dir: 'W' }, { x: h.cx, y: h.cy, dir: h.dir }];
  }
  depart() { if (this.state === 'parked') { this.route = this.outRoute(); this.state = 'leaving'; if (this.slot) this.slot.taken = false; } }
  recall() {
    if (this.state !== 'away') return;
    const free = SLOTS.filter((q) => q.type === (this.type === 'bike' ? 'bike' : 'car') && !q.taken);
    if (!free.length) return; // garage full: wait outside and try again
    const q = free[Math.floor(Math.random() * free.length)];
    q.taken = true; this.slot = q; this.home = { cx: q.cx, cy: q.cy, dir: q.dir };
    this.pos = { x: EXIT_X, y: LANE_IN }; this.dir = 'W'; this.route = this.inRoute(); this.state = 'arriving';
  }
  update(dt) {
    if (!this.route.length) return;
    const w = this.route[0], dx = w.x - this.pos.x, dy = w.y - this.pos.y, d = Math.hypot(dx, dy), step = (SPEED[this.type] || 2.6) * dt;
    this.dir = w.dir;
    if (d <= step) {
      this.pos.x = w.x; this.pos.y = w.y; this.route.shift();
      if (!this.route.length) {
        if (this.state === 'leaving') { this.state = 'away'; this.awayAt = clock; this.returnAt = clock + 8 + Math.random() * 14; }
        else if (this.state === 'arriving') { this.state = 'parked'; this.dir = this.home.dir; this.pos = { x: this.home.cx, y: this.home.cy }; }
      }
    } else { this.pos.x += (dx / d) * step; this.pos.y += (dy / d) * step; }
  }
  draw(ctx) { (this.type === 'bike' ? drawBike : drawCar)(ctx, { cx: this.pos.x, cy: this.pos.y, dir: this.dir, col: this.col, kind: this.kind }); }
}

function mover(o) {
  const m = new Mover(o); movers.push(m);
  CLICK.push({ type: o.type === 'bike' ? 'bike' : 'car', desc: o.desc || describe(o.col, o.kind, o.type), owner: o.owner || null, col: o.col, kind: o.kind, mover: m });
  return m;
}

let ambientIn = 8;
/**
 * Advance every vehicle. Agent-owned vehicles follow the REAL agent status (away while it is working);
 * ambient visitor cars come and go on a timer and are only background scenery.
 */
export function update(dt, status) {
  clock += dt; lastStatus = status || {};
  ambientIn -= dt;
  for (const m of movers) {
    if (m.owner) {
      const working = lastStatus[m.owner] === 'working';
      if (working && m.state === 'parked') m.depart();
      else if (!working && m.state === 'away' && clock - m.awayAt > 5) m.recall();
    } else if (m.state === 'away' && clock > m.returnAt) m.recall();
    m.update(dt);
  }
  if (ambientIn <= 0) {
    ambientIn = 14 + Math.random() * 18;
    const pool = movers.filter((m) => !m.owner && m.state === 'parked');
    if (pool.length) pool[Math.floor(Math.random() * pool.length)].depart();
  }
  barrierOpen = movers.some((m) => (m.state === 'leaving' || m.state === 'arriving') && m.pos.x > 23);
}

/** Moving/parked box vehicles for this frame, to be merged with the static items by depth. */
export const dynamicItems = () => movers.filter((m) => (m.art == null || !artReady) && m.state !== 'away').map((m) => ({ key: m.key, draw: (ctx) => m.draw(ctx) }));
/** 2D-art vehicles for this frame: { art, x, y, dir, key }. */
export const spriteMovers = () => movers.filter((m) => m.art && artReady && m.state !== 'away').map((m) => ({ art: m.art, x: m.pos.x, y: m.pos.y, dir: m.dir, key: m.key, lift: m.lift, w: m.spriteW }));
/** Everything that may stand in front of a sprite at depth `key`. */
export const inFront = (key) => [...items.filter((it) => it.key > key), ...dynamicItems().filter((it) => it.key > key)];
/** Label position and text for an owner's vehicle (it stays at its bay, marked as out, while away). */
export function labelFor(tag) {
  const m = tag.mover, away = m.state === 'away';
  const x = away ? m.home.cx : m.pos.x, y = away ? m.home.cy : m.pos.y;
  return { x, y, z: tag.z || 20, text: away ? `${tag.base} · out (${lastStatus[tag.owner] || 'idle'})` : tag.base };
}

// ---- props --------------------------------------------------------------------------
function stairCore() {
  add(1 + 0.2 + 3.0 + 1.4, (ctx) => {
    box(ctx, 1, 0.2, 3.6, 2.8, 34, '#8d9196', { top: '#a4a8ad' });
    faceQuad(ctx, '#2f6b4a', 'y', 3.0, 2.1, 3.3, 0, 20);
    faceQuad(ctx, '#1f4a33', 'y', 3.0, 2.6, 2.8, 0, 20);
    faceQuad(ctx, '#6fe3a5', 'y', 3.0, 2.15, 3.25, 21, 23);
    faceQuad(ctx, '#10202c', 'y', 3.0, 1.1, 1.95, 15, 25);
    wallText(ctx, 'b1', 1.18, 3.0, 17, '#ffffff', 1);
  });
}

function evCharger(x, y) {
  add(x + y + 0.4, (ctx) => {
    box(ctx, x, y, 0.3, 0.3, 18, '#2c3640', { top: '#3b4754' });
    faceQuad(ctx, '#58c28a', 'y', y + 0.3, x + 0.06, x + 0.24, 10, 15);
    box(ctx, x + 0.1, y + 0.3, 0.1, 0.5, 1, '#111', { z: 4 });
  });
}

function crate(x, y, col = '#9a7a4a') { add(x + y + 0.9, (ctx) => { box(ctx, x, y, 0.8, 0.8, 9, col, { top: shade(col, 1.2) }); box(ctx, x + 0.05, y + 0.05, 0.7, 0.7, 1, shade(col, 0.8), { z: 9 }); }); }
function barrel(x, y, col = '#2f6f9a') { add(x + y + 0.7, (ctx) => { box(ctx, x, y, 0.55, 0.55, 12, col, { top: shade(col, 1.3) }); box(ctx, x - 0.01, y - 0.01, 0.57, 0.57, 1.5, shade(col, 0.6), { z: 5 }); }); }

function extinguisher(x, y) {
  add(x + y + 0.5, (ctx) => { box(ctx, x, y, 0.16, 0.16, 8, '#d03a2f', { z: 6 }); box(ctx, x + 0.03, y + 0.03, 0.1, 0.1, 2, '#222', { z: 14 }); });
}

function wallLamp(x) {
  add(x + 0.2, (ctx) => { box(ctx, x, 0.03, 0.9, 0.12, 2, '#e8f2ff', { z: 27, top: '#ffffff' }); });
  const [gx, gy] = sp(x + 0.45, 0.2, 25);
  glows.push({ x: gx, y: gy, r: 46, rgb: '190,215,255', a: 0.24 });
  const [fx, fy] = sp(x + 0.45, 4.2, 0);
  glows.push({ x: fx, y: fy, r: 56, rgb: '190,215,255', a: 0.13 });
}

function boomBarrier() {
  add(28 - 0.4 + 7.5 + 1, (ctx) => {
    box(ctx, 27.4, 6.85, 0.25, 0.25, 14, '#3b4754');
    box(ctx, 27.4, 8.9, 0.25, 0.25, 14, '#3b4754');
    if (barrierOpen) { for (let i = 0; i < 3; i++) box(ctx, 27.45, 6.9, 0.14, 0.14, 4 + i * 5, i % 2 ? '#e8e8e8' : '#d8342c', { z: 14 + i * 4 }); return; }
    for (let i = 0; i < 4; i++) box(ctx, 27.45, 7.1 + i * 0.45, 0.14, 0.45, 2, i % 2 ? '#e8e8e8' : '#d8342c', { z: 12 });
  });
}

// ---- build ---------------------------------------------------------------------------
function build() {
  // concrete back walls (main building + east wing) with hazard-striped bases
  for (let i = 0; i < BW; i++) wallSeg('y', i, 0, WALL_H);
  for (let j = 0; j < BH; j++) wallSeg('x', j, 0, WALL_H);
  add(-0.7, (ctx) => box(ctx, -T, -T, T, T, WALL_H, CONC));
  for (let i = 21; i < 28; i++) wallSeg('y', i, 5, WALL_H);
  wallSeg('y', 20, 7, 12);
  add(26.7, (ctx) => box(ctx, 21 - T, 5 - T, T, T, WALL_H, CONC));
  // low barriers along the open front edges
  for (let i = 0; i < BW; i++) barrier('y', i, 16);
  for (let j = 0; j < BH; j++) if (j < 7 || j > 8) barrier('x', j, 20);
  for (let i = 21; i < 28; i++) barrier('y', i, 12);
  for (let j = 5; j < 12; j++) { if (j < 7 || j > 8) barrier('x', j, 28); }
  for (let j = 5; j < 7; j++) barrier('x', j, 21);
  for (let j = 9; j < 12; j++) barrier('x', j, 21);
  barrier('y', 20, 9);

  // sign
  add(8.0, (ctx) => {
    faceQuad(ctx, '#10202c', 'y', 0, 7.9, 12.2, 13, 30);
    faceQuad(ctx, '#2e6fb0', 'y', 0, 7.9, 12.2, 29, 30);
    wallText(ctx, 'parking', 8.45, 0, 17, '#ffffff', 2);
  });
  [3.5, 8.5, 13.2, 17.2].forEach(wallLamp);
  stairCore();
  extinguisher(4.9, 0.25); extinguisher(14.6, 0.25);
  crate(15.2, 0.6); crate(16.2, 0.6); crate(16.0, 1.5, '#8c6a3e'); barrel(18.0, 0.7); barrel(18.7, 1.2, '#b0592f'); barrel(18.0, 1.9, '#2f6f9a');
  [5, 9, 13, 17].forEach((x) => { pillar(x - 0.3, 6.35); pillar(x - 0.3, 9.05); });

  // static parked cars: north row faces the wall, south row faces the lane
  const N = 3.85, S = 9.8;
  car(1.45, N, '#e8e8ea', 'n', 'sedan');
  car(9.45, N, '#b03a35', 'n', 'sedan');
  car(15.45, N, '#d9b63a', 'n', 'hatch');
  car(3.45, S, '#b9bec4', 's', 'sedan');
  car(11.45, S, '#23324d', 's', 'sedan');
  car(17.45, S, '#7a3f8f', 's', 'hatch');

  // vehicles that move. Owners: Dex (sports car, optional 2D art), Paige (hatch), Otto (van), Milo (motorcycle).
  const own = (m, owner, base, z) => { m.owner = owner; const e = entryOf(m); if (e) e.owner = owner; VEHICLES.push({ owner, base, mover: m, z }); return m; };
  own(mover({ type: 'sprite', desc: 'silver sports car', art: 'sportscar', col: '#b9bec4', kind: 'sedan', cx: 6.0, cy: 5.05, dir: 'N', lift: 6, spriteW: 56 }), 'developer', "Dex's sports car", 20);
  own(mover({ type: 'car', cx: 4.0, cy: 5.05, dir: 'N', col: '#4f9a6a', kind: 'hatch', desc: 'green hatchback' }), 'documents', "Paige's car", 24);
  own(mover({ type: 'car', cx: 6.0, cy: 11.0, dir: 'S', col: '#5d7a99', kind: 'van', desc: 'blue-grey van' }), 'automation', "Otto's van", 26);
  own(mover({ type: 'bike', cx: 4.55, cy: 14.3, dir: 'S', col: '#c0392b', desc: 'red motorcycle' }), 'email', "Milo's motorcycle", 14);
  // background traffic (decorative visitors)
  mover({ type: 'car', cx: 8.0, cy: 5.05, dir: 'N', col: '#2b2e33', kind: 'suv' });
  mover({ type: 'car', cx: 14.0, cy: 5.05, dir: 'N', col: '#8d9298', kind: 'sedan' });
  mover({ type: 'car', cx: 10.0, cy: 11.0, dir: 'S', col: '#f1f1f1', kind: 'suv' });
  mover({ type: 'car', cx: 16.0, cy: 11.0, dir: 'S', col: '#1c1d20', kind: 'sedan' });

  // other parked motorcycles
  const B = 13.5;
  bike(1.3, B, '#2d6fb0', 's'); bike(6.3, B, '#9aa0a6', 's');
  bike(7.3, B, '#e67e22', 's'); bike(10.3, B, '#e8e8e8', 's'); bike(13.3, B, '#1c1d20', 's'); bike(14.3, B, '#c0392b', 's');
  bike(21.8, 5.4, '#2d6fb0', 'n'); bike(23.8, 5.4, '#e8e8e8', 'n'); bike(25.8, 5.4, '#c0392b', 'n');

  // east wing: EV charging
  evCharger(22.4, 9.2); evCharger(24.6, 9.2);
  car(21.9, 9.5, '#e8e8ea', 'n', 'sedan'); car(24.1, 9.5, '#3d86c6', 'n', 'hatch');
  boomBarrier();
}

build();
items.sort((a, b) => a.key - b.key);

export const sceneItems = items;
export const sceneGlows = glows;
