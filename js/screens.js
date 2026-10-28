import * as THREE from 'three';
import { makeCanvas, FONTS, rng, hexA, draw7 } from './textures.js';

export const COL = {
  bg: '#02070b', panel: '#071520', panel2: '#0a1c29', line: '#123247', grid: '#0c2433',
  cyan: '#46e3ff', cyanDim: '#1d6f86', text: '#cde8f4', dim: '#56788a', green: '#3dfc9a',
  amber: '#ffb52e', red: '#ff3d2e', blue: '#4fb0ff', white: '#f1f8fb', orange: '#ff7a1a', magenta: '#ff5ad8',
};
export const STATUS_COL = { AVAIL: COL.green, ENRT: COL.amber, ONSCN: COL.red, RTN: COL.blue, OOS: '#6c7a84' };
const STATUS_TXT = { AVAIL: 'AVAILABLE', ENRT: 'EN ROUTE', ONSCN: 'ON SCENE', RTN: 'RETURNING', OOS: 'OUT OF SVC' };

const AVENUES = ['1ST AVE', '2ND AVE', '3RD AVE', '4TH AVE', '5TH AVE', '6TH AVE', '7TH AVE', '8TH AVE', '9TH AVE', '10TH AVE', '11TH AVE', '12TH AVE'];
const STREETS = ['NORTHGATE RD', 'OAK ST', 'HARBOR BLVD', 'ELM ST', 'RIDGE RD', 'PINE ST', 'CANAL ST', 'MARKET ST'];
const FIRST = 'J M R D A K S T L C E B N P G V'.split(' ');
const LAST = ['ALVAREZ', 'OKAFOR', 'BRENNAN', 'NGUYEN', 'KOWALSKI', 'HAYES', 'MORENO', 'PATEL', 'DUBOIS', 'REYES', 'LINDQVIST', 'MURPHY', 'TANAKA', 'OSEI', 'HARTLEY', 'CASTILLO', 'WEBER', 'FINNEGAN', 'ADEYEMI', 'ROSSI', 'GALLAGHER', 'IBARRA', 'SORENSEN', 'VOSS', 'KANE', 'MERCER', 'QUINN', 'BAPTISTE', 'NAKAMURA', 'FLORES', 'DOYLE', 'PRICE', 'SALAZAR', 'KIM', 'OSTROWSKI', 'BELL', 'ROURKE', 'HALE', 'SANTOS', 'WARD', 'LOPEZ', 'FROST', 'ABARA', 'MILLS'];
const CREW = { ENGINE: ['CAPT', 'ENG', 'FF', 'FF'], LADDER: ['LT', 'FF', 'FF', 'FF'], RESCUE: ['LT', 'FF', 'FF'], 'BATT CHIEF': ['BC'], HAZMAT: ['CAPT', 'HMT', 'HMT'], MEDIC: ['PM', 'EMT'] };
const TYPE_SHORT = { ENGINE: 'ENGINE', LADDER: 'LADDER', RESCUE: 'RESCUE', 'BATT CHIEF': 'BATT CHF', HAZMAT: 'HAZMAT', MEDIC: 'MEDIC' };
export const CHANNELS = ['DISPATCH', 'TAC-1', 'TAC-2', 'TAC-3', 'FIREGRND', 'MUT AID'];

export const INC_TYPES = [
  { type: 'STRUCTURE FIRE', code: 'STR', needs: { ENGINE: 2, LADDER: 1, 'BATT CHIEF': 1, RESCUE: 1 }, alarm: 2, color: COL.red, w: 3, fire: true },
  { type: 'VEHICLE FIRE', code: 'VEH', needs: { ENGINE: 1 }, alarm: 1, color: COL.orange, w: 3, fire: true },
  { type: 'BRUSH FIRE', code: 'BRU', needs: { ENGINE: 2, 'BATT CHIEF': 1 }, alarm: 2, color: COL.orange, w: 2, brush: true, fire: true },
  { type: 'HAZMAT LEAK', code: 'HAZ', needs: { HAZMAT: 1, ENGINE: 1 }, alarm: 1, color: COL.magenta, w: 1 },
  { type: 'MEDICAL EMERG', code: 'MED', needs: { MEDIC: 1, ENGINE: 1 }, alarm: 1, color: COL.blue, w: 4 },
  { type: 'MVA ENTRAPMENT', code: 'MVA', needs: { RESCUE: 1, ENGINE: 1, MEDIC: 1 }, alarm: 1, color: COL.amber, w: 2 },
  { type: 'ALARM ACTIVATION', code: 'ALM', needs: { ENGINE: 1, LADDER: 1 }, alarm: 1, color: COL.amber, w: 3 },
];
const SPEED = 34;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pad = (n, l = 2) => String(Math.max(0, Math.floor(n))).padStart(l, '0');
export const clockStr = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const mmss = s => `${pad(s / 60)}:${pad(s % 60)}`;

/* ---------- value noise ---------- */
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.03, y * 2.03) * 0.3 + vnoise(x * 4.1, y * 4.1) * 0.2;

/* ======================================================================
   SIMULATION
   ====================================================================== */
export class Sim {
  constructor() {
    this.r = rng(1234); this.t = 0; this.quiet = true; this.ev = {};
    this.buildCity();
    this.buildUnits();
    this.incidents = []; this.log = []; this.radio = []; this.incSeq = 4471;
    this.nextInc = 10; this.pending = null; this.pendingT = 0; this.selected = null;
    this.view = { cx: 820, cy: 430, zoom: 1.05 }; this.viewT = { ...this.view }; this.follow = false;
    this.layers = { hydrants: false, traffic: false };
    this.mfdPage = 'EQUIP'; this.pumpUnit = 0; this.thermPal = 1; this.cam = 0; this.rec = true;
    this.aim = { x: 0.5, y: 0.5 }; this.joy = { x: 0, y: 0 };
    this.throttle = [0.55, 0.45, 0.25];
    this.radioCh = 0; this.com = [{ act: '154.430', sby: '154.265', ch: 0 }, { act: '153.830', sby: '154.385', ch: 2 }];
    this.caution = false; this.cautionAck = true; this.warning = false; this.warnAck = true; this.warnMsg = '';
    this.cadLink = true; this.autoDispatch = true; this.mutualAid = false; this.evac = false; this.emerPwr = false; this.genTest = false;
    this.lampTest = false;
    this.wind = { dir: 235, spd: 14, gust: 22 }; this.weather = { temp: 78, rh: 17, dew: 29, baro: 29.88 };
    this.chatter = null; this.nextChatter = 5; this.passAlarm = null; this.hrAcc = 0;
    this.respTimes = [252, 238, 271, 244];
    // prewarm with two live incidents
    this.spawn(INC_TYPES[0], true); this.spawn(INC_TYPES[2], true);
    for (let i = 0; i < 260; i++) this.update(0.1);
    this.spawn(INC_TYPES[4], true);
    for (let i = 0; i < 60; i++) this.update(0.1);
    this.selected = this.incidents[0] || null;
    this.log.length = Math.min(this.log.length, 40);
    this.quiet = false;
  }
  on(e, f) { (this.ev[e] ||= []).push(f); }
  emit(e, d) { if (!this.quiet) (this.ev[e] || []).forEach(f => f(d)); }

