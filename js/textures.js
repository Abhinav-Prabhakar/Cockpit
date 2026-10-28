import * as THREE from 'three';

export const FONTS = {
  label: '"Barlow Condensed", "Arial Narrow", sans-serif',
  mono: '"Share Tech Mono", ui-monospace, monospace',
  head: 'Rajdhani, "Barlow Condensed", sans-serif',
  hand: 'Caveat, cursive',
  marker: '"Permanent Marker", cursive',
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c, { srgb = true, wrap = false, rep = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

export function rng(seed = 1) {
  let s = (Math.imul(seed, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* Roughness / bump style grime: blotches, smudges, scratches and grain. */
export function grimeCanvas(w = 512, h = 512, o = {}) {
  const { base = 150, blot = 70, blotAmp = 0.12, grain = 24, scratches = 50, seed = 1, brushed = false } = o;
  const c = makeCanvas(w, h), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, w, h);
  for (let i = 0; i < blot; i++) {
    const px = r() * w, py = r() * h, rad = (0.03 + r() * 0.22) * w;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const v = r() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${blotAmp * r()})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  if (brushed) {
    for (let i = 0; i < h * 3; i++) {
      const y = r() * h, v = r() < 0.5 ? 0 : 255;
      x.strokeStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.06})`;
      x.lineWidth = 0.5 + r();
      x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + (r() - 0.5) * 3); x.stroke();
    }
  }
  for (let i = 0; i < scratches; i++) {
    const px = r() * w, py = r() * h, a = r() * Math.PI, l = 10 + r() * 60;
    x.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const d = x.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const n = (r() - 0.5) * grain; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
  x.putImageData(d, 0, 0);
  return c;
}

export function mottle(ctx, W, H, cells, alpha, r, op = 'overlay') {
  const cw = Math.max(2, cells), ch = Math.max(2, Math.round(cells * H / W));
  const m = makeCanvas(cw, ch), mx = m.getContext('2d'), id = mx.createImageData(cw, ch);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  mx.putImageData(id, 0, 0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(m, 0, 0, W, H); ctx.restore();
}

/* Paints an aircraft-style panel: painted base + backlit (emissive) legends. Coordinates in metres, origin at centre. */
export class PanelPainter {
  constructor(wM, hM, { ppm = 1500, base = '#252423', screws = true, seed = 5, wear = 1 } = {}) {
    this.wM = wM; this.hM = hM; this.ppm = ppm;
    this.W = Math.round(wM * ppm); this.H = Math.round(hM * ppm);
    this.col = makeCanvas(this.W, this.H); this.emi = makeCanvas(this.W, this.H);
    this.c = this.col.getContext('2d'); this.e = this.emi.getContext('2d');
    const c = this.c, W = this.W, H = this.H, r = rng(seed);
    this.r = r; this.base = base;
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    // multi-scale paint mottling (no per-pixel CG noise)
    mottle(c, W, H, 6, 0.10, r, 'overlay');
    mottle(c, W, H, 22, 0.08, r, 'overlay');
    mottle(c, W, H, 90, 0.05, r, 'soft-light');
    // light falloff: panels sit under a coaming, so the top edge is a bit darker, lower edge catches more grime
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,16,10,0.12)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // bevel catch-light + inner edge shadow
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 6; c.strokeRect(5, 5, W - 10, H - 10);
    // faint fine grain only
    const d = c.getImageData(0, 0, W, H), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const n = (r() - 0.5) * 4; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
    c.putImageData(d, 0, 0);
    this.e.fillStyle = '#000'; this.e.fillRect(0, 0, W, H);
    // bump: mostly flat, slight orange-peel from the powder coat
    this.bmp = makeCanvas(W, H); this.b = this.bmp.getContext('2d');
    const bb = this.b; bb.fillStyle = '#808080'; bb.fillRect(0, 0, W, H);
    mottle(bb, W, H, Math.round(W / 6), 0.18, r, 'overlay');
    // roughness: powder coat ~0.6, glossy smudges, matte dust
    this.rgh = makeCanvas(W, H); this.g = this.rgh.getContext('2d');
    const rg = this.g; rg.fillStyle = 'rgb(150,150,150)'; rg.fillRect(0, 0, W, H);
    mottle(rg, W, H, 10, 0.25, r, 'overlay');
    if (wear) this.wear(r, wear);
    if (screws) {
      const ix = wM / 2 - 0.012, iy = hM / 2 - 0.012;
      [[-ix, iy], [ix, iy], [-ix, -iy], [ix, -iy]].forEach(([x, y]) => this.screw(x, y));
    }
  }
  wear(r, k = 1) {
    const c = this.c, b = this.b, W = this.W, H = this.H, sc = this.ppm / 1500;
    // fine directional scratches (cleaning swirls) + random gouges
    for (let i = 0; i < 900 * k * (W * H) / 1.5e6; i++) {
      const x = r() * W, y = r() * H, a = r() < 0.6 ? (r() - 0.5) * 0.5 : r() * Math.PI, l = (8 + r() * 70) * sc;
      const al = 0.015 + r() * 0.06;
      c.strokeStyle = `rgba(210,215,220,${al})`; c.lineWidth = (0.6 + r() * 0.9) * sc;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      b.strokeStyle = `rgba(40,40,40,${al * 1.4})`; b.lineWidth = c.lineWidth; b.stroke();
      this.g.strokeStyle = `rgba(30,30,30,${al * 2})`; this.g.lineWidth = c.lineWidth; this.g.stroke();
    }
    // scuffs / hand wear patches
    for (let i = 0; i < 26 * k; i++) {
      const x = r() * W, y = H * (0.4 + r() * 0.6), rad = (20 + r() * 90) * sc;
      const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(160,165,170,${0.04 + r() * 0.05})`); g.addColorStop(1, 'rgba(160,165,170,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // chipped paint along the edges
    for (let i = 0; i < 260 * k; i++) {
      const side = Math.floor(r() * 4), t = r(), d = Math.pow(r(), 3) * 26 * sc;
      const x = side === 0 ? t * W : side === 1 ? t * W : side === 2 ? d : W - d;
      const y = side === 0 ? d : side === 1 ? H - d : t * H;
      c.fillStyle = `rgba(150,152,155,${0.15 + r() * 0.35})`; c.beginPath(); c.arc(x, y, (0.6 + r() * 2.4) * sc, 0, 7); c.fill();
      b.fillStyle = 'rgba(60,60,60,0.6)'; b.beginPath(); b.arc(x, y, (0.6 + r() * 2.4) * sc, 0, 7); b.fill();
    }
  }
  /* after legends are painted: worn lettering, dust, fingerprints */
  finish(k = 1) {
    const c = this.c, g = this.g, W = this.W, H = this.H, r = this.r, sc = this.ppm / 1500;
    // erosion specks knocked out of printed legends / paint
    c.fillStyle = this.base;
    for (let i = 0; i < 2600 * k * (W * H) / 1.5e6; i++) { c.globalAlpha = 0.25 + r() * 0.5; c.fillRect(r() * W, r() * H, (0.6 + r() * 1.4) * sc, (0.6 + r() * 1.4) * sc); }
    c.globalAlpha = 1;
    // dust: fine light specks, denser toward the lower edge and corners
    for (let i = 0; i < 1800 * k * (W * H) / 1.5e6; i++) {
      const y = H * (1 - Math.pow(r(), 2.2)), x = r() * W, s2 = (0.5 + r() * 1.3) * sc;
      c.fillStyle = `rgba(190,185,170,${0.05 + r() * 0.16})`; c.fillRect(x, y, s2, s2);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, y, s2 * 1.5, s2 * 1.5);
    }
    // fingerprints / palm smudges: glossy in roughness, faintly lighter in colour
    for (let i = 0; i < 14 * k; i++) {
      const x = r() * W, y = H * (0.25 + r() * 0.75), rw = (14 + r() * 26) * sc, rh = rw * (1.2 + r() * 0.5), ang = r() * Math.PI;
      g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 1.1 * sc;
      for (let ring = 2; ring < rw; ring += 2.6 * sc) { g.beginPath(); g.ellipse(0, 0, ring, ring * rh / rw, 0, 0, 7); g.stroke(); }
      g.restore();
      const sg = c.createRadialGradient(x, y, 0, x, y, rh); sg.addColorStop(0, 'rgba(200,205,210,0.035)'); sg.addColorStop(1, 'rgba(200,205,210,0)'); c.fillStyle = sg; c.fillRect(x - rh, y - rh, rh * 2, rh * 2);
    }
    for (let i = 0; i < 10 * k; i++) { const x = r() * W, y = r() * H, rad = (40 + r() * 140) * sc; const sg = g.createRadialGradient(x, y, 0, x, y, rad); const v = r() < 0.5 ? 40 : 230; sg.addColorStop(0, `rgba(${v},${v},${v},0.25)`); sg.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = sg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  }
  /* soft contact shadow under a control footprint (panel metres) */
  ao(x0, y0, x1, y1, { pad = 0.006, alpha = 0.6, drop = 0.004 } = {}) {
    const c = this.c, blur = this.S(pad) * 0.9;
    c.save(); c.filter = `blur(${blur.toFixed(1)}px)`; c.fillStyle = `rgba(0,0,0,${alpha})`;
    c.beginPath(); c.roundRect(this.X(x0 - pad * 0.3), this.Y(y1 + pad * 0.2 - drop), this.S(x1 - x0 + pad * 0.6), this.S(y1 - y0 + pad * 0.6), this.S(pad)); c.fill();
    c.restore();
  }
  X(x) { return (x + this.wM / 2) * this.ppm; }
  Y(y) { return (this.hM / 2 - y) * this.ppm; }
  S(m) { return m * this.ppm; }
  text(s, x, y, o = {}) {
    const { size = 0.0092, color = '#ece7da', glow = '#ffdcae', lit = true, align = 'center', weight = 600, font = FONTS.label, spacing = 0 } = o;
    const pairs = [[this.c, color], [this.b, '#3c3c3c']]; if (lit) pairs.push([this.e, glow]);
    for (const [ctx, col] of pairs) {
      ctx.save();
      ctx.font = `${weight} ${this.S(size)}px ${font}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${this.S(spacing)}px`;
      ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
      ctx.fillText(s, this.X(x), this.Y(y));
      ctx.restore();
    }
  }
  line(x1, y1, x2, y2, { w = 0.0007, color = 'rgba(225,220,205,0.75)', lit = false, glow = '#7a6a55' } = {}) {
    const pairs = [[this.c, color]]; if (lit) pairs.push([this.e, glow]);
    for (const [ctx, col] of pairs) {
      ctx.strokeStyle = col; ctx.lineWidth = this.S(w); ctx.beginPath();
      ctx.moveTo(this.X(x1), this.Y(y1)); ctx.lineTo(this.X(x2), this.Y(y2)); ctx.stroke();
    }
  }
  /* Airbus-style group outline with title in a gap on the top line */
  group(x, y, w, h, label, o = {}) {
    const l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2;
    const size = o.size || 0.0088;
    this.c.font = `600 ${this.S(size)}px ${FONTS.label}`;
    const tw = label ? this.c.measureText(label).width / this.ppm + 0.012 : 0;
    const lo = { w: 0.0008, color: 'rgba(230,226,214,0.6)' };
    this.line(l, t, x - tw / 2, t, lo); this.line(x + tw / 2, t, r, t, lo);
    this.line(l, t, l, t - 0.012, lo); this.line(r, t, r, t - 0.012, lo);
    if (o.full) { this.line(l, t, l, b, lo); this.line(r, t, r, b, lo); this.line(l, b, r, b, lo); }
    if (label) this.text(label, x, t, { size, ...o });
  }
  well(x, y, w, h, { r = 0.004, color = '#0a0b0c' } = {}) {
    const c = this.c;
    this.b.fillStyle = '#505050'; this.b.beginPath(); this.b.roundRect(this.X(x - w / 2), this.Y(y + h / 2), this.S(w), this.S(h), this.S(r)); this.b.fill();
    c.save(); c.fillStyle = color; c.beginPath();
    c.roundRect(this.X(x - w / 2), this.Y(y + h / 2), this.S(w), this.S(h), this.S(r)); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2; c.stroke();
    c.restore();
  }
  screw(x, y, r = 0.0032) {
    const c = this.c, px = this.X(x), py = this.Y(y), R = this.S(r);
    const g = c.createRadialGradient(px - R * 0.3, py - R * 0.3, R * 0.1, px, py, R);
    g.addColorStop(0, '#9a9ea3'); g.addColorStop(0.7, '#4c4f53'); g.addColorStop(1, '#1c1d1f');
    c.fillStyle = g; c.beginPath(); c.arc(px, py, R, 0, Math.PI * 2); c.fill();
    { const bg = this.b.createRadialGradient(px, py, 0, px, py, R * 1.1); bg.addColorStop(0, '#e0e0e0'); bg.addColorStop(1, '#808080'); this.b.fillStyle = bg; this.b.beginPath(); this.b.arc(px, py, R * 1.1, 0, 7); this.b.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = R * 0.25;
    const a = (x * 997 + y * 131) % Math.PI;
    c.beginPath(); c.moveTo(px - Math.cos(a) * R * 0.75, py - Math.sin(a) * R * 0.75); c.lineTo(px + Math.cos(a) * R * 0.75, py + Math.sin(a) * R * 0.75); c.stroke();
    c.beginPath(); c.moveTo(px - Math.cos(a + 1.57) * R * 0.75, py - Math.sin(a + 1.57) * R * 0.75); c.lineTo(px + Math.cos(a + 1.57) * R * 0.75, py + Math.sin(a + 1.57) * R * 0.75); c.stroke();
  }
  grille(x, y, w, h, step = 0.004) {
    const c = this.c;
    for (let gx = x - w / 2 + step / 2; gx < x + w / 2; gx += step)
      for (let gy = y - h / 2 + step / 2; gy < y + h / 2; gy += step) {
        c.fillStyle = '#050506'; c.beginPath(); c.arc(this.X(gx), this.Y(gy), this.S(step * 0.32), 0, Math.PI * 2); c.fill();
      }
  }
  stripes(x, y, w, h, { a = '#e8b100', b = '#111' } = {}) {
    const c = this.c; c.save();
    c.beginPath(); c.rect(this.X(x - w / 2), this.Y(y + h / 2), this.S(w), this.S(h)); c.clip();
    c.fillStyle = b; c.fillRect(this.X(x - w / 2), this.Y(y + h / 2), this.S(w), this.S(h));
    c.fillStyle = a; const st = this.S(0.008);
    for (let i = -this.S(h); i < this.S(w) + this.S(h); i += st * 2) {
      c.beginPath(); const x0 = this.X(x - w / 2) + i, y0 = this.Y(y + h / 2);
      c.moveTo(x0, y0); c.lineTo(x0 + st, y0); c.lineTo(x0 + st - this.S(h), y0 + this.S(h)); c.lineTo(x0 - this.S(h), y0 + this.S(h)); c.fill();
    }
    c.restore();
  }
  ring(x, y, r0, r1, { a0 = 0, a1 = Math.PI * 2, color = 'rgba(230,226,214,0.7)', w = 0.0007 } = {}) {
    const c = this.c; c.strokeStyle = color; c.lineWidth = this.S(w);
    c.beginPath(); c.arc(this.X(x), this.Y(y), this.S(r0), a0, a1); c.stroke();
    if (r1) { c.beginPath(); c.arc(this.X(x), this.Y(y), this.S(r1), a0, a1); c.stroke(); }
  }
  ticks(x, y, r, n, a0, a1, len = 0.003) {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / (n - 1));
      this.line(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r + len), y + Math.sin(a) * (r + len), { w: 0.0008, color: 'rgba(235,230,218,0.85)', lit: true, glow: '#c9a77a' });
    }
  }
  textures() { return { map: tex(this.col), emissiveMap: tex(this.emi), bumpMap: tex(this.bmp, { srgb: false }), roughnessMap: tex(this.rgh, { srgb: false }) }; }
}

/* ---------- 7-segment renderer ---------- */
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '', '_': 'd', 'A': 'abcefg', 'b': 'cdefg', 'C': 'adef', 'c': 'deg', 'd': 'bcdeg', 'E': 'adefg', 'F': 'aefg', 'H': 'bcefg', 'h': 'cefg',
  'L': 'def', 'P': 'abefg', 'U': 'bcdef', 'u': 'cde', 'n': 'ceg', 'o': 'cdeg', 'r': 'eg', 't': 'defg', 'S': 'afgcd', 'y': 'bcdfg', 'I': 'bc', 'O': 'abcdef', 'G': 'acdef',
};
export function draw7(ctx, str, x, y, h, on, off, { skew = 0.1, glow = 0.35 } = {}) {
  const w = h * 0.5, t = h * 0.12, gap = h * 0.018, adv = w + h * 0.2;
  let cx = x;
  const hseg = (x0, yy, len) => { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + t / 2, yy - t / 2); ctx.lineTo(x0 + len - t / 2, yy - t / 2); ctx.lineTo(x0 + len, yy); ctx.lineTo(x0 + len - t / 2, yy + t / 2); ctx.lineTo(x0 + t / 2, yy + t / 2); ctx.closePath(); ctx.fill(); };
  const vseg = (xx, y0, len) => { ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx + t / 2, y0 + t / 2); ctx.lineTo(xx + t / 2, y0 + len - t / 2); ctx.lineTo(xx, y0 + len); ctx.lineTo(xx - t / 2, y0 + len - t / 2); ctx.lineTo(xx - t / 2, y0 + t / 2); ctx.closePath(); ctx.fill(); };
  const segs = {
    a: () => hseg(t / 2 + gap, t / 2, w - t - 2 * gap),
    g: () => hseg(t / 2 + gap, h / 2, w - t - 2 * gap),
    d: () => hseg(t / 2 + gap, h - t / 2, w - t - 2 * gap),
    f: () => vseg(t / 2, t / 2 + gap, h / 2 - t / 2 - 2 * gap),
    b: () => vseg(w - t / 2, t / 2 + gap, h / 2 - t / 2 - 2 * gap),
    e: () => vseg(t / 2, h / 2 + gap, h / 2 - t / 2 - 2 * gap),
    c: () => vseg(w - t / 2, h / 2 + gap, h / 2 - t / 2 - 2 * gap),
  };
  for (const ch of str) {
    if (ch === ':' || ch === '.') {
      ctx.fillStyle = on; ctx.shadowColor = on; ctx.shadowBlur = h * glow;
      const r = t * 0.55;
      if (ch === ':') { ctx.beginPath(); ctx.arc(cx + t * 0.6, y + h * 0.3, r, 0, 7); ctx.arc(cx + t * 0.6, y + h * 0.72, r, 0, 7); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(cx - h * 0.08, y + h - r, r, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
      cx += ch === ':' ? t * 1.6 : 0;
      continue;
    }
    const lit = SEG[ch] ?? SEG[ch.toUpperCase()] ?? SEG[ch.toLowerCase()] ?? '';
    ctx.save(); ctx.translate(cx, y); ctx.transform(1, 0, -skew, 1, h * skew, 0);
    for (const s of 'abcdefg') {
      const isOn = lit.includes(s);
      ctx.fillStyle = isOn ? on : off;
      ctx.shadowColor = on; ctx.shadowBlur = isOn ? h * glow : 0;
      segs[s]();
    }
    ctx.restore();
    cx += adv;
  }
  return cx;
}
export const width7 = (str, h) => {
  let w = 0; for (const ch of str) w += ch === ':' ? h * 0.12 * 1.6 : ch === '.' ? 0 : h * 0.7; return w;
};

/* Dot matrix LED ticker strip */
export function dotMatrix(text, { rows = 14, cell = 6, on = '#ff3a1c', off = '#1d0603', font = FONTS.mono, weight = 400 } = {}) {
  const probe = makeCanvas(10, 10).getContext('2d');
  probe.font = `${weight} ${rows}px ${font}`;
  const tw = Math.ceil(probe.measureText(text).width) + rows * 4;
  const src = makeCanvas(tw, rows), s = src.getContext('2d');
  s.fillStyle = '#000'; s.fillRect(0, 0, tw, rows);
  s.font = `${weight} ${rows + 2}px ${font}`; s.textBaseline = 'middle'; s.fillStyle = '#fff';
  s.fillText(text, rows * 2, rows / 2 + 1);
  const px = s.getImageData(0, 0, tw, rows).data;
  const out = makeCanvas(tw * cell, rows * cell), o = out.getContext('2d');
  o.fillStyle = '#050101'; o.fillRect(0, 0, out.width, out.height);
  for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < tw; xx++) {
    const v = px[(yy * tw + xx) * 4] > 90;
    o.fillStyle = v ? on : off;
    o.beginPath(); o.arc(xx * cell + cell / 2, yy * cell + cell / 2, cell * 0.36, 0, 7); o.fill();
  }
  return out;
}
