// Isometric drawing primitives. Everything is drawn with integer-aligned pixel
// spans so the low-resolution canvas stays crisp when scaled up.
export const V = { ox: 0, oy: 0 };

/** World (tile units, height in px) -> canvas pixel. 2:1 isometric, 32x16 tiles. */
export const sp = (x, y, z = 0) => [Math.round((x - y) * 16 + V.ox), Math.round((x + y) * 8 + V.oy - z)];

const shadeCache = new Map();
export function shade(hex, f) {
  const k = hex + f;
  let v = shadeCache.get(k);
  if (v) return v;
  let n;
  if (hex.startsWith('rgb')) { const m = hex.match(/\d+/g).map(Number); n = (m[0] << 16) | (m[1] << 8) | m[2]; } // already-shaded colour
  else n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  v = `rgb(${c(16)},${c(8)},${c(0)})`;
  shadeCache.set(k, v);
  return v;
}

export function px(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Scanline fill of a convex polygon (no anti-aliasing). */
export function poly(ctx, color, pts) {
  ctx.fillStyle = color;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const n = pts.length;
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        const x = a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    const l = Math.round(xl), r = Math.round(xr);
    if (r > l) ctx.fillRect(l, y, r - l, 1);
  }
}

/** Isometric box. Visible faces: top, +y face (left on screen), +x face (right). */
export function box(ctx, x, y, w, d, h, col, o = {}) {
  const z = o.z || 0;
  const A = (X, Y, Z) => sp(X, Y, z + Z);
  const x1 = x + w, y1 = y + d;
  if (!o.noLeft) poly(ctx, o.left || shade(col, 0.86), [A(x, y1, h), A(x1, y1, h), A(x1, y1, 0), A(x, y1, 0)]);
  if (!o.noRight) poly(ctx, o.right || shade(col, 0.66), [A(x1, y, h), A(x1, y1, h), A(x1, y1, 0), A(x1, y, 0)]);
  poly(ctx, o.top || shade(col, 1.12), [A(x, y, h), A(x1, y, h), A(x1, y1, h), A(x, y1, h)]);
}

/** Flat rectangle on the floor (or at height z). */
export function floorRect(ctx, color, x, y, w, h, z = 0) {
  poly(ctx, color, [sp(x, y, z), sp(x + w, y, z), sp(x + w, y + h, z), sp(x, y + h, z)]);
}

/**
 * Rectangle painted on a vertical plane. plane 'y': the plane y=c spanning x in [u0,u1];
 * plane 'x': the plane x=c spanning y in [u0,u1]. z0..z1 are heights in px.
 */
export function faceQuad(ctx, color, plane, c, u0, u1, z0, z1) {
  const pts = plane === 'y'
    ? [sp(u0, c, z1), sp(u1, c, z1), sp(u1, c, z0), sp(u0, c, z0)]
    : [sp(c, u0, z1), sp(c, u1, z1), sp(c, u1, z0), sp(c, u0, z0)];
  poly(ctx, color, pts);
}

/** Soft additive glow (lamps, screens). */
export function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// 3x5 pixel font for the wall sign.
const FONT = {
  a: '010101111101101', i: '111010010010111', '-': '000000111000000', o: '010101101101010',
  f: '011100110100100', c: '011100100100011', e: '111100111100111',
};
/** Draws pixel text on a y-plane wall: u along +x (1 px per font pixel, slope 1/2). */
export function wallText(ctx, text, x, y, z, color, s = 1) {
  const [bx, by] = sp(x, y, z);
  let u = 0;
  for (const ch of text) {
    const g = FONT[ch];
    if (g) {
      for (let i = 0; i < 15; i++) {
        if (g[i] === '1') {
          const gx = (u + (i % 3)) * s, gy = Math.floor(i / 3);
          px(ctx, color, bx + gx, by + Math.round(gx / 2) - (4 - gy) * s, s, s);
        }
      }
    }
    u += 4;
  }
  return u * s;
}