  buildCity() {
    const r = this.r;
    this.xs = []; for (let i = 0; i < 12; i++) this.xs.push(Math.round(70 + i * 132 + (i > 0 && i < 11 ? (r() - 0.5) * 30 : 0)));
    this.ys = []; for (let j = 0; j < 8; j++) this.ys.push(Math.round(60 + j * 111 + (j > 0 && j < 7 ? (r() - 0.5) * 24 : 0)));
    this.riverY = x => 560 - x * 0.16 + 55 * Math.sin(x / 190 + 0.6);
    this.stations = [[1, 1], [5, 2], [9, 1], [2, 6], [7, 6], [10, 7], [4, 7]].map((g, k) => ({ id: k + 1, i: g[0], j: g[1], x: this.xs[g[0]], y: this.ys[g[1]] }));
    this.hydrants = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) {
      if (r() < 0.75) this.hydrants.push({ x: this.xs[i] + 7, y: this.ys[j] + 7, id: `H-${pad(i * 8 + j + 300, 4)}`, psi: 52 + Math.round(r() * 30), ok: r() > 0.06 });
      if (i < 11 && r() < 0.5) this.hydrants.push({ x: (this.xs[i] + this.xs[i + 1]) / 2, y: this.ys[j] - 7, id: `H-${pad(i * 8 + j + 700, 4)}`, psi: 48 + Math.round(r() * 30), ok: r() > 0.06 });
    }
    this.city = this.drawCity();
  }

  drawCity() {
    const S = 2, c = makeCanvas(1600 * S, 900 * S), x = c.getContext('2d'); x.scale(S, S);
    const r = rng(99);
    x.fillStyle = '#060c11'; x.fillRect(0, 0, 1600, 900);
    for (let i = 0; i < 240; i++) {
      const px = r() * 1600, py = r() * 900, rad = 20 + r() * 140;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(20,60,80,${0.04 + r() * 0.06})`); g.addColorStop(1, 'rgba(20,60,80,0)');
      x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    const xs = [-80, ...this.xs, 1680], ys = [-80, ...this.ys, 980];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + 8, x1 = xs[i + 1] - 8, y0 = ys[j] + 8, y1 = ys[j + 1] - 8;
      const park = r() < 0.08;
      if (park) {
        x.fillStyle = '#061a14'; x.fillRect(x0, y0, x1 - x0, y1 - y0);
        for (let k = 0; k < 50; k++) { x.fillStyle = `rgba(50,140,90,${0.12 + r() * 0.2})`; x.beginPath(); x.arc(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.5 + r() * 3.5, 0, 7); x.fill(); }
        x.strokeStyle = 'rgba(60,160,110,0.25)'; x.strokeRect(x0, y0, x1 - x0, y1 - y0);
        continue;
      }
      x.fillStyle = '#0b141b'; x.fillRect(x0, y0, x1 - x0, y1 - y0);
      const nx = 3 + Math.floor(r() * 5), ny = 3 + Math.floor(r() * 3), bw = (x1 - x0) / nx, bh = (y1 - y0) / ny;
      for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
        if (r() < 0.08) { x.fillStyle = `rgba(40,90,50,${0.4 + r() * 0.3})`; x.beginPath(); x.arc(x0 + (a + 0.5) * bw, y0 + (b + 0.5) * bh, Math.min(bw, bh) * 0.35, 0, 7); x.fill(); continue; }
        const p = 1 + r() * 2, bx = x0 + a * bw + p, by = y0 + b * bh + p, w = bw - p * 2 - r() * 4, h = bh - p * 2 - r() * 4;
        const v = 26 + r() * 34 | 0;
        x.fillStyle = `rgb(${v},${v + 4},${v + 10})`; x.fillRect(bx, by, w, h);
        // rooftop shading + details
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(bx + w * 0.55, by, w * 0.45, h);
        x.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; x.fillRect(bx + 1, by + 1, w * 0.4, 1);
        if (r() < 0.4) { x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(bx + w * 0.2, by + h * 0.25, w * 0.25, h * 0.3); }
        x.strokeStyle = 'rgba(120,180,210,0.10)'; x.lineWidth = 0.5; x.strokeRect(bx, by, w, h);
      }
      // street trees
      for (let k = 0; k < 10; k++) { x.fillStyle = `rgba(50,110,60,${0.35 + r() * 0.3})`; x.beginPath(); x.arc(x0 + r() * (x1 - x0), r() < 0.5 ? y0 + 1 : y1 - 1, 1.2 + r() * 1.8, 0, 7); x.fill(); }
      // pinpoint lights
      for (let k = 0; k < 8; k++) { const c = r(); x.fillStyle = c < 0.6 ? 'rgba(255,190,110,0.9)' : c < 0.85 ? 'rgba(220,235,255,0.9)' : 'rgba(255,80,60,0.9)'; x.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.2, 1.2); }
    }
    // river
    x.beginPath();
    for (let px = -10; px <= 1610; px += 10) x.lineTo(px, this.riverY(px) - 24);
    for (let px = 1610; px >= -10; px -= 10) x.lineTo(px, this.riverY(px) + 24);
    x.closePath();
    const rg = x.createLinearGradient(0, 300, 0, 700); rg.addColorStop(0, '#032236'); rg.addColorStop(1, '#043049');
    x.fillStyle = rg; x.fill(); x.strokeStyle = 'rgba(30,150,200,0.55)'; x.lineWidth = 1.4; x.stroke();
    x.strokeStyle = 'rgba(70,180,230,0.12)'; x.lineWidth = 0.8;
    for (let k = -2; k <= 2; k++) { x.beginPath(); for (let px = 0; px <= 1600; px += 12) x.lineTo(px, this.riverY(px) + k * 8 + Math.sin(px / 30 + k) * 1.5); x.stroke(); }
    // roads
    const road = (x0, y0, x1, y1, major) => {
      x.strokeStyle = major ? '#14374e' : '#0e2636'; x.lineWidth = major ? 13 : 8;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      x.strokeStyle = major ? 'rgba(80,210,255,0.38)' : 'rgba(80,210,255,0.13)'; x.lineWidth = major ? 1.2 : 0.8;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    };
    this.xs.forEach((ax, i) => road(ax, -10, ax, 910, i === 4 || i === 9));
    this.ys.forEach((ay, j) => road(-10, ay, 1610, ay, j === 3 || j === 6));
    // highway
    x.lineCap = 'round'; x.beginPath(); x.moveTo(-20, 210); x.bezierCurveTo(600, 120, 950, 820, 1620, 700);
    x.strokeStyle = '#1a3044'; x.lineWidth = 20; x.stroke();
    x.strokeStyle = 'rgba(255,190,80,0.32)'; x.setLineDash([10, 8]); x.lineWidth = 1.2; x.stroke(); x.setLineDash([]);
    x.font = `600 13px ${FONTS.head}`; x.fillStyle = 'rgba(255,190,80,0.55)'; x.fillText('I-405', 590, 158);
    // labels
    x.font = `10px ${FONTS.mono}`; x.fillStyle = 'rgba(120,180,210,0.55)';
    this.ys.forEach((ay, j) => [1, 6, 10].forEach(i => x.fillText(STREETS[j], this.xs[i] + 12, ay - 6)));
    this.xs.forEach((ax, i) => { x.save(); x.translate(ax - 6, this.ys[j0(i)] + 60); x.rotate(-Math.PI / 2); x.fillText(AVENUES[i], 0, 0); x.restore(); });
    function j0(i) { return i % 3 === 0 ? 1 : i % 3 === 1 ? 4 : 6; }
    x.font = `700 30px ${FONTS.head}`; x.fillStyle = 'rgba(90,160,200,0.17)';
    if ('letterSpacing' in x) x.letterSpacing = '10px';
    [['NORTH HILLS', 180, 130], ['OLD TOWN', 700, 260], ['UNIVERSITY', 1250, 180], ['HARBOR', 260, 760], ['RIVERSIDE', 880, 640], ['INDUSTRIAL', 1280, 820]].forEach(([n, px, py]) => x.fillText(n, px, py));
    return c;
  }

  buildUnits() {
    const r = this.r;
    const defs = [['E1', 'ENGINE', 0], ['L1', 'LADDER', 0], ['E2', 'ENGINE', 1], ['R2', 'RESCUE', 1], ['E3', 'ENGINE', 2], ['BC3', 'BATT CHIEF', 2], ['E4', 'ENGINE', 3], ['L4', 'LADDER', 3], ['E5', 'ENGINE', 4], ['HM5', 'HAZMAT', 4], ['E6', 'ENGINE', 5], ['M6', 'MEDIC', 5], ['M7', 'MEDIC', 6], ['E7', 'ENGINE', 6]];
    this.units = []; this.people = []; this.unitById = {};
    let li = 0;
    for (const [id, type, s] of defs) {
      const st = this.stations[s];
      const u = { id, type, st: st.id, home: st, i: st.i, j: st.j, x: st.x, y: st.y, status: 'AVAIL', path: [], inc: null, water: type === 'ENGINE' ? 100 : null, fuel: 62 + r() * 36, crew: [], eta: 0, heading: 0, flash: 0 };
      if (id === 'L4') { u.status = 'OOS'; u.note = 'MAINT'; }
      for (const rank of CREW[type]) {
        const p = { name: `${FIRST[Math.floor(r() * FIRST.length)]}. ${LAST[li++ % LAST.length]}`, rank, unit: id, hr: 70 + r() * 8, hrOff: (r() - 0.5) * 10, hist: [], air: 100, scba: !['BC', 'PM', 'EMT', 'ENG'].includes(rank), burn: r() * 0.6, pass: false };
        for (let k = 0; k < 40; k++) p.hist.push(p.hr);
        this.people.push(p); u.crew.push(p);
      }
      this.units.push(u); this.unitById[id] = u;
    }
  }

  addLog(msg, col = COL.text, kind = 'evt') { this.log.push({ time: clockStr(), msg, col, kind }); if (this.log.length > 80) this.log.shift(); }

  radioMsg(from, text, ch = 0) {
    this.radio.push({ time: clockStr(), from, text, ch });
    if (this.radio.length > 40) this.radio.shift();
    this.chatter = { ch, t0: this.t, dur: Math.min(4.8, 1.3 + text.length * 0.04), from, text };
    this.addLog(`◂ [${CHANNELS[ch]}] ${from}: ${text}`, '#8fc7dc', 'radio');
    this.emit('chatter', this.chatter);
  }

  spawn(def, auto = false) {
    const r = this.r;
    if (!def) { const tot = INC_TYPES.reduce((a, b) => a + b.w, 0); let k = r() * tot; def = INC_TYPES.find(d => (k -= d.w) < 0) || INC_TYPES[0]; }
    let i, j, tries = 0;
    do { i = 1 + Math.floor(r() * 10); j = Math.floor(r() * 8); }
    while ((Math.abs(this.ys[j] - this.riverY(this.xs[i])) < 50 || this.incidents.some(n => n.i === i && n.j === j) || this.stations.some(s => s.i === i && s.j === j)) && tries++ < 60);
    const inc = { id: `F26-${this.incSeq++}`, ...def, i, j, x: this.xs[i], y: this.ys[j], addr: `${(1 + Math.floor(r() * 89)) * 10 + 100} ${STREETS[j]}`, cross: AVENUES[i], t0: this.t, status: 'PENDING', units: [], area: def.brush ? 16 : 0, onSceneT: null, dur: 30 + r() * 26, ctlT: 0, closeT: 0, seed: r() * 100 };
    this.incidents.push(inc);
    this.addLog(`NEW ${inc.code} ${inc.id} — ${inc.type} @ ${inc.addr} / ${inc.cross}`, COL.red);
    if (auto) this.dispatch(inc);
    else {
      this.pending = inc; this.pendingT = this.t; this.cautionAck = false;
      this.emit('incident', inc);
    }
    if (!this.selected || this.selected.status === 'CLOSED' || !auto) this.selected = inc;
    return inc;
  }

  dist(u, inc) { return Math.abs(u.x - inc.x) + Math.abs(u.y - inc.y); }

  dispatch(inc = this.pending) {
    if (!inc || inc.status !== 'PENDING') return false;
    for (const [type, n] of Object.entries(inc.needs)) {
      const avail = this.units.filter(u => u.type === type && u.status === 'AVAIL').sort((a, b) => this.dist(a, inc) - this.dist(b, inc)).slice(0, n);
      for (const u of avail) this.send(u, inc);
    }
    inc.status = 'DISPATCHED'; inc.dispT = this.t;
    if (this.pending === inc) this.pending = null;
    this.addLog(`DISPATCH ${inc.id}: ${inc.units.join(' ') || 'NO UNITS AVAILABLE'}`, COL.amber);
    this.radioMsg('DISPATCH', `${inc.units.join(', ') || 'All units'}, respond ${inc.type.toLowerCase()}, ${inc.addr.toLowerCase()} at ${inc.cross.toLowerCase()}.`, 0);
    this.emit('dispatch', inc);
    return true;
  }

  send(u, inc) {
    u.status = 'ENRT'; u.inc = inc.id; inc.units.push(u.id);
    u.path = this.route(u.i, u.j, inc.i, inc.j); u.ti = inc.i; u.tj = inc.j; u.flash = 3;
  }
  route(i0, j0, i1, j1) {
    const p = [];
    if (i0 !== i1) p.push({ x: this.xs[i1], y: this.ys[j0] });
    if (j0 !== j1) p.push({ x: this.xs[i1], y: this.ys[j1] });
    if (!p.length) p.push({ x: this.xs[i1], y: this.ys[j1] });
    return p;
  }
  pathLen(u) {
    let d = 0, px = u.x, py = u.y;
    for (const q of u.path) { d += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
    return d;
  }

  arrive(u) {
    if (u.status === 'ENRT') {
      u.status = 'ONSCN'; u.i = u.ti; u.j = u.tj; u.flash = 3;
      const inc = this.incidents.find(n => n.id === u.inc);
      if (inc) {
        if (inc.status === 'DISPATCHED') {
          inc.status = 'ACTIVE'; inc.onSceneT = this.t;
          this.respTimes.push((this.t - inc.t0) * 4.5); if (this.respTimes.length > 12) this.respTimes.shift();
        }
        const r = this.r;
        const first = ['heavy smoke showing from the Alpha side', 'working fire, two-story wood frame', 'nothing showing, investigating', 'vehicle fully involved', 'establishing command', 'fire through the roof, going defensive'];
        this.radioMsg(u.id, `On scene, ${first[Math.floor(r() * first.length)]}.`, 2 + Math.floor(r() * 2));
      }
      this.addLog(`${u.id} ON SCENE ${u.inc}`, COL.red);
    } else if (u.status === 'RTN') {
      u.status = 'AVAIL'; u.i = u.home.i; u.j = u.home.j; u.inc = null;
      this.addLog(`${u.id} IN QUARTERS STA ${u.st}`, COL.green);
    }
  }

  control(inc) {
    if (!['ACTIVE', 'DISPATCHED'].includes(inc.status)) return;
    inc.status = 'CONTROLLED'; inc.ctlT = this.t;
    this.addLog(`${inc.id} UNDER CONTROL`, COL.green);
    const cmd = inc.units.find(id => id.startsWith('BC')) || inc.units[0];
    if (cmd) this.radioMsg(cmd, `Command to dispatch, ${inc.fire ? 'fire is knocked down' : 'situation stabilized'}, start releasing units.`, 2);
  }
  release(inc) {
    inc.status = 'CLOSED'; inc.closeT = this.t;
    for (const id of inc.units) {
      const u = this.unitById[id];
      if (u.status === 'ONSCN') { u.status = 'RTN'; u.path = this.route(u.i, u.j, u.home.i, u.home.j); }
      else if (u.status === 'ENRT') {
        const home = { x: u.home.x, y: u.home.y }, corner = { x: this.xs[u.ti], y: this.ys[u.home.j] };
        u.path = u.path.length >= 2 ? [home] : [corner, home]; u.status = 'RTN';
      }
    }
    this.addLog(`${inc.id} CLOSED — UNITS RETURNING`, COL.blue);
  }

  /* operator actions */
  ackCaution() { this.cautionAck = true; }
  ackWarning() { this.warnAck = true; }
  cycleIncident(dir = 1) {
    const live = this.incidents.filter(i => i.status !== 'CLOSED');
    if (!live.length) return;
    const k = live.indexOf(this.selected);
    this.selected = live[(k + dir + live.length) % live.length];
    this.centerOn(this.selected, 1.7);
  }
  recall() {
    const inc = this.selected; if (!inc) return;
    if (inc.status === 'PENDING') { inc.status = 'CLOSED'; inc.closeT = this.t; if (this.pending === inc) this.pending = null; this.addLog(`${inc.id} CANCELLED BY OPERATOR`, COL.dim); return; }
    if (['ACTIVE', 'DISPATCHED'].includes(inc.status)) { this.control(inc); inc.ctlT = this.t - 5; }
  }
  requestMutualAid() {
    this.mutualAid = !this.mutualAid;
    if (this.mutualAid) { this.addLog('MUTUAL AID REQUESTED — COUNTY STRIKE TEAM 4', COL.green); this.radioMsg('DISPATCH', 'County dispatch, Metro requesting a strike team, type one engines, staging at Station 4.', 5); }
    else this.addLog('MUTUAL AID STOOD DOWN', COL.dim);
  }
  centerOn(p, zoom) { if (!p) return; this.viewT.cx = p.x; this.viewT.cy = p.y; if (zoom) this.viewT.zoom = zoom; }
  panBy(dx, dy) { this.follow = false; this.viewT.cx += dx / this.viewT.zoom; this.viewT.cy += dy / this.viewT.zoom; }
  zoomTo(z) { this.viewT.zoom = clamp(z, 1, 3.2); }
  clampView(v) { const hw = 800 / v.zoom, hh = 450 / v.zoom; v.cx = clamp(v.cx, hw, 1600 - hw); v.cy = clamp(v.cy, hh, 900 - hh); }
  selectAt(wx, wy) {
    let best = null, bd = 60;
    for (const inc of this.incidents) { const d = Math.hypot(inc.x - wx, inc.y - wy); if (d < bd) { bd = d; best = inc; } }
    if (best) { this.selected = best; return best; }
    return null;
  }
  toneStation(n) {
    const st = this.stations[n - 1];
    this.addLog(n ? `STATION ${n} TONED OUT` : 'ALL STATIONS TONED OUT', COL.amber);
  }

  randomChatter() {
    const r = this.r, pick = a => a[Math.floor(r() * a.length)];
    const ons = this.units.filter(u => u.status === 'ONSCN');
    const enr = this.units.filter(u => u.status === 'ENRT');
    const roll = r();
    if (ons.length && roll < 0.55) {
      const u = pick(ons);
      const msgs = ['primary search complete, all clear', 'need ventilation on the roof, Division C', 'stretching a second line to the Bravo side', 'hydrant secured, we have a positive water supply', 'requesting PAR, all crews', 'interior is getting hot, backing out to the doorway', 'fire is darkening down on floor two', 'exposure Delta protected', 'requesting utilities to the scene for the gas meter'];
      this.radioMsg(u.id, `${pick(['Command', 'Engine ' + u.id.slice(1), u.id])}, ${pick(msgs)}.`, 2 + Math.floor(r() * 3));
    } else if (enr.length && roll < 0.8) {
      const u = pick(enr);
      this.radioMsg(u.id, `Responding, ETA ${Math.max(1, Math.round(this.pathLen(u) / SPEED * 4.5 / 60))} minutes.`, 0);
    } else {
      this.radioMsg('DISPATCH', pick(['All units, red flag warning remains in effect until 2000 hours.', 'Dispatch copies, time is ' + clockStr().slice(0, 5) + '.', 'Station 4, Ladder 4 remains out of service, maintenance.', 'Medic 7, contact ER on Med-2.', 'Battalion 3, PD advises traffic diverted on Harbor Boulevard.']), 0);
    }
  }

  get stats() {
    const c = { AVAIL: 0, ENRT: 0, ONSCN: 0, RTN: 0, OOS: 0 };
    this.units.forEach(u => c[u.status]++);
    const live = this.incidents.filter(i => i.status !== 'CLOSED');
    const onsP = this.people.filter(p => this.unitById[p.unit].status === 'ONSCN');
    const avg = this.respTimes.reduce((a, b) => a + b, 0) / this.respTimes.length;
    const alarm = live.reduce((a, b) => Math.max(a, b.alarm), 0);
    return { c, live, active: live.length, onsP, avg, alarm };
  }

  update(dt) {
    this.t += dt; const r = this.r;
    const v = this.view, vt = this.viewT;
    if (this.follow && this.selected) { vt.cx = this.selected.x; vt.cy = this.selected.y; }
    this.clampView(vt);
    const k = 1 - Math.exp(-dt * 5);
    v.cx += (vt.cx - v.cx) * k; v.cy += (vt.cy - v.cy) * k; v.zoom += (vt.zoom - v.zoom) * k;

    this.nextInc -= dt;
    const live = this.incidents.filter(i => i.status !== 'CLOSED');
    if (this.nextInc <= 0) { if (live.length < 5 && !this.pending) this.spawn(); this.nextInc = 22 + r() * 22; }
    if (this.pending && this.autoDispatch && this.t - this.pendingT > 15) this.dispatch(this.pending);

    for (const u of this.units) {
      if (u.path.length) {
        const q = u.path[0], dx = q.x - u.x, dy = q.y - u.y, d = Math.hypot(dx, dy), step = SPEED * dt;
        if (d > 0.01) u.heading = Math.atan2(dy, dx);
        if (d <= step) { u.x = q.x; u.y = q.y; u.path.shift(); if (!u.path.length) this.arrive(u); }
        else { u.x += dx / d * step; u.y += dy / d * step; }
        u.fuel = Math.max(5, u.fuel - dt * 0.04);
        u.eta = this.pathLen(u) / SPEED * 4.5;
      } else u.eta = 0;
      if (u.water != null) u.water = u.status === 'ONSCN' ? Math.max(6, u.water - dt * 1.4) : u.status === 'AVAIL' ? Math.min(100, u.water + dt * 4) : u.water;
      if (u.status === 'AVAIL') u.fuel = Math.min(100, u.fuel + dt * 0.5);
      u.flash = Math.max(0, u.flash - dt);
    }

    for (const inc of this.incidents) {
      if (inc.status === 'ACTIVE') {
        if (inc.brush) inc.area = Math.min(90, inc.area + dt * 1.8);
        if (this.t - inc.onSceneT > inc.dur) this.control(inc);
      } else if (inc.status === 'CONTROLLED') {
        if (inc.brush) inc.area = Math.max(12, inc.area - dt * 2.5);
        if (this.t - inc.ctlT > 7) this.release(inc);
      } else if (inc.status === 'DISPATCHED' && !inc.units.length && this.t - inc.dispT > 25) this.control(inc);
    }
    this.incidents = this.incidents.filter(i => !(i.status === 'CLOSED' && this.t - i.closeT > 25));
    if (this.selected && !this.incidents.includes(this.selected)) this.selected = this.incidents.find(i => i.status !== 'CLOSED') || null;

    this.hrAcc += dt; const tick = this.hrAcc > 0.5; if (tick) this.hrAcc = 0;
    for (const p of this.people) {
      const u = this.unitById[p.unit];
      if (u.status === 'ONSCN' && p.scba) {
        p.air -= dt * (0.8 + p.burn);
        if (p.air < 14) { p.air = 100; this.addLog(`${p.unit} ${p.rank} ${p.name} — SCBA BOTTLE CHANGE`, COL.dim); }
      } else p.air = Math.min(100, p.air + dt * 10);
      if (tick) {
        const target = { AVAIL: 72, ENRT: 99, ONSCN: 146, RTN: 90, OOS: 68 }[u.status] + p.hrOff;
        p.hr += (target - p.hr) * 0.15 + (r() - 0.5) * 6;
        if (p.pass) p.hr = 52 + r() * 6;
        p.hist.push(p.hr); p.hist.shift();
      }
    }

    if (!this.passAlarm) {
      const ons = this.people.filter(p => p.scba && this.unitById[p.unit].status === 'ONSCN');
      if (!this.quiet && ons.length && r() < dt * 0.005) {
        const p = ons[Math.floor(r() * ons.length)];
        p.pass = true; this.passAlarm = { p, t: this.t }; this.warnAck = false;
        this.warnMsg = `PASS ALARM ${p.unit} ${p.name}`;
        this.addLog(`!! PASS ALARM — ${p.unit} ${p.rank} ${p.name}`, COL.red);
        this.radioMsg('COMMAND', `Mayday, mayday, PASS alarm on ${p.unit}. RIT team, deploy.`, 4);
        this.emit('warning', p);
      }
    } else if (this.t - this.passAlarm.t > 18) {
      const p = this.passAlarm.p; p.pass = false; this.passAlarm = null;
      this.addLog(`${p.unit} ${p.name} LOCATED — PAR CONFIRMED`, COL.green);
      this.radioMsg('RIT', `Command, RIT has ${p.name.split(' ')[1].toLowerCase()}, he's okay, exiting now.`, 4);
    }
    this.warning = (!!this.passAlarm || this.evac) && !this.warnAck;
    this.caution = (!!this.pending && !this.cautionAck) || !this.cadLink;

    const t = this.t;
    this.wind.dir = (235 + 25 * Math.sin(t * 0.05) + 8 * Math.sin(t * 0.31) + 360) % 360;
    this.wind.spd = 14 + 5 * Math.sin(t * 0.13) + 2.5 * Math.sin(t * 0.71);
    this.wind.gust = this.wind.spd + 5 + 3 * Math.sin(t * 1.3);
    this.weather.temp = 78 + Math.sin(t * 0.01) * 2;

    this.nextChatter -= dt;
    if (this.nextChatter <= 0) { this.randomChatter(); this.nextChatter = 6 + r() * 9; }
    if (this.chatter && this.t - this.chatter.t0 > this.chatter.dur) this.chatter = null;
  }

  pumpPsi(k) { const ons = this.units.some(u => u.type === 'ENGINE' && u.status === 'ONSCN'); return (ons ? 40 + this.throttle[k] * 280 : 30 + this.throttle[k] * 60) + Math.sin(this.t * 3 + k) * 3; }
}

