// Pixel characters: sprite drawing + a small behaviour state machine whose
// inputs are the REAL agent status coming from the server.
import { sp, px, poly } from './draw.js';

const INK = '#2b1d17';

/** Draws one character with its feet at world position (c.x, c.y). */
export function drawChar(ctx, c, t, tint = null, ox = 0, oy = 0) {
  const [fx0, fy0] = sp(c.x, c.y, 0);
  const fx = fx0 + ox, fy = fy0 + oy;
  const L = c.look;
  const front = c.dir === 'SE' || c.dir === 'SW';
  const flip = c.dir === 'SW' || c.dir === 'NW';
  const P = (color, dx, dy, w, h) => px(ctx, tint || color, fx + (flip ? -dx - w : dx), fy + dy, w, h);

  const sit = c.pose === 'sit';
  const walk = c.pose === 'walk';
  const step = walk ? Math.floor(t * 8) % 2 : 0;
  const breathe = !walk && !sit && Math.floor(t * 1.2 + c.phase) % 2 === 0 ? 0 : 0;
  const bob = walk ? (step ? -1 : 0) : (sit ? 0 : (Math.floor(t * 1.4 + c.phase) % 2 ? -1 : 0) + breathe);
  const sy = sit ? 5 : 0; // seated: body lowered
  const headShake = c.status === 'error' && !sit ? (Math.floor(t * 5) % 2 ? 1 : 0) : 0;

  if (!tint && !sit) P('rgba(0,0,0,0.22)', -4, -1, 8, 2);

  // legs
  if (!sit) {
    const l1 = walk && step ? 1 : 0, l2 = walk && !step ? 1 : 0;
    P(L.pants, -3, -7, 3, 5 - l1); P(L.pants, 0, -7, 3, 5 - l2);
    P(L.shoes, -3, -2 - l1, 3, 2); P(L.shoes, 0, -2 - l2, 3, 2);
  } else {
    P(L.pants, -3, -7 + sy, 6, 3);
  }

  // torso + arms
  const ty = -14 + sy + bob;
  P(L.shirt, -4, ty, 8, 7);
  P(L.shirtDark, -4, ty + 6, 8, 1);
  if (front) P(L.skin, -1, ty, 2, 1);
  if (L.tie) { // collar + tie
    if (front) { P('#ffffff', -2, ty, 1, 2); P('#ffffff', 1, ty, 1, 2); P(L.tie, -1, ty + 1, 2, 5); P(L.tie, -1, ty + 1, 2, 1); }
    else P('#ffffff', -3, ty, 6, 1);
  }
  const typing = c.pose === 'sit' && c.typing;
  const armUp = typing ? (Math.floor(t * 9) % 2) : 0;
  const swing = walk ? (step ? 1 : -1) : 0;
  P(L.shirt, -5, ty + 1 + (typing ? 1 : swing), 1, 4);
  P(L.shirt, 4, ty + 1 + (typing ? 1 : -swing), 1, 4);
  P(L.skin, -5, ty + 5 + (typing ? 1 - armUp : swing), 1, 1);
  P(L.skin, 4, ty + 5 + (typing ? armUp : -swing), 1, 1);

  // head
  const hy = ty - 7 + headShake;
  P(L.skin, -3, hy, 7, 7);
  if (front) {
    P(L.hair, -3, hy, 7, 3);
    P(L.hair, -3, hy + 3, 1, 1); P(L.hair, 3, hy + 3, 1, 1);
    if (L.hairStyle === 'long') { P(L.hair, -4, hy + 1, 1, 7); P(L.hair, 4, hy + 1, 1, 7); }
    if (L.hairStyle === 'messy') { // tousled fringe and spikes
      P(L.hair, -4, hy + 1, 1, 3); P(L.hair, 4, hy + 1, 1, 2);
      P(L.hair, -3, hy - 1, 2, 1); P(L.hair, 0, hy - 2, 2, 2); P(L.hair, 2, hy - 1, 2, 1);
      P(L.hair, -2, hy + 3, 2, 1); P(L.hair, 1, hy + 3, 1, 1);
    }
    P(INK, -1, hy + 4, 1, 1); P(INK, 2, hy + 4, 1, 1);
    if (L.bandage) { P('#ffffff', 2, hy + 5, 2, 2); P(INK, 2, hy + 5, 1, 1); P(INK, 3, hy + 6, 1, 1); }
    if (L.acc === 'glasses') { P('#e8dcc0', -2, hy + 3, 3, 1); P('#e8dcc0', 1, hy + 3, 3, 1); P(INK, -1, hy + 4, 1, 1); P(INK, 2, hy + 4, 1, 1); }
    if (c.status === 'error') P('#d9534f', -1, hy + 6, 3, 1); else P('#b5563c', 0, hy + 6, 2, 1);
  } else {
    P(L.hair, -3, hy, 7, 6);
    if (L.hairStyle === 'messy') { P(L.hair, -4, hy + 1, 1, 4); P(L.hair, 4, hy + 1, 1, 4); P(L.hair, -2, hy - 1, 2, 1); P(L.hair, 1, hy - 2, 3, 2); }
    if (L.hairStyle === 'long') P(L.hair, -4, hy + 1, 9, 8);
    P(L.skin, -2, hy + 6, 5, 1);
  }
  if (L.acc === 'headset') {
    P('#3d3d46', -4, hy + 2, 1, 3); P('#3d3d46', 4, hy + 2, 1, 3); P('#3d3d46', -3, hy - 1, 7, 1);
    if (front) P('#3d3d46', -4, hy + 5, 3, 1);
  }
  if (L.acc === 'cap') {
    P(L.cap, -3, hy - 1, 7, 3);
    if (front) P(L.cap, -4, hy + 2, 9, 1);
  }
  c.headY = fy + hy - 1; // used to anchor the bubble
}

