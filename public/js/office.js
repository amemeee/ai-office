// Canvas renderer: draws the isometric office at low resolution into an
// off-screen buffer and scales it up with nearest-neighbour filtering.
import { px, glow, poly, sp } from './draw.js';
import { Character, drawChar, drawBubble } from './chars.js';
import {
  CANVAS_W, CANVAS_H, ROOMS, STATIONS, blocked, live, sceneItems, sceneGlows, drawFloor, setOrigin,
} from './scene.js';

const LOOKS = {
  // Dex: the reference character - messy black hair, white shirt, black tie, cheek bandage.
  developer: { skin: '#f2f2f2', hair: '#0a0a0a', shirt: '#f4f4f4', shirtDark: '#b8b8b8', pants: '#1a1a1a', shoes: '#0a0a0a', tie: '#0a0a0a', hairStyle: 'messy', bandage: true },
  documents: { skin: '#e6e6e6', hair: '#3a3a3a', shirt: '#d0d0d0', shirtDark: '#9a9a9a', pants: '#2a2a2a', shoes: '#0a0a0a', acc: 'glasses', hairStyle: 'long' },
  email: { skin: '#ededed', hair: '#8a8a8a', shirt: '#6a6a6a', shirtDark: '#4a4a4a', pants: '#1a1a1a', shoes: '#0a0a0a', acc: 'headset' },
  automation: { skin: '#d8d8d8', hair: '#111111', shirt: '#2a2a2a', shirtDark: '#111111', pants: '#555555', shoes: '#f0f0f0', tie: '#f4f4f4' },
};

