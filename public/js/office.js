// Canvas renderer: draws the isometric office at low resolution into an
// off-screen buffer and scales it up with nearest-neighbour filtering.
import { px, glow, poly, sp } from './draw.js';
import * as B from './basement.js';
import * as R from './roof.js';
import { Character, drawChar, drawBubble, hasSprite, drawSpriteHi, setNav } from './chars.js';
import {
  CANVAS_W, CANVAS_H, ROOMS, STATIONS, blocked, live, sceneItems, sceneGlows, drawFloor, setOrigin, GRID, HUB, navStep, roomOf,
} from './scene.js';

const LOOKS = {
  // Dex: the reference character - messy black hair, white shirt, black tie, cheek bandage.
  developer: { skin: '#f2f2f2', hair: '#0a0a0a', shirt: '#f4f4f4', shirtDark: '#b8b8b8', pants: '#1a1a1a', shoes: '#0a0a0a', tie: '#0a0a0a', hairStyle: 'messy', bandage: true },
  documents: { skin: '#e6e6e6', hair: '#3a3a3a', shirt: '#d0d0d0', shirtDark: '#9a9a9a', pants: '#2a2a2a', shoes: '#0a0a0a', acc: 'glasses', hairStyle: 'long' },
  email: { skin: '#ededed', hair: '#8a8a8a', shirt: '#6a6a6a', shirtDark: '#4a4a4a', pants: '#1a1a1a', shoes: '#0a0a0a', acc: 'headset' },
  automation: { skin: '#d8d8d8', hair: '#111111', shirt: '#2a2a2a', shirtDark: '#111111', pants: '#555555', shoes: '#f0f0f0', tie: '#f4f4f4' },
};

// Colour variants. Dex keeps his reference outfit (black/white) but gets a skin tone.
const COLOR_LOOKS = {
  developer: { ...LOOKS.developer, skin: '#f0c49a' },
  documents: { skin: '#e8b48c', hair: '#6b3a22', shirt: '#5fae6b', shirtDark: '#488a52', pants: '#5a4a3a', shoes: '#3a2a20', acc: 'glasses', hairStyle: 'long' },
  email: { skin: '#f4cfae', hair: '#c9722f', shirt: '#d9605a', shirtDark: '#b04a45', pants: '#3a3a4a', shoes: '#2a2a2a', acc: 'headset' },
  automation: { skin: '#c98f68', hair: '#1f1a18', shirt: '#8c6ad8', shirtDark: '#6c4fb0', pants: '#2f3a4a', shoes: '#e8e8e8', tie: '#f4f4f4' },
};