/* ======================================================================
   SCREEN BASE
   ====================================================================== */
const overlayCache = {};
function overlayFor(w, h) {
  const key = w + 'x' + h; if (overlayCache[key]) return overlayCache[key];
  const c = makeCanvas(w, h), x = c.getContext('2d');
  for (let y = 0; y < h; y += 3) { x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(0, y, w, 1); }
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return (overlayCache[key] = c);
}

class Screen {
  constructor(w, h, name, fps = 15) {
    this.w = w; this.h = h; this.name = name; this.fps = fps; this.acc = 1;
    this.c = makeCanvas(w, h); this.ctx = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.bootAt = null; this.power = 0; this.r = rng(name.length * 77 + w);
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, w, h);
  }
  boot(at) { this.bootAt = at; }
  tick(sim, t, dt) {
    this.acc += dt; if (this.acc < 1 / this.fps) return false; this.acc = 0;
    const x = this.ctx;
    if (this.bootAt == null || t < this.bootAt) { x.fillStyle = '#000'; x.fillRect(0, 0, this.w, this.h); this.power = 0; this.tex.needsUpdate = true; return true; }
    const bt = t - this.bootAt;
    this.power = Math.min(1, bt / 0.4);
    if (bt < 1.7) this.drawBoot(bt);
    else {
      this.draw(sim, t);
      if (bt < 2.2) { x.fillStyle = `rgba(200,240,255,${(2.2 - bt) * 0.5})`; x.fillRect(0, 0, this.w, this.h); }
    }
    x.drawImage(overlayFor(this.w, this.h), 0, 0);
    this.tex.needsUpdate = true;
    return true;
  }
  drawBoot(bt) {
    const x = this.ctx, W = this.w, H = this.h, r = this.r;
    x.fillStyle = '#01050a'; x.fillRect(0, 0, W, H);
    if (bt < 0.35) {
      for (let i = 0; i < 260; i++) { const v = r() * 120 | 0; x.fillStyle = `rgb(${v},${v + 20},${v + 30})`; x.fillRect(r() * W, r() * H, 2 + r() * 40, 1 + r() * 3); }
      return;
    }
    const lines = ['METRO FIRE C-OS 7.4.2  (c) EMERGENCY SYSTEMS DIV', `NODE ${this.name}  ·  DISPLAY ${W}x${H}`, 'MEM CHECK ............ 65536K OK', 'GPU SURFACE .......... OK', 'CAD LINK ............. NEGOTIATING', 'CAD LINK ............. ESTABLISHED', 'AVL / GPS FEED ....... SYNC', 'RADIO GATEWAY ........ 6 CH OK', `LOADING ${this.name} MODULE`];
    const n = Math.floor((bt - 0.35) / 1.2 * lines.length) + 1;
    const fs = Math.round(H / 26);
    x.font = `${fs}px ${FONTS.mono}`; x.textBaseline = 'top'; x.textAlign = 'left';
    for (let i = 0; i < Math.min(n, lines.length); i++) { x.fillStyle = i === n - 1 ? COL.white : COL.cyan; x.fillText(lines[i], W * 0.06, H * 0.08 + i * fs * 1.5); }
    const p = clamp((bt - 0.35) / 1.25);
    x.strokeStyle = COL.cyanDim; x.strokeRect(W * 0.06, H * 0.82, W * 0.88, fs);
    x.fillStyle = COL.cyan; x.fillRect(W * 0.06 + 3, H * 0.82 + 3, (W * 0.88 - 6) * p, fs - 6);
  }
}