const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export class Office {
  constructor(stage, { onSelect }) {
    this.stage = stage;
    this.canvas = stage.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.labels = stage.querySelector('#labels');
    this.onSelect = onSelect;
    this.chars = new Map();
    this.selected = null;
    this.hover = null;
    this.view = { s: 1, ox: 0, oy: 0 };

    setOrigin();
    this.buf = document.createElement('canvas');
    this.buf.width = CANVAS_W; this.buf.height = CANVAS_H;
    this.b = this.buf.getContext('2d');
    this.floor = document.createElement('canvas');
    this.floor.width = CANVAS_W; this.floor.height = CANVAS_H;
    drawFloor(this.floor.getContext('2d'));

    new ResizeObserver(() => this.resize()).observe(stage);
    this.canvas.addEventListener('mousemove', (e) => this.pointer(e, false));
    this.canvas.addEventListener('click', (e) => this.pointer(e, true));
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.canvas.style.cursor = 'default'; });
    this.last = performance.now();
    this.acc = 0;
    this.updateSky();
    setInterval(() => this.updateSky(), 30000);
    requestAnimationFrame((t) => this.frame(t));
  }

  updateSky() {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7.5 && h < 17.5) live.sky = { color: '#a9dcf2', stars: false };
    else if ((h >= 17.5 && h < 20) || (h >= 5.5 && h < 7.5)) live.sky = { color: '#f2a56e', stars: false };
    else live.sky = { color: '#1b2748', stars: true };
  }

  /** Receives the real agent list from the server. */
  setAgents(list) {
    for (const a of list) {
      live.status[a.id] = a.status;
      if (!this.chars.has(a.id) && STATIONS[a.id]) {
        const ch = new Character(a.id, LOOKS[a.id] || LOOKS.developer, ROOMS[a.id], STATIONS[a.id], blocked);
        ch.name = a.name;
        this.chars.set(a.id, ch);
        const el = document.createElement('div');
        el.className = 'nameplate';
        el.innerHTML = '<i></i><span></span>';
        el.querySelector('span').textContent = a.name;
        this.labels.appendChild(el);
        ch.el = el;
      }
      const ch = this.chars.get(a.id);
      if (ch) { ch.el.dataset.status = a.status; }
    }
  }

  select(id) { this.selected = id; for (const [k, c] of this.chars) c.el.classList.toggle('selected', k === id); }

  resize() {
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.dpr = dpr;
    const s = Math.max(0.5, Math.min((r.width - 16) / CANVAS_W, (r.height - 16) / CANVAS_H));
    this.view = { s, ox: (r.width - CANVAS_W * s) / 2, oy: (r.height - CANVAS_H * s) / 2 };
  }

  toBuf(e) {
    const r = this.canvas.getBoundingClientRect(), v = this.view;
    return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s };
  }

  pointer(e, click) {
    const p = this.toBuf(e);
    const ordered = [...this.chars.values()].sort((a, b) => (b.x + b.y) - (a.x + a.y));
    const found = ordered.find((c) => hit(c.hitBox(), p.x, p.y));
    this.hover = found ? found.id : null;
    this.canvas.style.cursor = found ? 'pointer' : 'default';
    if (click && found) this.onSelect(found.id);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.acc += dt; this.last = now;
    if (this.acc < 1 / 30) return; // ~30 fps keeps CPU use low
    const step = this.acc; this.acc = 0;
    const t = now / 1000;

    for (const c of this.chars.values()) c.update(step, live.status[c.id] || 'idle');
    this.render(t);
  }

  render(t) {
    const b = this.b;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, CANVAS_W, CANVAS_H);
    b.drawImage(this.floor, 0, 0);

    // Merge static furniture with the (moving) characters by depth.
    const chars = [...this.chars.values()].map((c) => ({ key: c.x + c.y + 0.001, c })).sort((a, z) => a.key - z.key);
    let ci = 0;
    for (const it of sceneItems) {
      while (ci < chars.length && chars[ci].key < it.key) this.drawCharacter(chars[ci++].c, t);
      it.draw(b, t);
    }
    while (ci < chars.length) this.drawCharacter(chars[ci++].c, t);

    // Warm lighting: lamps and live screens.
    b.save();
    b.globalCompositeOperation = 'source-atop'; // light only falls on the office, not the void around it
    for (const g of sceneGlows) glow(b, g.x, g.y, g.r, g.rgb, g.a);
    for (const [id, st] of Object.entries(STATIONS)) {
      if (live.status[id] !== 'working') continue;
      const [gx, gy] = sp(st.desk.x + 1.3, st.desk.y + 0.4, 16);
      glow(b, gx, gy, 30, '110,220,170', 0.22);
    }
    b.restore();
    b.save();
    b.globalCompositeOperation = 'source-atop';
    b.fillStyle = 'rgba(255,170,90,0.05)';
    b.fillRect(0, 0, CANVAS_W, CANVAS_H);
    b.restore();

    for (const { c } of chars) drawBubble(b, c, t); // bubbles always on top

    // blit
    const ctx = this.ctx, v = this.view, dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, v.ox, v.oy, CANVAS_W * v.s, CANVAS_H * v.s);

    // name plates (crisp DOM text)
    for (const c of this.chars.values()) {
      const [fx, fy] = sp(c.x, c.y, 0);
      c.el.style.transform = `translate(${(v.ox + fx * v.s).toFixed(1)}px, ${(v.oy + (fy + 4) * v.s).toFixed(1)}px) translateX(-50%)`;
      c.el.classList.toggle('hover', this.hover === c.id);
    }
  }

  drawCharacter(c, t) {
    const b = this.b;
    if (this.selected === c.id) {
      const [fx, fy] = sp(c.x, c.y, 0), cy = fy - 1;
      b.globalAlpha = 0.3;
      poly(b, '#ffd35a', [[fx - 13, cy], [fx, cy - 6], [fx + 13, cy], [fx, cy + 6]]);
      b.globalAlpha = 1;
      const pulse = Math.floor(t * 2) % 2;
      for (let k = 0; k <= 6; k++) {
        const col = pulse ? '#ffd35a' : '#fff0b0';
        px(b, col, fx - 13 + 2 * k, cy - k, 2, 1); px(b, col, fx + 11 - 2 * k, cy - k, 2, 1);
        px(b, col, fx - 13 + 2 * k, cy + k, 2, 1); px(b, col, fx + 11 - 2 * k, cy + k, 2, 1);
      }
    }
    if (this.hover === c.id) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) drawChar(b, c, t, '#ffffff', dx, dy);
    }
    drawChar(b, c, t);
  }
}