const hit =(b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

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
    this.base = { s: 1, ox: 0, oy: 0 };
    this.size = { w: 1, h: 1 };
    this.zoomed = false;
    this.zoomBtn = document.createElement('button');
    this.zoomBtn.type = 'button'; this.zoomBtn.id = 'zoom-btn'; this.zoomBtn.hidden = true;
    this.zoomBtn.onclick = () => { this.zoomed = !this.zoomed; this.syncZoomBtn(); };
    stage.appendChild(this.zoomBtn);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (this.vehicle) this.selectVehicle(null); else if (this.zoomed) { this.zoomed = false; this.syncZoomBtn(); } } });

    setOrigin();
    setNav(GRID, navStep);
    this.meeting = null; this.bossId = null;
    this.buf = document.createElement('canvas');
    this.buf.width = CANVAS_W; this.buf.height = CANVAS_H;
    this.b = this.buf.getContext('2d');
    this.floor = document.createElement('canvas');
    this.floor.width = CANVAS_W; this.floor.height = CANVAS_H;
    drawFloor(this.floor.getContext('2d'));
    this.floorB = document.createElement('canvas');
    this.floorB.width = CANVAS_W; this.floorB.height = CANVAS_H;
    B.drawFloor(this.floorB.getContext('2d'));
    this.floorR = document.createElement('canvas');
    this.floorR.width = CANVAS_W; this.floorR.height = CANVAS_H;
    R.drawFloor(this.floorR.getContext('2d'));

    // level switcher (ground floor / basement parking)
    this.level = 'ground';
    this.levelBar = document.createElement('div');
    this.levelBar.id = 'levels';
    this.levelBtns = {};
    for (const [id, label] of [['roof', 'Rooftop'], ['ground', 'Ground floor'], ['basement', 'B1 Parking']]) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = label;
      btn.onclick = () => this.setLevel(id);
      this.levelBar.appendChild(btn); this.levelBtns[id] = btn;
    }
    stage.appendChild(this.levelBar);
    this.tags = [...B.VEHICLES.map((v) => ({ v, level: 'basement', vehicle: true })), ...R.AREAS.map((v) => ({ v, level: 'roof' }))].map((t) => {
      const el = document.createElement('div');
      el.className = `nameplate ${t.level === 'roof' ? 'area' : 'vehicle'}`; el.hidden = true;
      el.innerHTML = '<span></span>'; el.querySelector('span').textContent = t.v.text || t.v.base;
      this.labels.appendChild(el);
      if (t.vehicle) el.onclick = () => this.selectVehicle(B.entryOf(t.v.mover));
      return { ...t, el };
    });
    this.art = {};
    const artNames = Object.entries(B.SPRITE_ART);
    let artLoaded = 0, artFailed = false;
    for (const [k, src] of artNames) {
      const img = new Image();
      img.onload = () => { if (++artLoaded === artNames.length && !artFailed) B.setArtReady(true); };
      img.onerror = () => { artFailed = true; B.setArtReady(false); }; // no art files: the plain box car is used
      img.src = src; this.art[k] = img;
    }
    this.vehicle = null; // the clicked vehicle (basement)
    this.card = document.createElement('div');
    this.card.id = 'vehicle-card'; this.card.hidden = true;
    this.card.innerHTML = '<canvas class="preview" title="Click to turn the vehicle"></canvas><div class="turn"><button type="button" class="btn rot-l" title="Turn left (←)">◀</button><span class="viewname"></span><button type="button" class="btn rot-r" title="Turn right (→)">▶</button></div><b></b><p></p><p class="muted"></p><div class="row"><button type="button" class="btn open"></button><button type="button" class="btn close">Close</button></div>';
    this.view3d = 0;
    const turn = (d) => { const n = this.vehicle ? B.viewsFor(this.vehicle).length : 4; this.view3d = (this.view3d + d + n) % n; this.card.dataset.sig = ''; };
    this.card.querySelector('.rot-l').onclick = () => turn(-1);
    this.card.querySelector('.rot-r').onclick = () => turn(1);
    this.card.querySelector('canvas').onclick = () => turn(1);
    window.addEventListener('keydown', (e) => { if (this.vehicle && this.level === 'basement' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) turn(e.key === 'ArrowLeft' ? -1 : 1); });
    this.card.querySelector('.close').onclick = () => this.selectVehicle(null);
    this.card.querySelector('.open').onclick = () => { if (this.vehicle?.owner) this.onSelect(this.vehicle.owner); };
    stage.appendChild(this.card);
    this.syncLevel();

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
    this.agents = new Map(list.map((a) => [a.id, a]));
    for (const a of list) {
      live.status[a.id] = a.status;
      if (!this.chars.has(a.id) && STATIONS[a.id]) {
        const ch = new Character(a.id, (this.color ? COLOR_LOOKS : LOOKS)[a.id] || LOOKS.developer, ROOMS[a.id], STATIONS[a.id], blocked);
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
      if (a.boss) this.bossId = a.id;
      if (ch) { ch.el.dataset.status = a.status; ch.el.classList.toggle('boss', !!a.boss); }
    }
  }

  /** Real meeting state from the server (pushed over SSE). */
  setMeeting(m) { this.meeting = m; }

  /** Where the real meeting state wants this character to be (null = carry on as usual). */
  errandFor(c) {
    const m = this.meeting;
    c.talking = false;
    if (!m || m.status !== 'running') return null;
    c.talking = m.speaker === c.id;
    if (m.kind === 'meeting') { const h = HUB[c.id]; return h ? { goal: { x: h.x, y: h.y }, dir: h.dir, sit: h.sit } : null; }
    // staff check: the boss walks to the person being reviewed; that person stays put
    if (c.id === this.bossId) {
      const staff = m.visiting && this.chars.get(m.visiting);
      if (!staff) return { hold: true };
      const t = staff.tile();
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const x = t.x + dx, y = t.y + dy;
        if (navStep(t.x, t.y, x, y) && roomOf(x, y) === roomOf(t.x, t.y)) {
          return { goal: { x, y }, dir: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'SE' : 'NW') : (dy < 0 ? 'SW' : 'NE') };
        }
      }
      return { goal: t };
    }
    if (c.id === m.visiting && live.status[c.id] !== 'working') return { hold: true };
    return null;
  }

  /** Switches character outfits between black & white and colour. */
  setColor(on) {
    this.color = on;
    for (const c of this.chars.values()) c.look = (on ? COLOR_LOOKS : LOOKS)[c.id] || LOOKS.developer;
  }

  syncZoomBtn() {
    this.zoomBtn.hidden = !this.selected;
    this.zoomBtn.textContent = this.zoomed ? '⤢ Whole office (Esc)' : '⌕ Zoom to ' + (this.chars.get(this.selected)?.name || '');
  }

  selectVehicle(entry) {
    if (entry !== this.vehicle) this.view3d = 0;
    this.vehicle = entry;
    this.card.hidden = !entry;
    this.zoomed = !!entry && this.level === 'basement';
    if (!entry) { this.card.dataset.sig = ''; this.card.dataset.drawn = ''; this.zoomed = false; }
    else { this.card.dataset.sig = ''; this.card.dataset.drawn = ''; }
    this.syncZoomBtn();
  }

  /** Keeps the vehicle card in step with the real garage / agent state. */
  updateCard() {
    const e = this.vehicle;
    if (!e || this.level !== 'basement') return;
    const info = B.infoFor(e), a = info.owner ? this.agents?.get(info.owner) : null;
    const lines = [info.text];
    if (a) lines.push(`Owner: ${a.name} (${a.role}) is ${a.status.replace('_', ' ')}${info.state === 'away' && a.status === 'working' ? ', so the vehicle is out' : ''}`);
    else lines.push('Visitor: background traffic');
    const drawn = this.card.dataset.drawn === `${e.desc}|${this.view3d}`;
    if (!drawn) {
      const ok = B.drawPreview(this.card.querySelector('canvas'), e, this.view3d, this.art);
      if (ok) this.card.dataset.drawn = `${e.desc}|${this.view3d}`;
      const vs = B.viewsFor(e); this.card.querySelector('.viewname').textContent = `${vs[this.view3d % vs.length].name} (${(this.view3d % vs.length) + 1}/${vs.length})`;
    }
    const sig = `${e.desc}|${info.owner}|${lines.join('|')}`;
    if (this.card.dataset.sig === sig) return;
    this.card.dataset.sig = sig;
    this.card.querySelector('b').textContent = a ? `${a.name}'s ${info.desc}` : info.desc.charAt(0).toUpperCase() + info.desc.slice(1);
    const ps = this.card.querySelectorAll('p');
    ps[0].textContent = lines[0]; ps[1].textContent = lines[1];
    const open = this.card.querySelector('.open');
    open.hidden = !a; open.textContent = a ? `Open ${a.name}` : '';
  }

  /** Eases the camera toward the selected character (or back to the full office). */
  updateView(dt) {
    const b = this.base, v = this.view;
    let tgt = b;
    const veh = this.zoomed && this.level === 'basement' && this.vehicle;
    if (veh) {
      const s = b.s * 2.4, p = B.posOf(veh), [fx, fy] = sp(p.x, p.y, 0);
      tgt = { s, ox: this.size.w / 2 - fx * s, oy: this.size.h / 2 - (fy - 10) * s };
    }
    const c = !veh && this.zoomed && this.level === 'ground' && this.chars.get(this.selected);
    if (c) {
      const s = b.s * 2.4, [fx, fy] = sp(c.x, c.y, 0);
      tgt = { s, ox: this.size.w / 2 - fx * s, oy: this.size.h / 2 - (fy - 16) * s };
    }
    const k = 1 - Math.exp(-dt * 7);
    for (const key of ['s', 'ox', 'oy']) { v[key] += (tgt[key] - v[key]) * k; if (Math.abs(tgt[key] - v[key]) < 0.05) v[key] = tgt[key]; }
  }

  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    if (level !== 'basement') this.selectVehicle(null);
    this.hover = null;
    if (level !== 'ground') this.zoomed = false;
    this.syncLevel(); this.syncZoomBtn();
  }

  syncLevel() {
    for (const [id, btn] of Object.entries(this.levelBtns)) btn.classList.toggle('active', id === this.level);
    const ground = this.level === 'ground';
    for (const c of this.chars.values()) c.el.hidden = !ground;
    for (const t of this.tags) t.el.hidden = t.level !== this.level;
    this.canvas.style.cursor = 'default';
  }

  select(id) { if (id && this.level !== 'ground') this.setLevel('ground'); this.selected = id; this.zoomed = !!id; this.syncZoomBtn(); for (const [k, c] of this.chars) c.el.classList.toggle('selected', k === id); }

  resize() {
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.dpr = dpr;
    // Frame the building itself (not the empty corners of the map canvas).
    const BB = { x: 12, y: 4, w: 636, h: 376 };
    const s = Math.max(0.5, Math.min((r.width - 16) / BB.w, (r.height - 16) / BB.h));
    this.size = { w: r.width, h: r.height };
    this.base = { s, ox: (r.width - BB.w * s) / 2 - BB.x * s, oy: (r.height - BB.h * s) / 2 - BB.y * s };
    if (!this.viewInit) { this.view = { ...this.base }; this.viewInit = true; }
  }

  toBuf(e) {
    const r = this.canvas.getBoundingClientRect(), v = this.view;
    return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s };
  }

  pointer(e, click) {
    if (this.level === 'basement') {
      const p = this.toBuf(e), hit = B.pickAt(p.x, p.y);
      this.canvas.style.cursor = hit ? 'pointer' : 'default';
      if (click) this.selectVehicle(hit);
      return;
    }
    if (this.level !== 'ground') return;
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

    for (const c of this.chars.values()) c.update(step, live.status[c.id] || 'idle', this.errandFor(c));
    B.update(step, live.status);
    this.updateView(step);
    this.updateCard();
    this.render(t);
  }

  render(t) {
    const b = this.b;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const ground = this.level === 'ground';
    const lv = this.level;
    b.drawImage(ground ? this.floor : lv === 'roof' ? this.floorR : this.floorB, 0, 0);
    const items = ground ? sceneItems : lv === 'roof' ? R.sceneItems : B.sceneItems;
    const glows = ground ? sceneGlows : lv === 'roof' ? R.sceneGlows : B.sceneGlows;
    const sky = live.sky, night = !!sky.stars, dusk = !night && sky.color === '#f2a56e';

    // Merge static furniture with the (moving) characters by depth.
    const chars = !ground ? [] : [...this.chars.values()].map((c) => ({ key: c.x + c.y + 0.001, c })).sort((a, z) => a.key - z.key);
    const ents = chars.map(({ key, c }) => ({ key, draw: () => this.drawCharacter(c, t) }));
    if (lv === 'basement') ents.push(...B.dynamicItems());
    ents.sort((p, q) => p.key - q.key);
    let ci = 0;
    for (const it of items) {
      while (ci < ents.length && ents[ci].key < it.key) ents[ci++].draw(b, t);
      it.draw(b, t);
    }
    while (ci < ents.length) ents[ci++].draw(b, t);

    // Warm lighting: lamps and live screens.
    b.save();
    b.globalCompositeOperation = 'source-atop'; // light only falls on the office, not the void around it
    for (const g of glows) if (!g.night || night || dusk) glow(b, g.x, g.y, g.r, g.rgb, g.a * (night ? 1 : 0.5));
    for (const [id, st] of Object.entries(ground ? STATIONS : {})) {
      if (live.status[id] !== 'working') continue;
      const [gx, gy] = sp(st.desk.x + 1.3, st.desk.y + 0.4, 16);
      glow(b, gx, gy, 30, '110,220,170', 0.22);
    }
    b.restore();
    b.save();
    b.globalCompositeOperation = 'source-atop';
    b.fillStyle = ground ? 'rgba(255,170,90,0.05)' : lv === 'basement' ? 'rgba(12,24,48,0.24)' : night ? 'rgba(10,20,52,0.38)' : dusk ? 'rgba(242,140,80,0.16)' : 'rgba(255,250,235,0.03)';
    b.fillRect(0, 0, CANVAS_W, CANVAS_H);
    b.restore();

    for (const { c } of chars) drawBubble(b, c, t); // bubbles always on top

    // blit
    const ctx = this.ctx, v = this.view, dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, v.ox, v.oy, CANVAS_W * v.s, CANVAS_H * v.s);
    if (ground) this.drawArt(ctx, v, t); else if (lv === 'basement') this.drawParkedArt(ctx, v, t);

    // labels for parked vehicles (basement) and areas (roof)
    for (const { v: tag, level, vehicle, el } of this.tags) {
      if (level !== lv) continue;
      const L = vehicle ? B.labelFor(tag) : tag;
      const [vx, vy] = sp(L.x, L.y, L.z);
      if (vehicle && el.firstChild.textContent !== L.text) el.firstChild.textContent = L.text;
      el.style.transform = `translate(${(v.ox + vx * v.s).toFixed(1)}px, ${(v.oy + vy * v.s).toFixed(1)}px) translate(-50%, ${tag.owner === 'email' ? '30%' : '-100%'})`;
    }
    // name plates (crisp DOM text)
    for (const c of this.chars.values()) c.el.hidden = !ground;
    for (const c of ground ? this.chars.values() : []) {
      const [fx, fy] = sp(c.x, c.y, 0);
      c.el.style.transform = `translate(${(v.ox + fx * v.s).toFixed(1)}px, ${(v.oy + (fy + 4) * v.s).toFixed(1)}px) translateX(-50%)`;
      c.el.classList.toggle('hover', this.hover === c.id);
    }
  }

  /** 2D-art vehicles (Dex's car): drawn hi-res; mirrored views give all four driving directions. */
  drawParkedArt(ctx, v, t) {
    this.occ = this.occ || document.createElement('canvas');
    const W = 112, H = 84, o = this.occ, oc = o.getContext('2d');
    for (const m of B.spriteMovers()) {
      const front = m.dir === 'S' || m.dir === 'E', mirror = m.dir === 'W' || m.dir === 'E';
      const img = this.art[front ? 'front' : 'rear'];
      if (!img || !img.complete || !img.naturalWidth) continue;
      const [fx, fy] = sp(m.x, m.y, m.lift);
      const w = m.w * v.s, h = w * img.naturalHeight / img.naturalWidth;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.translate(v.ox + fx * v.s, v.oy + fy * v.s); if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      const rx = Math.floor(fx - W / 2), ry = Math.floor(fy - H / 2);
      o.width = W; o.height = H; oc.setTransform(1, 0, 0, 1, -rx, -ry);
      const front_items = B.inFront(m.key);
      for (const it of front_items) it.draw(oc, t);
      oc.setTransform(1, 0, 0, 1, 0, 0);
      if (front_items.length) { ctx.imageSmoothingEnabled = false; ctx.drawImage(o, 0, 0, W, H, v.ox + rx * v.s, v.oy + ry * v.s, W * v.s, H * v.s); }
    }
  }

  /** 2D art characters: drawn at screen resolution, then furniture in front is re-stamped over them. */
  drawArt(ctx, v, t) {
    const list = [...this.chars.values()].filter((c) => hasSprite(c.id)).sort((a, z) => (a.x + a.y) - (z.x + z.y));
    if (!list.length) return;
    this.occ = this.occ || document.createElement('canvas');
    const W = 56, H = 64, o = this.occ, oc = o.getContext('2d');
    o.width = W; o.height = H;
    for (const c of list) {
      const [fx, fy] = sp(c.x, c.y, 0);
      const sx = v.ox + fx * v.s, sy = v.oy + fy * v.s;
      if (this.hover === c.id) for (const [dx, dy] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) drawSpriteHi(ctx, c, t, sx, sy, v.s, '#ffffff', dx, dy);
      drawSpriteHi(ctx, c, t, sx, sy, v.s);
      const key = c.x + c.y + 0.001, rx = Math.floor(fx - W / 2), ry = Math.floor(fy - H + 10);
      oc.clearRect(0, 0, W, H); oc.setTransform(1, 0, 0, 1, -rx, -ry);
      let any = false;
      for (const it of sceneItems) if (it.key > key) { it.draw(oc, t); any = true; }
      oc.setTransform(1, 0, 0, 1, 0, 0);
      if (any) { ctx.imageSmoothingEnabled = false; ctx.drawImage(o, 0, 0, W, H, v.ox + rx * v.s, v.oy + ry * v.s, W * v.s, H * v.s); }
    }
  }

  drawCharacter(c, t) {
    const b = this.b;
    if (this.selected === c.id) {
      const [fx, fy] = sp(c.x, c.y, 0), cy = fy - 1;
      b.globalAlpha = 0.3;
      poly(b, '#ffffff', [[fx - 13, cy], [fx, cy - 6], [fx + 13, cy], [fx, cy + 6]]);
      b.globalAlpha = 1;
      const pulse = Math.floor(t * 2) % 2;
      for (let k = 0; k <= 6; k++) {
        const col = pulse ? '#ffffff' : '#bdbdbd';
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