/* helpers */
function header(x, W, title, right, accent = COL.cyan, h = 56) {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a2130'); g.addColorStop(1, '#06131c');
  x.fillStyle = g; x.fillRect(0, 0, W, h);
  x.fillStyle = accent; x.fillRect(0, h - 2, W, 2); x.fillRect(16, h * 0.28, 6, h * 0.44);
  x.font = `700 ${Math.round(h * 0.52)}px ${FONTS.head}`; x.fillStyle = COL.white; x.textAlign = 'left'; x.textBaseline = 'middle';
  if ('letterSpacing' in x) x.letterSpacing = '3px';
  x.fillText(title, 34, h / 2 + 1);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  if (right) { x.font = `${Math.round(h * 0.42)}px ${FONTS.mono}`; x.textAlign = 'right'; x.fillStyle = accent; x.fillText(right, W - 16, h / 2 + 1); }
}
function txt(x, s, px, py, { size = 22, col = COL.text, align = 'left', font = FONTS.mono, weight = '', base = 'middle' } = {}) {
  x.font = `${weight} ${size}px ${font}`; x.fillStyle = col; x.textAlign = align; x.textBaseline = base; x.fillText(s, px, py);
}
function bar(x, px, py, w, h, v, col, segs = 0) {
  x.fillStyle = '#0b1f2b'; x.fillRect(px, py, w, h);
  x.fillStyle = col; x.fillRect(px, py, w * clamp(v), h);
  if (segs) { x.fillStyle = 'rgba(2,7,11,0.85)'; for (let i = 1; i < segs; i++) x.fillRect(px + w * i / segs - 1, py, 2, h); }
  x.strokeStyle = 'rgba(120,200,230,0.25)'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
}
function chip(x, s, px, py, col, { h = 26, size = 17, w = null, fill = 0.18, align = 'left' } = {}) {
  x.font = `${size}px ${FONTS.mono}`;
  const tw = w || x.measureText(s).width + 16;
  const lx = align === 'center' ? px - tw / 2 : px;
  x.fillStyle = hexA(col, fill); x.fillRect(lx, py - h / 2, tw, h);
  x.strokeStyle = col; x.lineWidth = 1.5; x.strokeRect(lx + 0.75, py - h / 2 + 0.75, tw - 1.5, h - 1.5);
  x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, lx + tw / 2, py + 1);
  return tw;
}
function brackets(x, px, py, w, h, l, col, lw = 2) {
  x.strokeStyle = col; x.lineWidth = lw; x.beginPath();
  x.moveTo(px, py + l); x.lineTo(px, py); x.lineTo(px + l, py);
  x.moveTo(px + w - l, py); x.lineTo(px + w, py); x.lineTo(px + w, py + l);
  x.moveTo(px + w, py + h - l); x.lineTo(px + w, py + h); x.lineTo(px + w - l, py + h);
  x.moveTo(px + l, py + h); x.lineTo(px, py + h); x.lineTo(px, py + h - l); x.stroke();
}
function flame(x, cx, cy, s, col) {
  x.fillStyle = col; x.beginPath();
  x.moveTo(cx, cy - s);
  x.bezierCurveTo(cx + s * 0.75, cy - s * 0.2, cx + s * 0.7, cy + s * 0.75, cx, cy + s * 0.8);
  x.bezierCurveTo(cx - s * 0.7, cy + s * 0.75, cx - s * 0.75, cy - s * 0.1, cx - s * 0.1, cy - s * 0.35);
  x.bezierCurveTo(cx - s * 0.05, cy - s * 0.05, cx + s * 0.15, cy - s * 0.4, cx, cy - s);
  x.fill();
}

/* ======================================================================
   MAP
   ====================================================================== */
class MapScreen extends Screen {
  constructor() {
    super(1600, 900, 'TACMAP', 24);
    this.parts = Array.from({ length: 140 }, () => ({ x: Math.random() * 1600, y: Math.random() * 900, l: Math.random() }));
    this.lastT = 0;
  }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h, v = s.view, z = v.zoom;
    const dt = Math.min(0.1, t - this.lastT); this.lastT = t;
    const hw = 800 / z, hh = 450 / z;
    x.drawImage(s.city, (v.cx - hw) * 2, (v.cy - hh) * 2, hw * 4, hh * 4, 0, 0, W, H);
    const P = (wx, wy) => [(wx - v.cx) * z + W / 2, (wy - v.cy) * z + H / 2];
    const blink = Math.floor(t * 2.5) % 2 === 0;

    // grid
    x.strokeStyle = 'rgba(70,227,255,0.05)'; x.lineWidth = 1;
    for (let gx = 0; gx <= 1600; gx += 100) { const [px] = P(gx, 0); x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke(); }
    for (let gy = 0; gy <= 900; gy += 100) { const [, py] = P(0, gy); x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke(); }