const BUBBLES = {
  working: { bg: '#fff4dc', fg: '#3b2a1e' },
  waiting_approval: { bg: '#ffd35a', fg: '#3b2a1e' },
  error: { bg: '#e0584f', fg: '#fff' },
  paused: { bg: '#cfd8dc', fg: '#33424a' },
};

/** Status bubble above a character (pixel art). Only shown for real states. */
export function drawBubble(ctx, c, t) {
  const b = BUBBLES[c.status];
  if (!b || (c.status === 'working' && !c.typing && c.pose !== 'walk')) return;
  const [fx] = sp(c.x, c.y, 0);
  const x = fx - 7, y = Math.round(c.headY - 13 - (c.status === 'waiting_approval' ? Math.floor(t * 3) % 2 : 0));
  px(ctx, INK, x, y, 15, 10);
  px(ctx, b.bg, x + 1, y + 1, 13, 8);
  poly(ctx, INK, [[x + 5, y + 10], [x + 10, y + 10], [x + 7.5, y + 13]]);
  px(ctx, b.bg, x + 6, y + 9, 3, 1);
  const cx = x + 7, cy = y + 5;
  if (c.status === 'working') {
    const on = Math.floor(t * 4) % 3;
    for (let i = 0; i < 3; i++) px(ctx, b.fg, cx - 4 + i * 4, cy - (on === i ? 1 : 0), 2, 2);
  } else if (c.status === 'waiting_approval') {
    px(ctx, b.fg, cx, cy - 3, 2, 4); px(ctx, b.fg, cx, cy + 2, 2, 1);
  } else if (c.status === 'error') {
    for (let i = 0; i < 5; i++) { px(ctx, b.fg, cx - 2 + i, cy - 2 + i); px(ctx, b.fg, cx + 2 - i, cy - 2 + i); }
  } else if (c.status === 'paused') {
    px(ctx, b.fg, cx - 2, cy - 2, 2, 5); px(ctx, b.fg, cx + 1, cy - 2, 2, 5);
  }
}

// ---- navigation ------------------------------------------------------------