    // wind streaks
    const wa = (s.wind.dir + 180) * Math.PI / 180, wvx = Math.sin(wa), wvy = -Math.cos(wa);
    x.lineWidth = 1.2;
    for (const p of this.parts) {
      p.x += wvx * s.wind.spd * dt * 3; p.y += wvy * s.wind.spd * dt * 3; p.l += dt * 0.25;
      if (p.l > 1 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.x = Math.random() * W; p.y = Math.random() * H; p.l = 0; }
      const a = Math.sin(p.l * Math.PI) * 0.16;
      x.strokeStyle = `rgba(160,230,255,${a})`; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - wvx * 22, p.y - wvy * 22); x.stroke();
    }

    // traffic
    if (s.layers.traffic) {
      x.lineWidth = Math.max(2.5, 3.5 * z); x.lineCap = 'butt';
      s.xs.forEach((ax, i) => { for (let j = 0; j < s.ys.length - 1; j++) seg(ax, s.ys[j], ax, s.ys[j + 1], i * 31 + j); });
      s.ys.forEach((ay, j) => { for (let i = 0; i < s.xs.length - 1; i++) seg(s.xs[i], ay, s.xs[i + 1], ay, j * 57 + i + 400); });
      function seg(x0, y0, x1, y1, k) {
        const c = vnoise(k * 0.37, t * 0.05);
        x.strokeStyle = c > 0.68 ? 'rgba(255,61,46,0.8)' : c > 0.5 ? 'rgba(255,181,46,0.7)' : 'rgba(61,252,154,0.45)';
        const [a, b] = P(x0, y0), [cc, d] = P(x1, y1); x.beginPath(); x.moveTo(a, b); x.lineTo(cc, d); x.stroke();
      }
    }
    // hydrants
    if (s.layers.hydrants) {
      for (const h of s.hydrants) {
        const [px, py] = P(h.x, h.y); if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
        x.fillStyle = h.ok ? '#4fb0ff' : COL.red; x.beginPath(); x.arc(px, py, 2.6 * Math.sqrt(z), 0, 7); x.fill();
        x.strokeStyle = h.ok ? 'rgba(79,176,255,0.5)' : 'rgba(255,61,46,0.6)'; x.beginPath(); x.arc(px, py, 5 * Math.sqrt(z), 0, 7); x.stroke();
      }
    }

    // brush areas
    for (const inc of s.incidents) {
      if (!inc.brush || inc.status === 'PENDING') continue;
      const [cx, cy] = P(inc.x, inc.y);
      x.beginPath();
      for (let a = 0; a <= 64; a++) {
        const th = a / 64 * Math.PI * 2;
        const down = Math.max(0, Math.cos(th - (wa - Math.PI / 2)));
        const rr = inc.area * (0.75 + 0.45 * vnoise(Math.cos(th) * 2 + inc.seed, Math.sin(th) * 2 + t * 0.15) + down * 0.6) * z;
        x.lineTo(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr);
      }
      x.closePath();
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, inc.area * 1.6 * z);
      g.addColorStop(0, 'rgba(255,90,20,0.55)'); g.addColorStop(1, 'rgba(255,40,10,0.12)');
      x.fillStyle = g; x.fill(); x.strokeStyle = inc.status === 'CONTROLLED' ? 'rgba(61,252,154,0.8)' : 'rgba(255,140,40,0.9)';
      x.lineWidth = 2; x.setLineDash([6, 4]); x.stroke(); x.setLineDash([]);
    }

    // routes
    x.lineWidth = 2.5; x.setLineDash([10, 7]); x.lineDashOffset = -t * 40;
    for (const u of s.units) {
      if (!u.path.length) continue;
      x.strokeStyle = u.status === 'RTN' ? 'rgba(79,176,255,0.55)' : 'rgba(255,181,46,0.85)';
      x.beginPath(); x.moveTo(...P(u.x, u.y)); for (const q of u.path) x.lineTo(...P(q.x, q.y)); x.stroke();
    }
    x.setLineDash([]);

    // stations
    for (const st of s.stations) {
      const [px, py] = P(st.x, st.y);
      x.save(); x.translate(px, py);
      x.fillStyle = 'rgba(4,14,20,0.9)'; x.strokeStyle = COL.white; x.lineWidth = 1.8;
      x.beginPath(); x.moveTo(-12, 9); x.lineTo(-12, -3); x.lineTo(0, -13); x.lineTo(12, -3); x.lineTo(12, 9); x.closePath(); x.fill(); x.stroke();
      txt(x, String(st.id), 0, 1, { size: 14, col: COL.white, align: 'center', font: FONTS.head, weight: 700 });
      x.restore();
    }

    // incidents
    for (const inc of s.incidents) {
      if (inc.status === 'CLOSED') continue;
      const [px, py] = P(inc.x, inc.y);
      const col = inc.status === 'PENDING' ? (blink ? COL.red : COL.amber) : inc.status === 'CONTROLLED' ? COL.green : inc.color;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.6 + k / 3) % 1;
        x.strokeStyle = hexA(col, (1 - ph) * 0.8); x.lineWidth = 2;
        x.beginPath(); x.arc(px, py, 10 + ph * 46, 0, 7); x.stroke();
      }
      const g = x.createRadialGradient(px, py, 0, px, py, 34); g.addColorStop(0, hexA(col, 0.45)); g.addColorStop(1, hexA(col, 0));
      x.fillStyle = g; x.beginPath(); x.arc(px, py, 34, 0, 7); x.fill();
      x.save(); x.translate(px, py); x.rotate(Math.PI / 4); x.fillStyle = '#0a0503'; x.strokeStyle = col; x.lineWidth = 2.5; x.fillRect(-11, -11, 22, 22); x.strokeRect(-11, -11, 22, 22); x.restore();
      if (inc.fire) flame(x, px, py, 8, col); else { x.fillStyle = col; x.fillRect(px - 2, py - 7, 4, 9); x.fillRect(px - 2, py + 4, 4, 3); }
      // label
      const lx = px + 22, ly = py - 30;
      x.fillStyle = 'rgba(3,9,13,0.85)'; x.fillRect(lx, ly, 196, 44);
      x.fillStyle = col; x.fillRect(lx, ly, 4, 44);
      txt(x, `${inc.id}  ${inc.alarm > 1 ? inc.alarm + (inc.alarm === 2 ? 'ND' : 'RD') + ' ALM' : ''}`, lx + 12, ly + 13, { size: 15, col: COL.white });
      txt(x, inc.type, lx + 12, ly + 32, { size: 15, col });
    }

    // units (stack by position)
    const slots = {};
    for (const u of s.units) {
      const key = Math.round(u.x / 12) + ':' + Math.round(u.y / 12);
      const k = (slots[key] = (slots[key] || 0) + 1) - 1;
      let [px, py] = P(u.x, u.y);
      const atStation = u.status === 'AVAIL' || u.status === 'OOS';
      if (atStation) { px += 18; py += -6 + k * 17; } else { px += k * 6; py += k * 18; }
      const col = STATUS_COL[u.status];
      x.font = `15px ${FONTS.mono}`; const tw = x.measureText(u.id).width + 14;
      if (!atStation) {
        x.save(); x.translate(P(u.x, u.y)[0], P(u.x, u.y)[1]); x.rotate(u.heading);
        x.fillStyle = col; x.beginPath(); x.moveTo(9, 0); x.lineTo(-6, -6); x.lineTo(-3, 0); x.lineTo(-6, 6); x.closePath(); x.fill(); x.restore();
        px += 10; py -= 16;
      }
      const fl = u.flash > 0 && blink;
      x.fillStyle = fl ? col : 'rgba(3,10,14,0.88)'; x.fillRect(px, py - 8, tw, 16);
      x.strokeStyle = col; x.lineWidth = 1.2; x.strokeRect(px + 0.5, py - 7.5, tw - 1, 15);
      txt(x, u.id, px + tw / 2, py + 1, { size: 13, col: fl ? '#000' : col, align: 'center' });
    }

    // selection
    const sel = s.selected;
    if (sel && sel.status !== 'CLOSED') {
      const [px, py] = P(sel.x, sel.y), sz = 54 + Math.sin(t * 4) * 4;
      brackets(x, px - sz, py - sz, sz * 2, sz * 2, 14, COL.white, 2);
      x.strokeStyle = 'rgba(255,255,255,0.25)'; x.setLineDash([4, 6]);
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, py - sz); x.moveTo(px, py + sz); x.lineTo(px, H); x.moveTo(0, py); x.lineTo(px - sz, py); x.moveTo(px + sz, py); x.lineTo(W, py); x.stroke(); x.setLineDash([]);
      // info panel
      const bx = 20, by = H - 206, bw = 520, bh = 186;
      x.fillStyle = 'rgba(2,9,13,0.9)'; x.fillRect(bx, by, bw, bh);
      x.fillStyle = sel.color; x.fillRect(bx, by, bw, 3);
      brackets(x, bx, by, bw, bh, 12, COL.cyanDim, 1.5);
      txt(x, sel.id, bx + 16, by + 26, { size: 22, col: COL.white });
      chip(x, sel.status, bx + bw - 16 - 150, by + 26, sel.status === 'PENDING' ? COL.red : sel.status === 'CONTROLLED' ? COL.green : COL.amber, { w: 150, size: 16 });
      txt(x, sel.type, bx + 16, by + 58, { size: 30, col: sel.color, font: FONTS.head, weight: 700 });
      txt(x, `${sel.addr} / ${sel.cross}`, bx + 16, by + 90, { size: 18, col: COL.text });
      txt(x, `ELAPSED ${mmss((s.t - sel.t0) * 4.5)}   ALARM ${sel.alarm}   WIND ${Math.round(s.wind.spd)} MPH`, bx + 16, by + 116, { size: 16, col: COL.dim });
      let ux = bx + 16;
      for (const id of sel.units) { const u = s.unitById[id]; ux += chip(x, id, ux, by + 154, STATUS_COL[u.status], { size: 15, h: 24 }) + 8; }
      if (!sel.units.length) txt(x, sel.status === 'PENDING' ? '▶ PRESS DISPATCH' : 'NO UNITS ASSIGNED', bx + 16, by + 154, { size: 17, col: blink ? COL.red : COL.amber });
    }

    // HUD
    x.fillStyle = 'rgba(2,8,12,0.82)'; x.fillRect(0, 0, W, 50);
    x.fillStyle = COL.cyan; x.fillRect(0, 50, W, 1.5);
    txt(x, 'TACTICAL MAP', 22, 26, { size: 28, col: COL.white, font: FONTS.head, weight: 700 });
    txt(x, '// METRO FIRE · LIVE AVL', 196, 27, { size: 17, col: COL.cyan });
    const lay = (n, on, px) => { x.fillStyle = on ? COL.cyan : 'transparent'; x.strokeStyle = COL.cyan; x.lineWidth = 1.5; x.beginPath(); x.arc(px, 26, 6, 0, 7); x.fill(); x.stroke(); txt(x, n, px + 12, 27, { size: 16, col: on ? COL.text : COL.dim }); };
    lay('UNITS', true, 620); lay('HYDRANTS', s.layers.hydrants, 720); lay('TRAFFIC', s.layers.traffic, 860); lay('WIND', true, 990); lay('FOLLOW', s.follow, 1080);
    txt(x, clockStr(), W - 22, 27, { size: 24, col: COL.amber, align: 'right' });
    txt(x, `ZOOM ${z.toFixed(2)}x`, W - 150, 27, { size: 16, col: COL.dim, align: 'right' });
    // compass
    const ccx = W - 52, ccy = 104;
    x.strokeStyle = 'rgba(205,232,244,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.arc(ccx, ccy, 26, 0, 7); x.stroke();
    x.fillStyle = COL.red; x.beginPath(); x.moveTo(ccx, ccy - 22); x.lineTo(ccx + 7, ccy); x.lineTo(ccx - 7, ccy); x.fill();
    x.fillStyle = COL.text; x.beginPath(); x.moveTo(ccx, ccy + 22); x.lineTo(ccx + 7, ccy); x.lineTo(ccx - 7, ccy); x.fill();
    txt(x, 'N', ccx, ccy - 38, { size: 15, col: COL.text, align: 'center' });
    // scale bar
    const sbw = 100 * z; x.fillStyle = COL.text; x.fillRect(W - 40 - sbw, H - 34, sbw, 3); x.fillRect(W - 40 - sbw, H - 42, 2, 11); x.fillRect(W - 42, H - 42, 2, 11);
    txt(x, '0.5 MI', W - 40 - sbw / 2, H - 52, { size: 14, col: COL.text, align: 'center' });
    txt(x, `${(34.05 + (450 - v.cy) * 0.0004).toFixed(4)}N  ${(118.24 + (800 - v.cx) * 0.0004).toFixed(4)}W`, W - 40, H - 14, { size: 13, col: COL.dim, align: 'right' });
    brackets(x, 8, 58, W - 16, H - 66, 26, 'rgba(70,227,255,0.45)', 2);

    if (!s.cadLink) {
      x.fillStyle = 'rgba(30,0,0,0.55)'; x.fillRect(0, 0, W, H);
      if (blink) { x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(W / 2 - 300, H / 2 - 50, 600, 100); x.strokeStyle = COL.red; x.lineWidth = 3; x.strokeRect(W / 2 - 300, H / 2 - 50, 600, 100); txt(x, 'CAD LINK LOST', W / 2, H / 2 + 2, { size: 54, col: COL.red, align: 'center', font: FONTS.head, weight: 700 }); }
    }
  }
}

/* ======================================================================
   FLEET
   ====================================================================== */
class FleetScreen extends Screen {
  constructor() { super(1024, 730, 'FLEET', 12); }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h;
    x.fillStyle = COL.bg; x.fillRect(0, 0, W, H);
    header(x, W, 'FLEET STATUS', clockStr());
    const st = s.stats.c;
    const keys = ['AVAIL', 'ENRT', 'ONSCN', 'RTN', 'OOS'], bw = (W - 40 - 32) / 5;
    keys.forEach((k, i) => {
      const bx = 20 + i * (bw + 8), by = 70;
      x.fillStyle = hexA(STATUS_COL[k], 0.1); x.fillRect(bx, by, bw, 76);
      x.fillStyle = STATUS_COL[k]; x.fillRect(bx, by, bw, 3);
      txt(x, String(st[k]).padStart(2, '0'), bx + 14, by + 42, { size: 46, col: STATUS_COL[k], font: FONTS.head, weight: 700 });
      txt(x, STATUS_TXT[k], bx + bw - 10, by + 58, { size: 15, col: COL.dim, align: 'right' });
    });
    const cols = [22, 112, 236, 404, 566, 738, 900];
    const hy = 172;
    ['UNIT', 'TYPE', 'STATUS', 'ASSIGNMENT', 'TANK H2O', 'FUEL', 'ETA'].forEach((h, i) => txt(x, h, cols[i], hy, { size: 15, col: COL.dim }));
    x.fillStyle = COL.line; x.fillRect(16, hy + 14, W - 32, 1.5);
    const rh = 37.5;
    s.units.forEach((u, k) => {
      const y = hy + 22 + k * rh, cy = y + rh / 2, col = STATUS_COL[u.status];
      x.fillStyle = k % 2 ? 'rgba(20,50,70,0.18)' : 'rgba(0,0,0,0)'; x.fillRect(16, y, W - 32, rh - 2);
      if (u.flash > 0 && Math.floor(t * 4) % 2) { x.fillStyle = hexA(col, 0.18); x.fillRect(16, y, W - 32, rh - 2); }
      x.fillStyle = col; x.fillRect(16, y + 4, 4, rh - 10);
      txt(x, u.id, cols[0] + 8, cy, { size: 22, col: COL.white, font: FONTS.head, weight: 700 });
      txt(x, TYPE_SHORT[u.type], cols[1], cy, { size: 17, col: COL.text });
      chip(x, STATUS_TXT[u.status], cols[2], cy, col, { w: 150, size: 15, h: 25 });
      const asg = u.inc ? u.inc : u.note ? `STA ${u.st} · ${u.note}` : `STA ${u.st}`;
      txt(x, asg, cols[3], cy, { size: 17, col: u.inc ? COL.amber : COL.text });
      if (u.water != null) { bar(x, cols[4], cy - 7, 120, 14, u.water / 100, u.water < 25 ? COL.red : COL.blue, 10); txt(x, `${Math.round(u.water * 7.5)}G`, cols[4] + 128, cy, { size: 14, col: COL.dim }); }
      else txt(x, '—', cols[4] + 50, cy, { size: 17, col: COL.dim });
      bar(x, cols[5], cy - 7, 110, 14, u.fuel / 100, u.fuel < 25 ? COL.red : COL.green, 10);
      txt(x, `${Math.round(u.fuel)}%`, cols[5] + 118, cy, { size: 14, col: COL.dim });
      txt(x, u.status === 'ENRT' || u.status === 'RTN' ? mmss(u.eta) : '--:--', cols[6], cy, { size: 19, col: u.status === 'ENRT' ? COL.amber : COL.dim });
    });
  }
}

/* ======================================================================
   PERSONNEL
   ====================================================================== */
class PeopleScreen extends Screen {
  constructor() { super(1024, 730, 'PERSONNEL', 10); }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h;
    x.fillStyle = COL.bg; x.fillRect(0, 0, W, H);
    header(x, W, 'PERSONNEL · PAR', clockStr(), COL.amber);
    const st = s.stats, onsP = st.onsP.length;
    const avgHr = s.people.reduce((a, p) => a + p.hr, 0) / s.people.length;
    const parT = 600 - ((s.t * 4.5) % 600);
    const items = [['ON DUTY', String(s.people.length), COL.white], ['ON SCENE', String(onsP).padStart(2, '0'), COL.red], ['AVG HR', Math.round(avgHr) + '', COL.amber], ['NEXT PAR', mmss(parT), COL.cyan], ['PASS ALM', s.passAlarm ? '01' : '00', s.passAlarm ? COL.red : COL.green]];
    const bw = (W - 40 - 32) / 5;
    items.forEach(([l, v, c], i) => {
      const bx = 20 + i * (bw + 8), by = 68;
      const alarm = l === 'PASS ALM' && s.passAlarm && Math.floor(t * 4) % 2;
      x.fillStyle = alarm ? 'rgba(255,61,46,0.5)' : hexA(c, 0.08); x.fillRect(bx, by, bw, 66);
      x.fillStyle = c; x.fillRect(bx, by, 3, 66);
      txt(x, l, bx + 12, by + 15, { size: 14, col: COL.dim });
      txt(x, v, bx + 12, by + 44, { size: 36, col: c, font: FONTS.head, weight: 700 });
    });
    const top = 146, rh = (H - top - 8) / s.units.length;
    s.units.forEach((u, k) => {
      const y = top + k * rh, col = STATUS_COL[u.status];
      x.fillStyle = k % 2 ? 'rgba(20,50,70,0.16)' : 'rgba(0,0,0,0)'; x.fillRect(12, y, W - 24, rh - 2);
      x.fillStyle = col; x.fillRect(12, y + 3, 4, rh - 8);
      txt(x, u.id, 24, y + rh / 2, { size: 21, col: COL.white, font: FONTS.head, weight: 700 });
      const cw = (W - 100) / 4;
      u.crew.forEach((p, ci) => {
        const cx = 88 + ci * cw, cy = y + rh / 2;
        if (p.pass) { x.fillStyle = Math.floor(t * 5) % 2 ? 'rgba(255,61,46,0.55)' : 'rgba(255,61,46,0.15)'; x.fillRect(cx - 4, y + 1, cw - 6, rh - 4); }
        txt(x, `${p.rank} ${p.name}`, cx, cy - 7, { size: 14, col: COL.text });
        const hc = p.hr > 165 ? COL.red : p.hr > 130 ? COL.amber : COL.green;
        txt(x, `♥${Math.round(p.hr)}`, cx, cy + 10, { size: 14, col: hc });
        // sparkline
        x.strokeStyle = hexA(hc, 0.8); x.lineWidth = 1.2; x.beginPath();
        p.hist.forEach((h, i) => { const sx = cx + 52 + i * 1.5, sy = cy + 16 - clamp((h - 50) / 140) * 16; i ? x.lineTo(sx, sy) : x.moveTo(sx, sy); }); x.stroke();
        if (u.status === 'ONSCN' && p.scba) { bar(x, cx + 120, cy + 4, cw - 136, 8, p.air / 100, p.air < 30 ? COL.red : COL.cyan); txt(x, `AIR ${Math.round(p.air)}`, cx + cw - 16, cy - 7, { size: 12, col: p.air < 30 ? COL.red : COL.dim, align: 'right' }); }
      });
    });
  }
}

/* ======================================================================
   MFD 1 — LOGISTICS
   ====================================================================== */
export const MFD_KEYS = {
  equip: { L: ['EQUIP', 'PUMP', 'HYDR', 'SYS'], R: ['ENG ▲', 'ENG ▼', 'RESET', 'TEST'] },
  therm: { L: ['CAM 1', 'CAM 2', 'CAM 3', 'CAM 4'], R: ['WHT', 'IRON', 'RAIN', 'REC'] },
};
function softkeys(x, W, H, keys, active) {
  [0, 1].forEach(side => keys[side ? 'R' : 'L'].forEach((k, i) => {
    const y = H * (0.2 + i * 0.2), isA = active.includes(k);
    x.font = `20px ${FONTS.mono}`; x.textBaseline = 'middle';
    const tw = x.measureText(k).width + 14;
    const px = side ? W - 10 - tw : 10;
    if (isA) { x.fillStyle = COL.green; x.fillRect(px, y - 15, tw, 30); }
    x.strokeStyle = isA ? COL.green : COL.cyanDim; x.lineWidth = 1.5; x.strokeRect(px, y - 15, tw, 30);
    x.fillStyle = isA ? '#000' : COL.text; x.textAlign = 'left'; x.fillText(k, px + 7, y + 1);
    x.fillStyle = COL.cyanDim; x.fillRect(side ? W - 6 : 0, y - 1, 6, 2);
  }));
}
function arcGauge(x, cx, cy, r, v, label, val, col) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  x.lineCap = 'butt';
  x.strokeStyle = '#0d2533'; x.lineWidth = 16; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
  x.strokeStyle = 'rgba(255,61,46,0.5)'; x.beginPath(); x.arc(cx, cy, r, a0 + (a1 - a0) * 0.85, a1); x.stroke();
  x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, r, a0, a0 + (a1 - a0) * clamp(v)); x.stroke();
  const a = a0 + (a1 - a0) * clamp(v);
  x.strokeStyle = COL.white; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22)); x.lineTo(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10)); x.stroke();
  txt(x, val, cx, cy + 4, { size: 34, col: COL.white, align: 'center', font: FONTS.head, weight: 700 });
  txt(x, label, cx, cy + r * 0.62, { size: 15, col: COL.dim, align: 'center' });
}
class EquipMFD extends Screen {
  constructor() { super(640, 640, 'MFD-1', 12); }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h;
    x.fillStyle = '#010508'; x.fillRect(0, 0, W, H);
    const page = s.mfdPage;
    txt(x, `MFD 1 · ${page}`, W / 2, 28, { size: 22, col: COL.green, align: 'center' });
    x.fillStyle = 'rgba(61,252,154,0.35)'; x.fillRect(100, 48, W - 200, 1.5);
    softkeys(x, W, H, MFD_KEYS.equip, [page]);
    const L = 104, R = W - 104, cw = R - L;
    if (page === 'EQUIP') {
      const onsP = s.stats.onsP.length;
      const rows = [['SCBA CYL', 64 - onsP, 64], ['1¾" ATTACK', 3200 - onsP * 100, 3200], ['5" LDH', 6000 - onsP * 150, 6000], ['FOAM AFFF', 420 - s.throttle[2] * 120, 500], ['HYD TOOLS', 9, 10], ['TIC CAMS', 14 - Math.min(6, onsP), 14], ['ALS KITS', 12, 14], ['GROUND LDR', 22, 24]];
      rows.forEach(([n, v, m], i) => {
        const y = 82 + i * 62, f = v / m;
        txt(x, n, L, y, { size: 19, col: COL.text });
        txt(x, `${Math.round(v)}/${m}`, R, y, { size: 18, col: f < 0.5 ? COL.amber : COL.green, align: 'right' });
        bar(x, L, y + 16, cw, 16, f, f < 0.5 ? COL.amber : COL.green, 20);
      });
    } else if (page === 'PUMP') {
      const eng = s.units.filter(u => u.type === 'ENGINE'); const u = eng[s.pumpUnit % eng.length];
      txt(x, `${u.id} · ${STATUS_TXT[u.status]}`, W / 2, 78, { size: 20, col: STATUS_COL[u.status], align: 'center' });
      arcGauge(x, 210, 210, 82, s.pumpPsi(0) / 400, 'PUMP 1 PSI', Math.round(s.pumpPsi(0)), COL.green);
      arcGauge(x, 430, 210, 82, s.pumpPsi(1) / 400, 'PUMP 2 PSI', Math.round(s.pumpPsi(1)), COL.green);
      arcGauge(x, 210, 420, 72, s.throttle[2], 'FOAM %', Math.round(s.throttle[2] * 6 * 10) / 10 + '', COL.magenta);
      const gpm = Math.round((s.throttle[0] + s.throttle[1]) * 750);
      txt(x, 'FLOW', 360, 380, { size: 16, col: COL.dim }); txt(x, `${gpm} GPM`, 360, 412, { size: 30, col: COL.cyan, font: FONTS.head, weight: 700 });
      txt(x, 'TANK', 360, 452, { size: 16, col: COL.dim }); bar(x, 360, 466, 170, 18, (u.water || 0) / 100, COL.blue, 10);
      txt(x, 'INTAKE', 360, 512, { size: 16, col: COL.dim }); txt(x, `${Math.round(52 + Math.sin(t) * 2)} PSI`, 450, 512, { size: 18, col: COL.text });
      txt(x, 'RPM', 112, 540, { size: 16, col: COL.dim }); txt(x, `${Math.round(900 + (s.throttle[0] + s.throttle[1]) * 900)}`, 160, 540, { size: 20, col: COL.text });
    } else if (page === 'HYDR') {
      const inc = s.selected;
      txt(x, inc ? `NEAR ${inc.id}` : 'NO INCIDENT', W / 2, 78, { size: 19, col: COL.amber, align: 'center' });
      const list = inc ? [...s.hydrants].sort((a, b) => Math.hypot(a.x - inc.x, a.y - inc.y) - Math.hypot(b.x - inc.x, b.y - inc.y)).slice(0, 7) : [];
      txt(x, 'ID', L, 114, { size: 15, col: COL.dim }); txt(x, 'DIST', L + 130, 114, { size: 15, col: COL.dim }); txt(x, 'STATIC', L + 230, 114, { size: 15, col: COL.dim }); txt(x, 'STAT', R, 114, { size: 15, col: COL.dim, align: 'right' });
      list.forEach((h, i) => {
        const y = 150 + i * 56, d = Math.hypot(h.x - inc.x, h.y - inc.y) * 2.2;
        x.fillStyle = i % 2 ? 'rgba(20,50,70,0.25)' : 'transparent'; x.fillRect(L - 6, y - 22, cw + 12, 44);
        txt(x, h.id, L, y, { size: 20, col: COL.text }); txt(x, `${Math.round(d)} FT`, L + 130, y, { size: 19, col: COL.text });
        txt(x, `${h.psi} PSI`, L + 230, y, { size: 19, col: h.psi < 55 ? COL.amber : COL.green }); chip(x, h.ok ? 'OK' : 'OOS', R - 60, y, h.ok ? COL.green : COL.red, { w: 60, size: 15 });
      });
    } else {
      const rows = [['CAD LINK', s.cadLink ? 'OK' : 'LOST', s.cadLink], ['AVL / GPS', 'OK', true], ['RADIO TWR N', 'OK', true], ['RADIO TWR S', 'OK', true], ['MDT NETWORK', s.cadLink ? 'OK' : 'DEGR', s.cadLink], ['UPS', `${s.emerPwr ? 'BATT 87%' : 'LINE 98%'}`, true], ['GENERATOR', s.genTest ? 'RUN' : 'STBY', true], ['RECORDER', 'REC', true]];
      rows.forEach(([n, v, ok], i) => {
        const y = 92 + i * 60;
        x.fillStyle = ok ? COL.green : (Math.floor(t * 3) % 2 ? COL.red : '#300'); x.beginPath(); x.arc(L + 8, y, 7, 0, 7); x.fill();
        txt(x, n, L + 28, y, { size: 21, col: COL.text }); txt(x, v, R, y, { size: 21, col: ok ? COL.green : COL.red, align: 'right' });
        x.fillStyle = COL.line; x.fillRect(L, y + 26, cw, 1);
      });
    }
  }
}