function findPath(blocked, room, from, to) {
  const key = (x, y) => `${x},${y}`;
  const prev = new Map([[key(from.x, from.y), null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      for (let n = cur; n; n = prev.get(key(n.x, n.y))) path.unshift(n);
      return path.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < room.x || ny < room.y || nx >= room.x + room.w || ny >= room.y + room.h) continue;
      if (blocked.has(key(nx, ny)) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), cur);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

const SPEED = 1.7; // tiles per second

export class Character {
  constructor(agentId, look, room, ws, blocked) {
    this.id = agentId; this.look = look; this.room = room; this.ws = ws; this.blocked = blocked;
    this.x = ws.stand.x + 0.5; this.y = ws.stand.y + 0.5;
    this.dir = 'SE'; this.pose = 'stand'; this.phase = Math.random() * 4;
    this.status = 'idle'; this.typing = false;
    this.path = []; this.wait = 1 + Math.random() * 3; this.headY = 0;
  }

  tile() { return { x: Math.floor(this.x), y: Math.floor(this.y) }; }

  goTo(tx, ty) {
    const p = findPath(this.blocked, this.room, this.tile(), { x: tx, y: ty });
    this.path = p || [];
    return !!p;
  }

  update(dt, status) {
    this.status = status;
    const seatT = this.ws.seat;
    const atSeat = this.pose === 'sit';
    this.typing = false;

    if (status === 'working') {
      if (atSeat) { this.typing = true; this.dir = 'NE'; return; }
      const t = this.tile();
      const goal = this.path.length ? this.path[this.path.length - 1] : null;
      if (!goal || goal.x !== seatT.x || goal.y !== seatT.y) {
        if (t.x === seatT.x && t.y === seatT.y && !this.path.length) { this.sitDown(); return; }
        this.goTo(seatT.x, seatT.y);
      }
    } else {
      if (atSeat) this.standUp();
      if (status === 'paused' || status === 'error') { this.path = []; }
      else if (status === 'waiting_approval') {
        const s = this.ws.stand, t = this.tile();
        if (!this.path.length && (t.x !== s.x || t.y !== s.y)) this.goTo(s.x, s.y);
      } else if (!this.path.length) {
        this.wait -= dt;
        if (this.wait <= 0) { // idle wandering
          this.wait = 3 + Math.random() * 6;
          const r = this.room;
          for (let i = 0; i < 8; i++) {
            const tx = r.x + Math.floor(Math.random() * r.w), ty = r.y + Math.floor(Math.random() * r.h);
            if (!this.blocked.has(`${tx},${ty}`) && this.goTo(tx, ty)) break;
          }
        }
      }
    }

    // walking along the current path
    if (this.path.length) {
      const n = this.path[0];
      const tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - this.x, dy = ty - this.y, dist = Math.hypot(dx, dy);
      const stepLen = SPEED * dt;
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'SE' : 'NW'; else this.dir = dy > 0 ? 'SW' : 'NE';
      this.pose = 'walk';
      if (dist <= stepLen) { this.x = tx; this.y = ty; this.path.shift(); } else { this.x += (dx / dist) * stepLen; this.y += (dy / dist) * stepLen; }
      if (!this.path.length) {
        this.pose = 'stand';
        const t = this.tile();
        if (status === 'working' && t.x === seatT.x && t.y === seatT.y) this.sitDown();
        else if (status === 'waiting_approval') this.dir = 'NE';
      }
    } else if (!atSeat) {
      this.pose = 'stand';
      if (status === 'idle' && Math.random() < dt * 0.15) this.dir = ['SE', 'SW', 'NE', 'NW'][Math.floor(Math.random() * 4)];
    }
  }

  sitDown() { this.pose = 'sit'; this.x = this.ws.seat.x + 0.5; this.y = this.ws.seat.y + 0.3; this.dir = 'NE'; this.path = []; }
  standUp() { this.pose = 'stand'; this.x = this.ws.seat.x + 0.5; this.y = this.ws.seat.y + 0.5; this.dir = 'SE'; this.wait = 2; }

  /** Rough screen-space hit box (canvas pixels). */
  hitBox() {
    const [fx, fy] = sp(this.x, this.y, 0);
    return { x: fx - 8, y: fy - 25, w: 16, h: 27 };
  }
}