/* ======================================================================
   MFD 2 — THERMAL
   ====================================================================== */
function makeLUT(stops) {
  const c = makeCanvas(256, 1), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 256, 0);
  stops.forEach(([p, col]) => g.addColorStop(p, col)); x.fillStyle = g; x.fillRect(0, 0, 256, 1);
  return x.getImageData(0, 0, 256, 1).data;
}
const LUTS = [
  makeLUT([[0, '#000'], [1, '#fff']]),
  makeLUT([[0, '#000010'], [0.2, '#2a0a6b'], [0.4, '#9b1a8a'], [0.6, '#e8461e'], [0.8, '#ffb000'], [1, '#fffbe0']]),
  makeLUT([[0, '#000040'], [0.2, '#0050ff'], [0.4, '#00e0c0'], [0.6, '#60ff20'], [0.8, '#ffd000'], [1, '#ff1000']]),
];
const CAMS = ['CAM 1 · ENGINE BOOM', 'CAM 2 · HELMET TIC', 'CAM 3 · RIDGE TOWER', 'CAM 4 · DRONE UAS-2'];
class ThermalMFD extends Screen {
  constructor() {
    super(640, 640, 'MFD-2', 14);
    this.fw = 128; this.fh = 96; this.fc = makeCanvas(this.fw, this.fh); this.fx = this.fc.getContext('2d');
    this.img = this.fx.createImageData(this.fw, this.fh); this.field = new Float32Array(this.fw * this.fh);
  }
  temp(cam, u, v, t) {
    const plume = (sx, sy, wd, str) => {
      const dy = sy - v; if (dy < -0.03) return 0;
      const tu = fbm(u * 7 + 3, v * 5 + t * 2.4);
      const w = wd + Math.max(0, dy) * 0.32;
      const dx = u - sx + (tu - 0.5) * 0.12 * (0.3 + dy * 3);
      return Math.exp(-(dx * dx) / (w * w)) * Math.exp(-Math.max(0, dy) * 3.2) * (0.55 + 0.6 * tu) * str;
    };
    let T = 0.16 + 0.06 * fbm(u * 5, v * 5);
    if (cam === 0) {
      if (u > 0.12 && u < 0.88 && v > 0.38) { T = 0.3 + 0.04 * fbm(u * 20, v * 20); const wx = (u - 0.12) / 0.76 * 4, wy = (v - 0.38) / 0.62 * 3; if (wx % 1 > 0.25 && wx % 1 < 0.75 && wy % 1 > 0.25 && wy % 1 < 0.7) T = 0.42; }
      T = Math.max(T, plume(0.42, 0.52, 0.06, 1.05), plume(0.68, 0.72, 0.05, 0.8));
      T += 0.18 * Math.exp(-((u - 0.5) ** 2) / 0.08) * Math.max(0, 0.45 - v);
    } else if (cam === 1) {
      if (v > 0.7) T = 0.2 + 0.03 * fbm(u * 10, v * 30);
      const inCar = u > 0.25 && u < 0.78 && v > 0.48 && v < 0.74 && !(v < 0.56 && (u < 0.36 || u > 0.66));
      if (inCar) T = 0.38;
      for (const wx of [0.34, 0.68]) if (Math.hypot((u - wx) * 1.33, v - 0.74) < 0.06) T = 0.24;
      T = Math.max(T, plume(0.3, 0.6, 0.07, 1.1));
    } else if (cam === 2) {
      const hz = 0.42 + 0.05 * Math.sin(u * 6);
      if (v > hz) T = 0.22 + 0.04 * fbm(u * 12, v * 12);
      const front = 0.62 + 0.06 * Math.sin(u * 11 + 1) + 0.02 * Math.sin(u * 37 + t);
      if (v > front) T = 0.5 + 0.2 * fbm(u * 18 + t * 0.4, v * 18);
      T = Math.max(T, 0.95 * Math.exp(-((v - front) ** 2) / 0.0012) * (0.6 + 0.5 * fbm(u * 14, t * 1.4)));
      for (let k = 0; k < 6; k++) T = Math.max(T, plume(0.08 + k * 0.17, 0.62 + 0.06 * Math.sin((0.08 + k * 0.17) * 11 + 1), 0.04, 0.7));
    } else {
      const gx = (u * 6) % 1, gy = (v * 4.5) % 1;
      if (gx < 0.08 || gy < 0.1) T = 0.24; else T = 0.3 + 0.05 * fbm(u * 30, v * 30);
      for (const [hx, hy, r] of [[0.35, 0.4, 0.09], [0.62, 0.55, 0.06], [0.5, 0.48, 0.05]]) T = Math.max(T, Math.exp(-(((u - hx) ** 2) + ((v - hy) ** 2) * 1.8) / (r * r)) * (0.75 + 0.35 * fbm(u * 16 + t, v * 16)));
      for (let k = 0; k < 4; k++) { const fx = 0.2 + k * 0.17 + Math.sin(t * 0.4 + k) * 0.02, fy = 0.72 + Math.cos(t * 0.3 + k * 2) * 0.03; if (Math.hypot(u - fx, (v - fy) * 1.33) < 0.012) T = 0.62; }
    }
    return clamp(T);
  }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h, fw = this.fw, fh = this.fh;
    x.fillStyle = '#010508'; x.fillRect(0, 0, W, H);
    const lut = LUTS[s.thermPal], d = this.img.data;
    const panU = (s.aim.x - 0.5) * 0.25, panV = (s.aim.y - 0.5) * 0.2;
    let mx = 0;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const T = this.temp(s.cam, i / fw * 0.8 + 0.1 + panU, j / fh * 0.8 + 0.1 + panV, t);
      const k = j * fw + i; this.field[k] = T; if (T > mx) mx = T;
      const li = Math.min(255, (T * 255) | 0) * 4, n = (Math.random() - 0.5) * 10;
      d[k * 4] = lut[li] + n; d[k * 4 + 1] = lut[li + 1] + n; d[k * 4 + 2] = lut[li + 2] + n; d[k * 4 + 3] = 255;
    }
    this.fx.putImageData(this.img, 0, 0);
    const ix = 100, iy = 70, iw = 440, ih = 330;
    x.imageSmoothingEnabled = true; x.drawImage(this.fc, ix, iy, iw, ih);
    // HUD over image
    const cx = ix + iw / 2, cy = iy + ih / 2;
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - 26, cy); x.lineTo(cx - 8, cy); x.moveTo(cx + 8, cy); x.lineTo(cx + 26, cy); x.moveTo(cx, cy - 26); x.lineTo(cx, cy - 8); x.moveTo(cx, cy + 8); x.lineTo(cx, cy + 26); x.stroke();
    x.strokeRect(cx - 3, cy - 3, 6, 6);
    brackets(x, ix + 10, iy + 10, iw - 20, ih - 20, 20, 'rgba(255,255,255,0.7)', 2);
    const spot = this.field[(fh / 2 | 0) * fw + (fw / 2 | 0)];
    const C = T => Math.round(15 + T * T * 760);
    txt(x, `SPOT ${C(spot)}°C`, ix + 18, iy + 30, { size: 19, col: COL.white });
    txt(x, `MAX ${C(mx)}°C`, ix + iw - 18, iy + 30, { size: 19, col: mx > 0.8 ? COL.red : COL.white, align: 'right' });
    if (s.rec && Math.floor(t * 1.5) % 2) { x.fillStyle = COL.red; x.beginPath(); x.arc(ix + 26, iy + ih - 24, 7, 0, 7); x.fill(); txt(x, 'REC', ix + 40, iy + ih - 23, { size: 17, col: COL.red }); }
    txt(x, `PAN ${(s.aim.x * 60 - 30).toFixed(0)}° TLT ${(15 - s.aim.y * 30).toFixed(0)}°`, ix + iw - 18, iy + ih - 23, { size: 15, col: COL.white, align: 'right' });
    // palette bar
    for (let i = 0; i < 200; i++) { const li = Math.floor(i / 200 * 255) * 4; x.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`; x.fillRect(ix + 60 + i * 1.6, iy + ih + 18, 2, 14); }
    txt(x, '15°', ix + 52, iy + ih + 25, { size: 14, col: COL.dim, align: 'right' }); txt(x, '775°', ix + 386, iy + ih + 25, { size: 14, col: COL.dim });
    txt(x, CAMS[s.cam], W / 2, 520, { size: 20, col: COL.green, align: 'center' });
    txt(x, s.selected ? `${s.selected.id} · ${s.selected.addr}` : 'NO INCIDENT LINKED', W / 2, 552, { size: 16, col: COL.dim, align: 'center' });
    txt(x, `MFD 2 · THERMAL`, W / 2, 30, { size: 22, col: COL.green, align: 'center' });
    softkeys(x, W, H, MFD_KEYS.therm, [`CAM ${s.cam + 1}`, ['WHT', 'IRON', 'RAIN'][s.thermPal], s.rec ? 'REC' : '']);
  }
}

/* ======================================================================
   CAD QUEUE / LOG
   ====================================================================== */
class LogScreen extends Screen {
  constructor() { super(1024, 730, 'CAD', 10); }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h;
    x.fillStyle = COL.bg; x.fillRect(0, 0, W, H);
    header(x, W, 'CAD · INCIDENT QUEUE', `${s.stats.active} ACTIVE`, COL.red);
    const live = s.incidents.filter(i => i.status !== 'CLOSED').slice(-5);
    const blink = Math.floor(t * 3) % 2;
    live.forEach((inc, k) => {
      const y = 70 + k * 66, sel = inc === s.selected;
      x.fillStyle = sel ? 'rgba(70,227,255,0.10)' : 'rgba(20,50,70,0.2)'; x.fillRect(14, y, W - 28, 60);
      x.fillStyle = inc.status === 'PENDING' && blink ? COL.red : inc.color; x.fillRect(14, y, 5, 60);
      if (sel) { x.strokeStyle = COL.cyan; x.lineWidth = 1.5; x.strokeRect(14.75, y + 0.75, W - 29.5, 58.5); }
      txt(x, inc.id, 32, y + 20, { size: 19, col: COL.white });
      txt(x, inc.type, 32, y + 44, { size: 22, col: inc.color, font: FONTS.head, weight: 700 });
      txt(x, `${inc.addr} / ${inc.cross}`, 250, y + 20, { size: 17, col: COL.text });
      txt(x, inc.units.join('  ') || (inc.status === 'PENDING' ? 'AWAITING DISPATCH' : '—'), 250, y + 44, { size: 16, col: inc.units.length ? COL.amber : COL.red });
      chip(x, inc.status, W - 190, y + 20, inc.status === 'PENDING' ? COL.red : inc.status === 'CONTROLLED' ? COL.green : COL.amber, { w: 168, size: 15, h: 24 });
      txt(x, mmss((s.t - inc.t0) * 4.5), W - 30, y + 46, { size: 18, col: COL.dim, align: 'right' });
    });
    if (!live.length) txt(x, 'NO ACTIVE INCIDENTS', W / 2, 140, { size: 22, col: COL.dim, align: 'center' });
    const ly = 70 + 5 * 66 + 10;
    x.fillStyle = '#071722'; x.fillRect(0, ly, W, 34); x.fillStyle = COL.cyanDim; x.fillRect(0, ly + 34, W, 1.5);
    txt(x, 'EVENT / RADIO LOG', 20, ly + 18, { size: 17, col: COL.cyan });
    const lines = s.log.slice(-11);
    lines.forEach((l, i) => {
      const y = ly + 54 + i * 26.5;
      txt(x, l.time, 20, y, { size: 15, col: COL.dim });
      let m = l.msg; if (m.length > 88) m = m.slice(0, 87) + '…';
      txt(x, m, 112, y, { size: 15, col: l.col });
    });
    if (blink) { x.fillStyle = COL.cyan; x.fillRect(112, ly + 54 + lines.length * 26.5 - 8, 10, 16); }
  }
}

/* ======================================================================
   WEATHER / COMMS
   ====================================================================== */
class WxScreen extends Screen {
  constructor() { super(1024, 730, 'WX-COMMS', 15); this.wave = new Float32Array(120); }
  draw(s, t) {
    const x = this.ctx, W = this.w, H = this.h;
    x.fillStyle = COL.bg; x.fillRect(0, 0, W, H);
    header(x, W, 'WEATHER · COMMS', 'KMFD METAR', COL.cyan);
    // compass
    const cx = 220, cy = 270, R = 150;
    x.strokeStyle = COL.line; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
    x.beginPath(); x.arc(cx, cy, R * 0.62, 0, 7); x.stroke();
    for (let a = 0; a < 360; a += 10) {
      const r0 = a % 30 ? R - 10 : R - 20, th = (a - 90) * Math.PI / 180;
      x.strokeStyle = a % 30 ? COL.cyanDim : COL.text; x.lineWidth = a % 30 ? 1.5 : 2.5;
      x.beginPath(); x.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0); x.lineTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R); x.stroke();
    }
    ['N', 'E', 'S', 'W'].forEach((l, i) => { const th = (i * 90 - 90) * Math.PI / 180; txt(x, l, cx + Math.cos(th) * (R + 22), cy + Math.sin(th) * (R + 22), { size: 22, col: l === 'N' ? COL.red : COL.text, align: 'center', font: FONTS.head, weight: 700 }); });
    const th = (s.wind.dir - 90) * Math.PI / 180;
    x.save(); x.translate(cx, cy); x.rotate(th + Math.PI);
    x.fillStyle = COL.amber; x.beginPath(); x.moveTo(R - 26, 0); x.lineTo(-R * 0.5, -12); x.lineTo(-R * 0.4, 0); x.lineTo(-R * 0.5, 12); x.closePath(); x.globalAlpha = 0.9; x.fill(); x.globalAlpha = 1; x.restore();
    x.fillStyle = 'rgba(2,7,11,0.85)'; x.beginPath(); x.arc(cx, cy, 58, 0, 7); x.fill();
    txt(x, Math.round(s.wind.spd) + '', cx, cy - 6, { size: 52, col: COL.white, align: 'center', font: FONTS.head, weight: 700 });
    txt(x, 'MPH', cx, cy + 30, { size: 15, col: COL.dim, align: 'center' });
    txt(x, `FROM ${pad(s.wind.dir, 3)}°  G${Math.round(s.wind.gust)}`, cx, cy + R + 52, { size: 19, col: COL.amber, align: 'center' });
    // right column
    const rx = 440;
    const kv = [['TEMP', `${s.weather.temp.toFixed(0)}°F`], ['REL HUM', `${s.weather.rh}%`], ['DEW PT', `${s.weather.dew}°F`], ['BARO', `${s.weather.baro}`]];
    kv.forEach(([k, v], i) => { const bx = rx + (i % 2) * 280, by = 80 + Math.floor(i / 2) * 84; x.fillStyle = 'rgba(20,50,70,0.25)'; x.fillRect(bx, by, 266, 72); txt(x, k, bx + 14, by + 18, { size: 15, col: COL.dim }); txt(x, v, bx + 14, by + 50, { size: 34, col: COL.white, font: FONTS.head, weight: 700 }); });
    txt(x, 'FIRE DANGER INDEX', rx, 274, { size: 16, col: COL.dim });
    const g = x.createLinearGradient(rx, 0, rx + 546, 0);
    g.addColorStop(0, '#2bd67b'); g.addColorStop(0.35, '#e8d23a'); g.addColorStop(0.65, '#ff8a1a'); g.addColorStop(1, '#ff2a1a');
    x.fillStyle = g; x.fillRect(rx, 290, 546, 22);
    const fd = 0.8; x.fillStyle = COL.white; x.beginPath(); x.moveTo(rx + 546 * fd, 286); x.lineTo(rx + 546 * fd - 8, 276); x.lineTo(rx + 546 * fd + 8, 276); x.fill();
    ['LOW', 'MOD', 'HIGH', 'V.HIGH', 'EXTREME'].forEach((l, i) => txt(x, l, rx + i * 546 / 4.6, 328, { size: 13, col: COL.dim }));
    if (Math.floor(t * 1.4) % 2) { x.strokeStyle = COL.red; x.lineWidth = 2; x.strokeRect(rx, 348, 546, 40); txt(x, '⚠ RED FLAG WARNING · UNTIL 2000', rx + 273, 369, { size: 20, col: COL.red, align: 'center' }); }
    else { x.fillStyle = 'rgba(255,61,46,0.18)'; x.fillRect(rx, 348, 546, 40); txt(x, '⚠ RED FLAG WARNING · UNTIL 2000', rx + 273, 369, { size: 20, col: COL.red, align: 'center' }); }
    // comms
    const cy0 = 468;
    x.fillStyle = '#071722'; x.fillRect(0, cy0, W, 34); x.fillStyle = COL.cyanDim; x.fillRect(0, cy0 + 34, W, 1.5);
    txt(x, 'RADIO CHANNELS', 20, cy0 + 18, { size: 17, col: COL.cyan });
    txt(x, `MONITOR ${CHANNELS[s.radioCh]}`, W - 20, cy0 + 18, { size: 17, col: COL.amber, align: 'right' });
    CHANNELS.forEach((ch, i) => {
      const bx = 20 + (i % 3) * 330, by = cy0 + 50 + Math.floor(i / 3) * 52;
      const live = s.chatter && s.chatter.ch === i, mon = s.radioCh === i;
      x.fillStyle = live ? 'rgba(61,252,154,0.22)' : 'rgba(20,50,70,0.25)'; x.fillRect(bx, by, 318, 44);
      x.strokeStyle = mon ? COL.amber : live ? COL.green : COL.line; x.lineWidth = mon ? 2.5 : 1.5; x.strokeRect(bx, by, 318, 44);
      txt(x, ch, bx + 14, by + 23, { size: 20, col: live ? COL.green : COL.text });
      txt(x, live ? '● RX' : mon ? 'MON' : '', bx + 304, by + 23, { size: 15, col: live ? COL.green : COL.amber, align: 'right' });
    });
    // waveform
    const wy = cy0 + 170;
    for (let i = 0; i < this.wave.length - 1; i++) this.wave[i] = this.wave[i + 1];
    this.wave[this.wave.length - 1] = s.chatter ? 0.25 + Math.random() * 0.75 * (0.5 + 0.5 * Math.sin(t * 9)) : Math.random() * 0.05;
    for (let i = 0; i < this.wave.length; i++) { const h = this.wave[i] * 34; x.fillStyle = s.chatter ? COL.green : COL.cyanDim; x.fillRect(20 + i * 6.6, wy - h, 4, h * 2 + 1); }
    if (s.chatter) { let m = `${s.chatter.from}: ${s.chatter.text}`; if (m.length > 34) m = m.slice(0, 33) + '…'; txt(x, m, W - 20, wy, { size: 16, col: COL.text, align: 'right' }); }
  }
}

/* ======================================================================
   GLARESHIELD 7-SEG STRIP
   ====================================================================== */
export const GLARE_GROUPS = [
  { x: -0.355, label: 'UNITS AVAIL', key: 'avail' },
  { x: -0.235, label: 'ACTIVE INC', key: 'active' },
  { x: -0.13, label: 'ALARM LVL', key: 'alarm' },
  { x: 0.015, label: 'LOCAL TIME', key: 'clock' },
  { x: 0.165, label: 'AVG RESP', key: 'resp' },
  { x: 0.27, label: 'ON SCENE', key: 'ons' },
  { x: 0.365, label: 'WIND MPH', key: 'wind' },
];
export class GlareStrip {
  constructor(wM = 0.86, hM = 0.032) {
    this.wM = wM; this.W = 2048; this.H = Math.round(2048 * hM / wM);
    this.c = makeCanvas(this.W, this.H); this.x = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.acc = 1; this.power = 0;
  }
  tick(s, dt) {
    this.acc += dt; if (this.acc < 0.2) return; this.acc = 0;
    const x = this.x, W = this.W, H = this.H, st = s.stats;
    x.fillStyle = '#060303'; x.fillRect(0, 0, W, H);
    const on = this.power ? '#ff9d2a' : '#120804', off = '#1c0d06', h = H * 0.62;
    const vals = { avail: pad(st.c.AVAIL), active: pad(st.active), alarm: String(st.alarm), clock: clockStr(), resp: mmss(st.avg), ons: pad(st.c.ONSCN), wind: pad(s.wind.spd) };
    for (const g of GLARE_GROUPS) {
      const str = vals[g.key];
      let w = 0; for (const ch of str) w += ch === ':' ? h * 0.2 : h * 0.7;
      const px = (g.x / this.wM + 0.5) * W - w / 2;
      const col = g.key === 'alarm' && st.alarm > 1 ? (this.power ? '#ff3a22' : on) : g.key === 'clock' ? (this.power ? '#3dfc9a' : on) : on;
      x.fillStyle = '#000'; x.fillRect(px - 12, H * 0.08, w + 18, H * 0.84);
      draw7(x, str, px, (H - h) / 2, h, col, off);
    }
    this.tex.needsUpdate = true;
  }
}

export function createScreens() {
  return { map: new MapScreen(), fleet: new FleetScreen(), people: new PeopleScreen(), equip: new EquipMFD(), therm: new ThermalMFD(), log: new LogScreen(), wx: new WxScreen() };
}
