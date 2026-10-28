import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { FONTS, makeCanvas, tex, rng, grimeCanvas, PanelPainter, draw7, mottle } from './textures.js';
import { Sim, createScreens, GlareStrip, GLARE_GROUPS, MFD_KEYS, CHANNELS, COL, clockStr } from './screens.js';
import { AudioEngine } from './audio.js';
import { buildProps } from './props.js';
import { buildBackdrop } from './backdrop.js';
import { DOFPass } from './dof.js';

const progressEl = document.getElementById('progress');
const setProgress = s => { progressEl.textContent = s; };
setProgress('LOADING TYPEFACES…');
await Promise.race([
  Promise.all(['600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '700 20px Rajdhani', '20px "Share Tech Mono"', '600 20px Caveat', '20px "Permanent Marker"'].map(f => document.fonts.load(f))).catch(() => {}),
  new Promise(r => setTimeout(r, 5000)),
]);
setProgress('BUILDING CONSOLE…');
await new Promise(r => setTimeout(r, 30));

const V3 = THREE.Vector3;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
let T = 0;

/* ================= RENDERER / SCENE ================= */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const DPR0 = Math.min(DPR, 1.5);
renderer.setPixelRatio(DPR0);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
let shadowAcc = 0, shadowDirty = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010203);
scene.fog = new THREE.FogExp2(0x05070b, 0.045);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.02, 40);

function buildEnv() {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.BackSide })));
  const add = (w, h, col, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); es.add(m);
  };
  add(2.6, 0.7, 0x6fb8e8, 1.6, [0, 1.3, -1.6], [0, 1.2, 0]);
  add(1.1, 0.6, 0x6fb8e8, 1.0, [-1.8, 1.3, -0.6], [0, 1.2, 0]);
  add(1.1, 0.6, 0x6fb8e8, 1.0, [1.8, 1.3, -0.6], [0, 1.2, 0]);
  add(0.3, 0.3, 0xffc68a, 7, [-1.1, 1.5, 0.3], [0, 0, 0]);
  add(3, 0.15, 0x9ab8ff, 0.7, [0, 2.8, 0.5], [0, 0, 0.5]);
  add(2.4, 1.0, 0x2a2238, 1.0, [0, 2.0, -3.6], [0, 1, 0]);
  add(0.6, 0.6, 0xff6a20, 0.9, [1.0, 1.9, -3.6], [0, 1, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  return pm.fromScene(es, 0.03).texture;
}
scene.environment = buildEnv();
scene.environmentIntensity = 0.12;

/* ================= MATERIALS ================= */
const grimeTex = tex(grimeCanvas(512, 512, { seed: 2 }), { srgb: false, wrap: true, rep: [2, 2] });
const grimeFine = tex(grimeCanvas(512, 512, { seed: 12, blot: 140, blotAmp: 0.22, scratches: 120 }), { srgb: false, wrap: true, rep: [3, 1] });
const brushedTex = tex(grimeCanvas(512, 512, { brushed: true, seed: 9, base: 120, blot: 20 }), { srgb: false, wrap: true });
const leatherC = (() => { const c = makeCanvas(512, 512), x = c.getContext('2d'), r = rng(5); x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 9000; i++) { const v = 90 + r() * 80 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.arc(r() * 512, r() * 512, 1 + r() * 2.5, 0, 7); x.fill(); } return c; })();
const leatherTex = tex(leatherC, { srgb: false, wrap: true, rep: [12, 1] });

const M = {
  desk: new THREE.MeshPhysicalMaterial({ color: 0x121417, roughness: 0.42, roughnessMap: grimeFine, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  body: new THREE.MeshStandardMaterial({ color: 0x181716, roughness: 0.68, roughnessMap: grimeTex, metalness: 0.4 }),
  bezel: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.48, roughnessMap: grimeTex, metalness: 0.15 }),
  black: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.55 }),
  gloss: new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.12 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xa4a9ae, metalness: 1, roughness: 0.32, roughnessMap: brushedTex }),
  satin: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.38, roughnessMap: brushedTex }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.92 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.62, bumpMap: leatherTex, bumpScale: 1.2 }),
  knob: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.42, metalness: 0.2, flatShading: true }),
  key: new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.5, metalness: 0.1 }),
  capBody: new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.4 }),
  pointer: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 1.2 }),
  guard: new THREE.MeshPhysicalMaterial({ color: 0xd0140c, roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.72 }),
  redBall: new THREE.MeshPhysicalMaterial({ color: 0xc8100a, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 }),
  edge: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.9, roughness: 0.32 }),
  backlight: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  tmold: new THREE.MeshStandardMaterial({ color: 0x300404, emissive: 0xff2410, emissiveIntensity: 1.3, roughness: 0.4 }),
};
const panelMats = [];

/* ================= SIM / SCREENS / AUDIO ================= */
const sim = new Sim();
const screens = createScreens();
const glare = new GlareStrip(0.86, 0.032);
const audio = new AudioEngine();
let started = false;

/* ================= INTERACTION REGISTRY ================= */
const hitList = [], controls = [];
function reg(ctrl, ...meshes) { for (const m of meshes) { m.userData.ctrl = ctrl; hitList.push(m); } controls.push(ctrl); return ctrl; }

/* ================= FACTORIES ================= */
const panels = [];
function makePanel(w, h, paint, { thick = 0.02, base, screws = true, seed = 5, rough = 1.0, metal = 0.5, wear = 1, bump = 0.6, trim = true } = {}) {
  const p = new PanelPainter(w, h, { base, screws, seed, wear }); paint(p); p.finish(wear);
  const { map, emissiveMap, bumpMap, roughnessMap } = p.textures();
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: rough, roughnessMap, bumpMap, bumpScale: bump, metalness: metal });
  panelMats.push(mat);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), [M.body, M.body, M.body, M.body, mat, M.body]);
  mesh.position.z = -thick / 2; mesh.receiveShadow = true; mesh.castShadow = true; g.add(mesh);
  // rounded satin edge trim catches light like a real machined bevel
  if (trim) {
    const e = 0.0028;
    [[w, 0, h / 2, 0], [w, 0, -h / 2, 0], [h, -w / 2, 0, 1], [h, w / 2, 0, 1]].forEach(([len, x, y, vert]) => {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(e, len - e * 2, 4, 10), M.edge); t.position.set(x, y, -e * 0.6); if (!vert) t.rotation.z = Math.PI / 2; g.add(t);
    });
  }
  g.userData.painter = p; g.userData.map = map; g.userData.isPanel = true; panels.push(g);
  return g;
}

function capTextures(label, sub, color, full, aspect) {
  const W = 192, H = Math.round(192 / aspect);
  const mk = on => {
    const c = makeCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const lines = label ? label.split('\n') : [];
    const fs = Math.min(H * (sub ? 0.3 : lines.length > 1 ? 0.33 : 0.4), 46);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${fs}px ${FONTS.label}`;
    if (on && full) { x.shadowColor = color; x.shadowBlur = 10; }
    x.fillStyle = full ? (on ? color : '#4a4a4a') : (on ? '#e2e2e2' : '#9a9a9a');
    const cy = sub ? H * 0.34 : H * 0.5;
    lines.forEach((l, i) => x.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * fs * 1.02));
    if (sub) { x.shadowColor = color; x.shadowBlur = on ? 14 : 0; x.fillStyle = on ? color : '#262626'; x.font = `700 ${H * 0.27}px ${FONTS.label}`; x.fillText(sub, W / 2, H * 0.76); }
    if (!label && !sub) { x.fillStyle = on ? color : '#3a3a3a'; x.fillRect(W * 0.2, H * 0.4, W * 0.6, H * 0.2); }
    return tex(c);
  };
  return [mk(false), mk(true)];
}

function litButton({ label = '', sub = null, color = '#ffb02e', w = 0.03, h = 0.022, full = false, tip, onPress, onRelease, toggle = false, on = false }) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new RoundedBoxGeometry(w + 0.007, h + 0.007, 0.006, 2, 0.0018), M.black); housing.position.z = 0.003; g.add(housing);
  const capG = new THREE.Group(); g.add(capG);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.008, 2, 0.0016), M.capBody); cap.position.z = 0.0065; cap.castShadow = true; capG.add(cap);
  const [tOff, tOn] = capTextures(label, sub, color, full, w / h);
  const lmat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0xffffff, emissiveMap: tOff, emissiveIntensity: 1.8 });
  const leg = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.93, h * 0.9), lmat); leg.position.z = 0.0106; capG.add(leg);
  const ctrl = {
    group: g, on, tip, pressed: false, pv: 0, lit: on, power: 1,
    set(v) { this.on = v; },
    show(v) { if (v !== this.lit) { this.lit = v; lmat.emissiveMap = v ? tOn : tOff; } },
    onDown() { this.pressed = true; audio.click('button'); if (toggle) this.set(!this.on); onPress && onPress(this); },
    onUp() { this.pressed = false; onRelease && onRelease(this); },
    update(dt) {
      this.pv += ((this.pressed ? 1 : 0) - this.pv) * Math.min(1, dt * 30); capG.position.z = -0.0022 * this.pv;
      this.show(this.on || lampTestActive());
      lmat.emissiveIntensity = 1.8 * this.power * (0.25 + 0.75 * bootPanel);
    },
  };
  reg(ctrl, cap, leg, housing);
  return ctrl;
}

function annTile({ label, color, w = 0.058, h = 0.032, fn }) {
  const g = new THREE.Group();
  const [tOff, tOn] = capTextures(label, null, color, true, w / h);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x060606, roughness: 0.25, clearcoat: 1, emissive: 0xffffff, emissiveMap: tOff, emissiveIntensity: 2.2 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.004, 2, 0.0012), M.capBody); m.position.z = 0.002; g.add(m);
  const leg = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), mat); leg.position.z = 0.0041; g.add(leg);
  let lit = false;
  const ctrl = {
    group: g, tip: { t: 'ANNUNCIATOR', d: label.replace('\n', ' ') },
    update() {
      const s = fn(); const v = lampTestActive() || s === true || (s === 'blink' && Math.floor(T * 3) % 2 === 0);
      if (v !== lit) { lit = v; mat.emissiveMap = v ? tOn : tOff; }
      mat.emissiveIntensity = 2.2 * (0.3 + 0.7 * bootPanel);
    },
  };
  reg(ctrl, leg);
  return ctrl;
}

function toggleSwitch({ tip, on = false, onChange, guard = false }) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.0012, 32), M.steel); plate.rotation.x = Math.PI / 2; plate.position.z = 0.0006; g.add(plate);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.004, 6), M.steel); nut.rotation.x = Math.PI / 2; nut.position.z = 0.003; g.add(nut);
  if (!guard) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0006, 6, 40), M.backlight); halo.position.z = 0.0007; g.add(halo); }
  const piv = new THREE.Group(); piv.position.z = 0.005; g.add(piv);
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0027, 0.021, 16), M.chrome); bat.rotation.x = Math.PI / 2; bat.position.z = 0.0105; bat.castShadow = true; piv.add(bat);
  const tipM = new THREE.Mesh(new THREE.SphereGeometry(0.0029, 16, 12), M.chrome); tipM.position.z = 0.021; tipM.castShadow = true; piv.add(tipM);
  let hinge = null, cover = null;
  if (guard) {
    hinge = new THREE.Group(); hinge.position.set(0, 0.018, 0.001); g.add(hinge);
    cover = new THREE.Mesh(new RoundedBoxGeometry(0.027, 0.036, 0.028, 2, 0.003), M.guard); cover.position.set(0, -0.018, 0.014); hinge.add(cover);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.032, 12), M.steel); hb.rotation.z = Math.PI / 2; hinge.add(hb);
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.044, 0.002, 2, 0.002), M.gloss); base.position.set(0, 0, 0.001); g.add(base);
  }
  const ctrl = {
    group: g, on, tip, ang: on ? -0.5 : 0.5, gopen: 0, guardOpen: false, lastT: 0,
    set(v, silent) { if (v === this.on) return; this.on = v; if (!silent) onChange && onChange(v); },
    onDown() {
      this.lastT = T;
      if (guard && !this.guardOpen) { this.guardOpen = true; audio.click('guard'); return; }
      this.on = !this.on; audio.click('toggle'); onChange && onChange(this.on);
    },
    update(dt) {
      const tgt = this.on ? -0.5 : 0.5; this.ang += (tgt - this.ang) * Math.min(1, dt * 35); piv.rotation.x = this.ang;
      if (guard) {
        if (this.guardOpen && !this.on && T - this.lastT > 5) { this.guardOpen = false; audio.click('guard'); }
        const gt = this.guardOpen ? -1.95 : 0; this.gopen += (gt - this.gopen) * Math.min(1, dt * 12); hinge.rotation.x = this.gopen;
      }
    },
  };
  reg(ctrl, plate, nut, bat, tipM, ...(cover ? [cover] : []));
  return ctrl;
}

function knob({ r = 0.013, tip, value = 0.5, min = 0, max = 1, sweep = 270, onChange, step = 0, big = false }) {
  const g = new THREE.Group();
  const spin = new THREE.Group(); spin.rotation.x = Math.PI / 2; g.add(spin);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.32, r * 1.4, 0.004, 48), M.gloss); skirt.position.y = 0.002; spin.add(skirt);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, big ? 0.02 : 0.016, 30), M.knob); grip.position.y = 0.004 + (big ? 0.01 : 0.008); grip.castShadow = true; spin.add(grip);
  const top = (big ? 0.024 : 0.02) + 0.0005;
  const capk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.88, 0.002, 30), M.gloss); capk.position.y = top - 0.001; spin.add(capk);
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0008, r * 0.7), M.pointer); ptr.position.set(0, top + 0.0002, -r * 0.42); spin.add(ptr);
  const sk = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.0006, r * 0.3), M.pointer); sk.position.set(0, 0.0042, -r * 1.2); spin.add(sk);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.48, 0.0007, 6, 48), M.backlight); halo.position.z = 0.0008; g.add(halo);
  const ctrl = {
    group: g, tip, value, ang: 0, last: value,
    setValue(v, emit = true) {
      v = clamp(v, min, max); if (step) v = Math.round(v / step) * step;
      if (v !== this.value) { if (Math.abs(v - this.last) >= (step || (max - min) * 0.03)) { audio.click('knob'); this.last = v; } this.value = v; if (emit) onChange && onChange(v); }
    },
    raw: value,
    onDown() { this.raw = this.value; },
    onDrag(dx, dy) { this.raw = clamp(this.raw + (dx - dy) * (max - min) / 260, min, max); this.setValue(this.raw); },
    onWheel(d) { this.raw = clamp(this.value + (step || (max - min) / 30) * (d > 0 ? -1 : 1), min, max); this.setValue(this.raw); },
    update(dt) {
      const tgt = -((this.value - min) / (max - min) - 0.5) * sweep * DEG;
      this.ang += (tgt - this.ang) * Math.min(1, dt * 18); spin.rotation.y = this.ang;
    },
  };
  reg(ctrl, skirt, grip, capk);
  return ctrl;
}

function gauge({ r = 0.048, label, unit, min = 0, max = 100, majors = 8, bands = [], fn, fmt = v => Math.round(v) }) {
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d'), R = S * 0.48;
  const bg = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, R); bg.addColorStop(0, '#1d1d1c'); bg.addColorStop(1, '#0c0c0c');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S); x.fillStyle = bg; x.beginPath(); x.arc(S / 2, S / 2, R, 0, 7); x.fill();
  const A = a => (135 + a * 270) * DEG;
  for (const [a0, a1, col] of bands) { x.strokeStyle = col; x.lineWidth = 22; x.beginPath(); x.arc(S / 2, S / 2, R * 0.84, A((a0 - min) / (max - min)), A((a1 - min) / (max - min))); x.stroke(); }
  const n = majors * 5;
  for (let k = 0; k <= n; k++) {
    const a = A(k / n), maj = k % 5 === 0, l0 = R * (maj ? 0.74 : 0.82), l1 = R * 0.93;
    x.strokeStyle = '#f4f1ea'; x.lineWidth = maj ? 11 : 5;
    x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * l0, S / 2 + Math.sin(a) * l0); x.lineTo(S / 2 + Math.cos(a) * l1, S / 2 + Math.sin(a) * l1); x.stroke();
    if (maj) { x.fillStyle = '#ebe7dd'; x.font = `600 54px ${FONTS.label}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(fmt(min + (max - min) * k / n), S / 2 + Math.cos(a) * R * 0.56, S / 2 + Math.sin(a) * R * 0.56); }
  }
  { const rim = x.createRadialGradient(S / 2, S / 2, R * 0.7, S / 2, S / 2, R); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.75)'); x.fillStyle = rim; x.beginPath(); x.arc(S / 2, S / 2, R, 0, 7); x.fill();
    const rr = rng(label.length * 31); for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(220,215,200,${0.05 + rr() * 0.15})`; x.fillRect(rr() * S, rr() * S, 1.5, 1.5); } }
  x.fillStyle = '#e8e4da'; x.font = `600 40px ${FONTS.label}`; x.textAlign = 'center'; x.fillText(label, S / 2, S * 0.815);
  x.fillStyle = '#b5ae9f'; x.font = `600 28px ${FONTS.label}`; x.fillText(unit, S / 2, S * 0.875);
  const ft = tex(c);
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.008, r + 0.0095, 0.012, 64), M.gloss); back.rotation.x = Math.PI / 2; back.position.z = 0.006; g.add(back);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(r + 0.0048, 0.0036, 16, 72), M.satin); bezel.position.z = 0.0135; g.add(bezel);
  const faceMat = new THREE.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: 0xffe2bd, emissiveIntensity: 0.05, roughness: 0.7 });
  faceMat.userData.boost = 0.75; panelMats.push(faceMat);
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 64), faceMat); face.position.z = 0.0124; g.add(face);
  const nl = r * 0.9;
  const ng = new THREE.BoxGeometry(0.0022, nl, 0.0008); ng.translate(0, nl / 2 - r * 0.16, 0);
  const needle = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff9a5a, emissiveIntensity: 1.2 })); needle.position.z = 0.0133; needle.castShadow = true; g.add(needle);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 24), M.gloss); hub.rotation.x = Math.PI / 2; hub.position.z = 0.0142; g.add(hub);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r + 0.003, 64), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2.2 }));
  glass.position.z = 0.0162; g.add(glass);
  const ctrl = {
    group: g, tip: { t: 'GAUGE', d: `${label} ${unit}` }, disp: min, vel: 0, needle, cur: min,
    update(dt) {
      const target = started ? clamp(fn(), min, max) : min;
      const acc = (target - this.disp) * 60 - this.vel * 11; this.vel += acc * dt; this.disp += this.vel * dt;
      const a = clamp((this.disp - min) / (max - min), -0.02, 1.02);
      needle.rotation.z = -(135 + a * 270) * DEG - 90 * DEG;
      this.tip.d = `${label} ${unit} · ${fmt(target)}`;
    },
  };
  reg(ctrl, glass);
  return ctrl;
}

function arcadeButton({ color, tip, onPress, s = 1, sound = 'arcade' }) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0238 * s, 0.025 * s, 0.005, 48), M.gloss); ring.rotation.x = Math.PI / 2; ring.position.z = 0.0025; g.add(ring);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.0186 * s, 0.0012, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6) })); glowRing.position.z = 0.0052; g.add(glowRing);
  const prof = [[0.0178, 0], [0.0178, 0.009], [0.0172, 0.0106], [0.014, 0.0117], [0.008, 0.0123], [0.0001, 0.0125]].map(([a, b]) => new THREE.Vector2(a * s, b));
  const capMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, emissive: color, emissiveIntensity: 0.25 });
  const capG = new THREE.Group(); capG.position.z = 0.0035; g.add(capG);
  const cap = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), capMat); cap.rotation.x = Math.PI / 2; cap.castShadow = true; capG.add(cap);
  const baseCol = new THREE.Color(color);
  const ctrl = {
    group: g, tip, pressed: false, pv: 0, flash: 0,
    onDown() { this.pressed = true; this.flash = 1; audio.click(sound); onPress && onPress(); },
    onUp() { this.pressed = false; },
    update(dt) {
      this.pv += ((this.pressed ? 1 : 0) - this.pv) * Math.min(1, dt * 35); capG.position.z = 0.0035 - 0.004 * this.pv;
      this.flash = Math.max(0, this.flash - dt * 2.5);
      const idle = 0.34 + 0.1 * Math.sin(T * 2 + g.position.x * 40);
      capMat.emissiveIntensity = (idle + this.flash * 4 + this.pv * 2) * bootPanel;
      glowRing.material.color.copy(baseCol).multiplyScalar((0.4 + this.flash * 4 + this.pv * 3) * bootPanel);
    },
  };
  reg(ctrl, cap, ring);
  return ctrl;
}

function joystick({ tip }) {
  const g = new THREE.Group();
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.0015, 48), M.gloss); washer.rotation.x = Math.PI / 2; washer.position.z = 0.00075; g.add(washer);
  const piv = new THREE.Group(); g.add(piv);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.012, 0.012, 32), M.rubber); boot.rotation.x = Math.PI / 2; boot.position.z = 0.0065; piv.add(boot);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.055, 16), M.chrome); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.03; shaft.castShadow = true; piv.add(shaft);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0178, 48, 32), M.redBall); ball.position.z = 0.064; ball.castShadow = true; piv.add(ball);
  const ctrl = {
    group: g, tip, x: 0, y: 0, active: false,
    onDown() { this.active = true; audio.click('soft'); },
    onDrag(dx, dy) { this.x = clamp(this.x + dx * 0.012, -1, 1); this.y = clamp(this.y + dy * 0.012, -1, 1); },
    onUp() { this.active = false; audio.click('soft'); },
    update(dt) {
      if (!this.active) { this.x *= Math.exp(-dt * 14); this.y *= Math.exp(-dt * 14); }
      piv.rotation.y = this.x * 0.38; piv.rotation.x = this.y * 0.38;
      sim.aim.x = clamp(sim.aim.x + this.x * dt * 0.45); sim.aim.y = clamp(sim.aim.y + this.y * dt * 0.45);
    },
  };
  reg(ctrl, ball, shaft, boot);
  return ctrl;
}

function marbleTex() {
  const c = makeCanvas(512, 256), x = c.getContext('2d'), r = rng(3);
  const g = x.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, '#0d3550'); g.addColorStop(0.5, '#1b6a8f'); g.addColorStop(1, '#0a2a40');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(${150 + r() * 100},${220 + r() * 35},255,${0.06 + r() * 0.14})`; x.lineWidth = 1 + r() * 5; x.beginPath(); let px = r() * 512, py = r() * 256; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 120; py += (r() - 0.5) * 60; x.quadraticCurveTo(px + 30, py - 20, px, py); } x.stroke(); }
  return tex(c);
}
function trackball({ tip }) {
  const g = new THREE.Group();
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0405, 0.0055, 16, 64), M.gloss); bezel.position.z = 0.002; g.add(bezel);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 2.2) });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.0365, 0.0016, 8, 64), glowMat); glowRing.position.z = 0.0012; g.add(glowRing);
  const ballMat = new THREE.MeshPhysicalMaterial({ map: marbleTex(), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x1a7fb0, emissiveIntensity: 0.3 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 64, 48), ballMat); ball.position.z = -0.011; g.add(ball);
  const q = new THREE.Quaternion(), ax = new V3(), ay = new V3(1, 0, 0);
  const ctrl = {
    group: g, tip, spin: 0,
    onDown() { audio.click('soft'); },
    onDrag(dx, dy) {
      q.setFromAxisAngle(ax.set(0, 1, 0), dx * 0.03); ball.quaternion.premultiply(q);
      q.setFromAxisAngle(ay, dy * 0.03); ball.quaternion.premultiply(q);
      sim.panBy(dx * 2.2, dy * 2.2); this.spin = 1;
    },
    update(dt) { this.spin = Math.max(0, this.spin - dt * 2); glowMat.color.setRGB(0.2, 1.4 + this.spin * 2, 2.2 + this.spin * 2).multiplyScalar(bootPanel); ballMat.emissiveIntensity = (0.25 + this.spin * 0.6) * bootPanel; },
  };
  reg(ctrl, ball, bezel);
  return ctrl;
}

function throttleLever({ tip, k, color }) {
  const g = new THREE.Group();
  const piv = new THREE.Group(); g.add(piv);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.012, 0.11, 2, 0.002), M.steel); arm.position.z = 0.045; arm.castShadow = true; piv.add(arm);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.044, 32), M.gloss); handle.rotation.z = Math.PI / 2; handle.position.z = 0.102; handle.castShadow = true; piv.add(handle);
  const capMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, emissive: color, emissiveIntensity: 0.15 });
  [-1, 1].forEach(s => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.006, 32), capMat); c.rotation.z = Math.PI / 2; c.position.set(s * 0.024, 0, 0.102); piv.add(c); });
  const ctrl = {
    group: g, tip, ang: 0,
    onDown() { audio.click('soft'); },
    onDrag(dx, dy) { const old = sim.throttle[k]; sim.throttle[k] = clamp(sim.throttle[k] - dy * 0.0045); if (Math.floor(old * 20) !== Math.floor(sim.throttle[k] * 20)) audio.click('knob'); },
    update(dt) { const tgt = 0.55 - sim.throttle[k] * 1.1; this.ang += (tgt - this.ang) * Math.min(1, dt * 20); piv.rotation.x = this.ang; capMat.emissiveIntensity = 0.35 * bootPanel; },
  };
  reg(ctrl, arm, handle);
  return ctrl;
}

function screenMat(screen, k = 1.25) {
  const m = new THREE.MeshStandardMaterial({ color: 0x030405, emissive: 0xffffff, emissiveMap: screen.tex, emissiveIntensity: k, roughness: 0.22, metalness: 0, envMapIntensity: 0.12 });
  screen.mat = m; screen.k = k;
  return m;
}

// faint glass sheen + smudges over displays (additive, very low intensity)
const sheenTex = (() => {
  const W = 1024, H = 640, c = makeCanvas(W, H), x = c.getContext('2d'), r = rng(64);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.35, 'rgba(255,255,255,0.02)'); g.addColorStop(0.6, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { const px = r() * W, py = r() * H, rad = 20 + r() * 80; const sg = x.createRadialGradient(px, py, 0, px, py, rad); sg.addColorStop(0, `rgba(255,255,255,${0.03 + r() * 0.05})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 5; i++) { x.save(); x.translate(r() * W, r() * H); x.rotate(r() * 3); x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1; for (let k = 3; k < 22; k += 2.5) { x.beginPath(); x.ellipse(0, 0, k, k * 1.4, 0, 0, 7); x.stroke(); } x.restore(); }
  return tex(c);
})();
const sheenMat = new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
function addSheen(parent, w, h, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sheenMat); m.position.z = z; parent.add(m); return m; }

function monitor(screen, wS, hS, { ralColor = 0x8fd0ff, ralK = 5, label = '' } = {}) {
  const g = new THREE.Group(), b = 0.021, d = 0.045;
  const body = new THREE.Mesh(new RoundedBoxGeometry(wS + b * 2, hS + b * 2, d, 3, 0.009), M.bezel); body.position.z = -d / 2 + 0.004; body.castShadow = true; g.add(body);
  const back = new THREE.Mesh(new RoundedBoxGeometry(wS * 0.65, hS * 0.55, 0.05, 3, 0.02), M.bezel); back.position.z = -d - 0.015; g.add(back);
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(wS, hS), screenMat(screen)); sp.position.z = 0.0046; g.add(sp);
  addSheen(g, wS, hS, 0.0052);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3) })); led.position.set(wS / 2 + b - 0.012, -hS / 2 - b * 0.55, 0.0047); g.add(led);
  if (label) {
    const c = makeCanvas(256, 32), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#6a6e74'; x.font = `600 20px ${FONTS.label}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 128, 17);
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.01), new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, opacity: 0.9, roughness: 0.6 })); lm.position.set(0, -hS / 2 - b * 0.5, 0.0047); g.add(lm);
  }
  const L = new THREE.RectAreaLight(ralColor, 0, wS, hS); L.position.z = 0.02; L.rotation.y = Math.PI; g.add(L);
  screen.ral = L; screen.ralK = ralK; screen.mesh = sp; screen.size = [wS, hS];
  return g;
}

function mfd(screen, keys, onKey) {
  const g = new THREE.Group();
  const bez = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.27, 0.016, 3, 0.007), M.bezel); bez.position.z = 0.008; bez.castShadow = true; g.add(bez);
  const lip = new THREE.Mesh(new THREE.PlaneGeometry(0.214, 0.214), new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.6 })); lip.position.z = 0.0161; g.add(lip);
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.205), screenMat(screen, 1.3)); sp.position.z = 0.0163; g.add(sp);
  addSheen(g, 0.205, 0.205, 0.0168);
  const sc = 0.205;
  [-1, 1].forEach(side => [0, 1, 2, 3].forEach(i => {
    const y = sc / 2 - (0.2 + i * 0.2) * sc;
    const key = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.016, 0.008, 2, 0.002), M.key); key.position.set(side * 0.128, y, 0.018); key.castShadow = true; g.add(key);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.0012), M.pointer); line.position.set(side * 0.128, y, 0.0221); g.add(line);
    const ctrl = {
      group: key, pv: 0, pressed: false, tip: { t: side < 0 ? 'SOFT KEY L' + (i + 1) : 'SOFT KEY R' + (i + 1), d: keys[side < 0 ? 'L' : 'R'][i] },
      onDown() { this.pressed = true; audio.click('soft'); onKey(side, i); }, onUp() { this.pressed = false; },
      update(dt) { this.pv += ((this.pressed ? 1 : 0) - this.pv) * Math.min(1, dt * 30); key.position.z = 0.018 - this.pv * 0.002; line.position.z = key.position.z + 0.0041; },
    };
    reg(ctrl, key);
  }));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0033, 0.0033, 0.002, 16), M.steel); s.rotation.x = Math.PI / 2; s.position.set(a * 0.138, b * 0.123, 0.0165); g.add(s); });
  // rocker brightness
  screen.mesh = sp; screen.size = [0.205, 0.205];
  return g;
}

function sevenSegPlane(w, h, W = 1024) {
  const H = Math.round(W * h / w), c = makeCanvas(W, H), x = c.getContext('2d'), t = tex(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.6) }));
  return { mesh, c, x, t, W, H };
}

/* ================= CONSOLE ================= */
const DESK = 0.74;
const SLOPE = 35 * DEG;
const slopeDir = new V3(0, Math.sin(SLOPE), -Math.cos(SLOPE));
const PH = 0.38;
function placeSloped(group, x, w) {
  const c = new V3(x, DESK, -0.2).addScaledVector(slopeDir, PH / 2);
  group.position.copy(c); group.rotation.x = -(90 * DEG - SLOPE);
  scene.add(group);
}

// desk surface texture: worn dark laminate, scuffs, coffee ring, hand-polish near the front edge
function deskMaps() {
  const W = 3072, H = 576, r = rng(808);  // maps 3.12 x 0.58 m top
  const c = makeCanvas(W, H), x = c.getContext('2d'), g = makeCanvas(W, H), gx = g.getContext('2d');
  x.fillStyle = '#0e0e0f'; x.fillRect(0, 0, W, H);
  mottle(x, W, H, 40, 0.12, r, 'overlay'); mottle(x, W, H, 160, 0.06, r, 'soft-light');
  gx.fillStyle = 'rgb(120,120,120)'; gx.fillRect(0, 0, W, H); mottle(gx, W, H, 30, 0.3, r, 'overlay');
  // hand polish band where forearms rest (front = bottom of texture)
  const hp = gx.createLinearGradient(0, H * 0.55, 0, H); hp.addColorStop(0, 'rgba(0,0,0,0)'); hp.addColorStop(1, 'rgba(0,0,0,0.35)'); gx.fillStyle = hp; gx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const px = r() * W, py = r() * H, a = (r() - 0.5) * 0.8, l = 6 + r() * 60, al = 0.02 + r() * 0.07;
    x.strokeStyle = `rgba(200,200,200,${al})`; x.lineWidth = 0.7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    gx.strokeStyle = `rgba(20,20,20,${al * 3})`; gx.lineWidth = 1; gx.stroke();
  }
  for (let i = 0; i < 4000; i++) { const px = r() * W, py = r() * H; x.fillStyle = `rgba(190,185,175,${0.04 + r() * 0.1})`; x.fillRect(px, py, 1.2, 1.2); gx.fillStyle = 'rgba(255,255,255,0.4)'; gx.fillRect(px, py, 2, 2); }
  const uv = (wx, wz) => [(wx + 1.56) / 3.12 * W, (wz + 0.22) / 0.58 * H];
  // coffee rings next to the mug
  for (const [wx, wz, rr] of [[-0.6, 0.06, 0.04], [-0.75, 0.18, 0.041]]) { const [px, py] = uv(wx, wz); x.strokeStyle = 'rgba(90,55,25,0.22)'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, rr / 3.12 * W, 0.3, 5.9); x.stroke(); }
  // pen / marker marks
  x.strokeStyle = 'rgba(30,40,110,0.25)'; x.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const [px, py] = uv(-0.3 + r() * 1.0, 0.15 + r() * 0.12); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 20, py - 8, px + 30 + r() * 40, py + r() * 10); x.stroke(); }
  return { map: tex(c), roughnessMap: tex(g, { srgb: false }) };
}
const DM = deskMaps();
M.desk.map = DM.map; M.desk.roughnessMap = DM.roughnessMap; M.desk.roughness = 0.9; M.desk.color.set(0xffffff); M.desk.clearcoat = 0.08; M.desk.clearcoatRoughness = 0.6; M.desk.envMapIntensity = 0.5; M.desk.needsUpdate = true;

// desk slab + armrest
const deskSlab = new THREE.Mesh(new RoundedBoxGeometry(3.12, 0.045, 0.58, 3, 0.008), M.desk); deskSlab.position.set(0, DESK - 0.0225, 0.07); deskSlab.receiveShadow = true; deskSlab.castShadow = true; scene.add(deskSlab);
const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 3.0, 8, 24), M.leather); arm.rotation.z = Math.PI / 2; arm.position.set(0, DESK - 0.008, 0.37); arm.receiveShadow = true; scene.add(arm);
const modesty = new THREE.Mesh(new THREE.BoxGeometry(3.1, DESK - 0.05, 0.03), M.body); modesty.position.set(0, (DESK - 0.05) / 2, 0.25); scene.add(modesty);
// console body wedge under the sloped panels + shelf
{
  const sh = new THREE.Shape();
  sh.moveTo(-0.215, 0); sh.lineTo(-0.215, DESK - 0.01); sh.lineTo(-0.52, 0.948); sh.lineTo(-1.05, 0.948); sh.lineTo(-1.05, 0); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 3.1, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); geo.translate(1.55, 0, 0);
  const body = new THREE.Mesh(geo, M.body); scene.add(body);
  body.receiveShadow = true;
  const shelf = new THREE.Mesh(new RoundedBoxGeometry(3.14, 0.022, 0.55, 3, 0.006), M.desk); shelf.position.set(0, 0.96, -0.775); shelf.receiveShadow = true; shelf.castShadow = true; scene.add(shelf);
  const coaming = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 3.06, 6, 20), M.leather); coaming.rotation.z = Math.PI / 2; coaming.position.set(0, 0.962, -0.512); coaming.castShadow = true; scene.add(coaming);
  // under-desk accent strip
  const strip = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.08) })); strip.position.set(0, DESK - 0.05, 0.33); scene.add(strip);
}

/* ---------- MAIN PANEL ---------- */
const TOGS = [
  { label: 'CAD LINK', on: true, f: v => { sim.cadLink = v; sim.addLog(v ? 'CAD LINK RESTORED' : 'CAD LINK FAULT — MANUAL MODE', v ? COL.green : COL.red); } },
  { label: 'AUTO DISP', on: true, f: v => { sim.autoDispatch = v; } },
  { label: 'NIGHT MODE', on: true, f: v => { roomLights(!v); } },
  { label: 'BEACON TEST', on: false, f: v => { props.beaconTest = v; } },
  { label: 'SIREN TEST', on: false, f: v => { if (v) audio.siren(3.5); } },
];
const ANN = [
  ['STRUCT\nFIRE', '#ff3b28', () => live().some(i => i.code === 'STR')],
  ['BRUSH\nFIRE', '#ff3b28', () => live().some(i => i.code === 'BRU')],
  ['HAZMAT', '#ffb02e', () => live().some(i => i.code === 'HAZ')],
  ['MED\nEMERG', '#ffb02e', () => live().some(i => i.code === 'MED' || i.code === 'MVA')],
  ['LOW\nAIR', '#ffb02e', () => sim.people.some(p => p.scba && p.air < 30 && sim.unitById[p.unit].status === 'ONSCN')],
  ['PASS\nALARM', '#ff3b28', () => sim.passAlarm ? 'blink' : false],
  ['MUTUAL\nAID', '#3dfc9a', () => sim.mutualAid],
  ['UNIT\nOOS', '#ffb02e', () => sim.units.some(u => u.status === 'OOS')],
  ['CAD\nLINK', '#ffb02e', () => !sim.cadLink ? 'blink' : false],
  ['HIGH\nWIND', '#ffb02e', () => sim.wind.gust > 21],
  ['EVAC\nTONE', '#ff3b28', () => sim.evac ? 'blink' : false],
  ['GEN\nRUN', '#3dfc9a', () => sim.genTest || sim.emerPwr],
];
const live = () => sim.incidents.filter(i => i.status !== 'CLOSED');
const GL = [
  { x: -0.39, y: 0.072, label: 'PUMP 1', unit: 'PSI', min: 0, max: 400, bands: [[100, 250, '#2bb36a'], [250, 330, '#d9a21b'], [330, 400, '#c8281c']], fn: () => sim.pumpPsi(0) },
  { x: -0.39, y: -0.072, label: 'PUMP 2', unit: 'PSI', min: 0, max: 400, bands: [[100, 250, '#2bb36a'], [250, 330, '#d9a21b'], [330, 400, '#c8281c']], fn: () => sim.pumpPsi(1) },
  { x: -0.262, y: 0.072, label: 'FOAM', unit: '% CONC', min: 0, max: 6, majors: 6, bands: [[0.5, 3, '#2bb36a']], fn: () => sim.throttle[2] * 6, fmt: v => Math.round(v) },
  { x: -0.262, y: -0.072, label: 'HYDRANT', unit: 'PSI', min: 0, max: 150, majors: 6, bands: [[0, 20, '#c8281c'], [40, 90, '#2bb36a']], fn: () => 58 + Math.sin(T * 0.7) * 3 - sim.units.filter(u => u.status === 'ONSCN' && u.type === 'ENGINE').length * 2.5 },
  { x: 0.262, y: 0.072, label: 'WIND', unit: 'MPH', min: 0, max: 60, majors: 6, bands: [[0, 15, '#2bb36a'], [15, 25, '#d9a21b'], [25, 60, '#c8281c']], fn: () => sim.wind.spd + Math.sin(T * 3.1) * 1.2 },
  { x: 0.262, y: -0.072, label: 'WATER', unit: 'FLEET %', min: 0, max: 100, majors: 5, bands: [[0, 25, '#c8281c'], [60, 100, '#2bb36a']], fn: () => { const e = sim.units.filter(u => u.water != null); return e.reduce((a, u) => a + u.water, 0) / e.length; } },
  { x: 0.39, y: 0.072, label: 'RF SIGNAL', unit: '% QUAL', min: 0, max: 100, majors: 5, bands: [[0, 30, '#c8281c'], [70, 100, '#2bb36a']], fn: () => 86 + Math.sin(T * 1.7) * 4 + (sim.chatter ? 6 : 0) },
  { x: 0.39, y: -0.072, label: 'BUS', unit: 'VAC', min: 0, max: 150, majors: 6, bands: [[110, 130, '#2bb36a']], fn: () => (sim.emerPwr ? 114 : 120) + Math.sin(T * 5) * 0.6 },
];
const mainPanel = makePanel(1.72, PH, p => {
  p.well(-0.63, 0.005, 0.312, 0.284, { r: 0.008 }); p.well(0.63, 0.005, 0.312, 0.284, { r: 0.008 });
  p.text('MFD 1 · LOGISTICS', -0.63, -0.163, { size: 0.0092 });
  p.text('MFD 2 · THERMAL IMAGING', 0.63, -0.163, { size: 0.0092 });
  p.group(-0.326, 0.0, 0.27, 0.315, 'PUMP / SUPPLY');
  p.group(0.326, 0.0, 0.27, 0.315, 'ENVIRONMENT / POWER');
  p.group(0, 0.083, 0.29, 0.135, 'MASTER ANNUNCIATOR');
  p.group(0, -0.083, 0.29, 0.13, 'SYSTEMS');
  TOGS.forEach((tg, i) => {
    const x = -0.116 + i * 0.058;
    p.text(tg.label, x, -0.058, { size: 0.0066 });
    p.text('ON', x, -0.072, { size: 0.0055, color: '#bdb8ad' }); p.text('OFF', x, -0.13, { size: 0.0055, color: '#bdb8ad' });
  });
  p.text('METRO FIRE · CENTRAL COMMAND · CONSOLE 01', 0, -0.172, { size: 0.0072, color: '#8a8e93', lit: false, spacing: 0.0008 });
  for (const gg of GL) p.ring(gg.x, gg.y, 0.0585, 0, { color: 'rgba(0,0,0,0.6)', w: 0.003 });
}, { thick: 0.025, seed: 11 });
placeSloped(mainPanel, 0, 1.72);

const mfd1 = mfd(screens.equip, MFD_KEYS.equip, (side, i) => {
  if (side < 0) sim.mfdPage = MFD_KEYS.equip.L[i];
  else if (i === 0) sim.pumpUnit = (sim.pumpUnit + 1) % 7;
  else if (i === 1) sim.pumpUnit = (sim.pumpUnit + 6) % 7;
  else if (i === 2) sim.mfdPage = 'EQUIP';
  else { lampTestUntil = T + 1.5; }
});
mfd1.position.set(-0.63, 0.005, 0); mainPanel.add(mfd1);
const mfd2 = mfd(screens.therm, MFD_KEYS.therm, (side, i) => {
  if (side < 0) sim.cam = i; else if (i < 3) sim.thermPal = i; else sim.rec = !sim.rec;
});
mfd2.position.set(0.63, 0.005, 0); mainPanel.add(mfd2);
for (const gg of GL) { const c = gauge({ ...gg, r: 0.05 }); c.group.position.set(gg.x, gg.y, 0); mainPanel.add(c.group); }
ANN.forEach(([label, color, fn], i) => {
  const c = annTile({ label, color, fn }); const col = i % 4, row = Math.floor(i / 4);
  c.group.position.set(-0.0945 + col * 0.063, 0.118 - row * 0.037, 0); mainPanel.add(c.group);
});
const togCtrls = TOGS.map((tg, i) => { const c = toggleSwitch({ tip: { t: 'TOGGLE', d: tg.label }, on: tg.on, onChange: tg.f }); c.group.position.set(-0.116 + i * 0.058, -0.1, 0); mainPanel.add(c.group); return c; });

/* ---------- LEFT SIDE PANEL: RADIO STACK ---------- */
const FREQ = ['154.430', '153.830', '154.265', '154.385', '155.205', '156.075'];
const comDisp = [];
const leftPanel = makePanel(0.66, PH, p => {
  p.group(0, 0.128, 0.6, 0.085, 'COM 1 · MONITOR');
  p.group(0, 0.026, 0.6, 0.085, 'COM 2 · TACTICAL');
  p.well(-0.075, 0.104, 0.33, 0.046); p.well(-0.075, 0.002, 0.33, 0.046);
  p.text('ACTIVE', -0.165, 0.137, { size: 0.0058 }); p.text('STANDBY', 0.0, 0.137, { size: 0.0058 });
  p.text('ACTIVE', -0.165, 0.035, { size: 0.0058 }); p.text('STANDBY', 0.0, 0.035, { size: 0.0058 });
  p.text('XFR', 0.145, 0.077, { size: 0.0062 }); p.text('XFR', 0.145, -0.025, { size: 0.0062 });
  p.text('CH SEL', 0.235, 0.077, { size: 0.0062 }); p.text('CH SEL', 0.235, -0.025, { size: 0.0062 });
  p.group(-0.13, -0.11, 0.34, 0.11, 'LIGHTING');
  ['INTEG LT', 'FLOOD', 'DISPLAYS'].forEach((l, i) => { p.text(l, -0.24 + i * 0.11, -0.142, { size: 0.0068 }); p.ticks(-0.24 + i * 0.11, -0.1, 0.022, 11, -225 * DEG, 45 * DEG); });
  p.text('OFF', -0.27, -0.128, { size: 0.0048, color: '#aaa49a' }); p.text('BRT', -0.21, -0.128, { size: 0.0048, color: '#aaa49a' });
  p.well(0.19, -0.1, 0.2, 0.11, { color: '#141518' }); p.grille(0.19, -0.1, 0.19, 0.1, 0.0045);
  p.text('SPEAKER', 0.19, -0.165, { size: 0.0062, lit: false, color: '#8a8e93' });
}, { thick: 0.025, seed: 21 });
placeSloped(leftPanel, -1.2, 0.66);
[0, 1].forEach(k => {
  const d = sevenSegPlane(0.32, 0.038, 1024); d.mesh.position.set(-0.075, 0.104 - k * 0.102, 0.0008); leftPanel.add(d.mesh); comDisp.push(d);
  const x = litButton({ label: '⇄', w: 0.026, h: 0.02, tip: { t: 'TRANSFER', d: `Swap COM ${k + 1} active / standby` }, onPress: () => { const c = sim.com[k]; [c.act, c.sby] = [c.sby, c.act]; if (k === 0) sim.radioCh = FREQ.indexOf(c.act); drawCom(); } });
  x.group.position.set(0.145, 0.104 - k * 0.102, 0); leftPanel.add(x.group);
  const kn = knob({ r: 0.014, big: true, min: 0, max: 5, step: 1, value: k === 0 ? 2 : 3, sweep: 300, tip: { t: 'CHANNEL SELECT', d: `COM ${k + 1} standby channel (drag / scroll)` }, onChange: v => { sim.com[k].sby = FREQ[v]; drawCom(); } });
  kn.group.position.set(0.235, 0.104 - k * 0.102, 0); leftPanel.add(kn.group);
});
function drawCom() {
  comDisp.forEach((d, k) => {
    const x = d.x, W = d.W, H = d.H, c = sim.com[k];
    x.fillStyle = '#050302'; x.fillRect(0, 0, W, H);
    const h = H * 0.6, on = bootPanel > 0.5 ? '#ffa02a' : '#140a04', off = '#1a0d05';
    draw7(x, c.act.replace('.', ''), 40, (H - h) / 2, h, on, off); x.fillStyle = on; x.beginPath(); x.arc(40 + h * 0.7 * 3 - 4, (H + h) / 2 - 4, 5, 0, 7); x.fill();
    draw7(x, c.sby.replace('.', ''), 560, (H - h) / 2, h, bootPanel > 0.5 ? '#d0761e' : '#140a04', off); x.fillStyle = bootPanel > 0.5 ? '#d0761e' : '#140a04'; x.beginPath(); x.arc(560 + h * 0.7 * 3 - 4, (H + h) / 2 - 4, 5, 0, 7); x.fill();
    x.fillStyle = bootPanel > 0.5 ? '#3dfc9a' : '#031208'; x.font = `28px ${FONTS.mono}`; x.textBaseline = 'middle'; x.fillText(CHANNELS[FREQ.indexOf(c.act)] || '', 400, H / 2);
    d.t.needsUpdate = true;
  });
}
let panelDim = 1.0, floodK = 0.04, screenK = 1.0, lightLevel = 1.0;
const lk = [
  knob({ tip: { t: 'INTEG LT', d: 'Panel backlighting' }, value: 1.0, min: 0.1, max: 1.8, onChange: v => panelDim = v }),
  knob({ tip: { t: 'FLOOD', d: 'Overhead flood light' }, value: 0.04, min: 0, max: 1.5, onChange: v => floodK = v }),
  knob({ tip: { t: 'DISPLAYS', d: 'Screen brightness' }, value: 1.0, min: 0.3, max: 1.6, onChange: v => screenK = v }),
];
lk.forEach((k, i) => { k.group.position.set(-0.24 + i * 0.11, -0.1, 0); leftPanel.add(k.group); });

/* ---------- RIGHT SIDE PANEL: STATION ALERTING ---------- */
let lampTestHeld = false, lampTestUntil = 0;
function lampTestActive() { return lampTestHeld || T < lampTestUntil; }
const staBtns = [];
const GUARDS = [
  { label: 'EVAC TONE', f: v => { sim.evac = v; if (v) { sim.warnAck = false; audio.siren(4); sim.addLog('!! EVACUATION TONE ACTIVATED', COL.red); } } },
  { label: 'EMER PWR', f: v => { sim.emerPwr = v; flicker = 0.6; sim.addLog(v ? 'TRANSFER TO EMERGENCY POWER' : 'UTILITY POWER RESTORED', COL.amber); } },
  { label: 'BAY DOORS', f: v => sim.addLog(v ? 'ALL STATIONS — BAY DOORS OPEN' : 'BAY DOORS CLOSED', COL.amber) },
  { label: 'GEN TEST', f: v => { sim.genTest = v; } },
];
const rightPanel = makePanel(0.66, PH, p => {
  p.group(-0.155, 0.1, 0.33, 0.14, 'STATION ALERTING');
  p.group(0.17, 0.1, 0.27, 0.14, 'CRITICAL');
  GUARDS.forEach((g, i) => { const x = 0.072 + i * 0.065; p.text(g.label, x, 0.145, { size: 0.0058 }); p.stripes(x, 0.098, 0.044, 0.056); });
  p.group(-0.155, -0.095, 0.33, 0.12, 'ALERT CONTROL');
  p.group(0.17, -0.095, 0.27, 0.12, 'ALL CALL');
  p.stripes(0.17, -0.1, 0.08, 0.08);
  p.text('PRESS TO TONE ALL STATIONS', 0.17, -0.148, { size: 0.0058 });
}, { thick: 0.025, seed: 31 });
placeSloped(rightPanel, 1.2, 0.66);
for (let i = 0; i < 8; i++) {
  const lbl = i < 7 ? `STA ${i + 1}` : 'ALL';
  const b = litButton({ label: lbl, sub: 'ALERT', color: '#ffb02e', w: 0.062, h: 0.042, tip: { t: 'STATION ALERT', d: i < 7 ? `Tone out Station ${i + 1}` : 'Tone out all stations' }, onPress: c => { c.until = T + 3; audio.alert(1); sim.toneStation(i < 7 ? i + 1 : 0); } });
  b.until = 0; const up = b.update.bind(b); b.update = dt => { b.on = T < b.until && Math.floor(T * 4) % 2 === 0; up(dt); };
  b.group.position.set(-0.27 + (i % 4) * 0.077, 0.126 - Math.floor(i / 4) * 0.055, 0); rightPanel.add(b.group); staBtns.push(b);
}
const guardCtrls = GUARDS.map((g, i) => { const c = toggleSwitch({ guard: true, tip: { t: 'GUARDED', d: g.label + ' — click to lift guard, click again to switch' }, onChange: g.f }); c.group.position.set(0.072 + i * 0.065, 0.098, 0); rightPanel.add(c.group); return c; });
const muteBtn = litButton({ label: 'ALERT', sub: 'MUTE', color: '#ffb02e', w: 0.062, h: 0.042, toggle: true, tip: { t: 'AUDIO', d: 'Mute all console audio' }, onPress: c => { if (audio.muted !== c.on) audio.toggleMute(); } });
muteBtn.group.position.set(-0.27, -0.1, 0); rightPanel.add(muteBtn.group);
const ltBtn = litButton({ label: 'LAMP', sub: 'TEST', color: '#3dfc9a', w: 0.062, h: 0.042, tip: { t: 'LAMP TEST', d: 'Hold to light every lamp' }, onPress: () => { lampTestHeld = true; }, onRelease: () => { lampTestHeld = false; } });
ltBtn.group.position.set(-0.193, -0.1, 0); rightPanel.add(ltBtn.group);
const ackBtn = litButton({ label: 'ACK', sub: 'ALL', color: '#46e3ff', w: 0.062, h: 0.042, tip: { t: 'ACKNOWLEDGE', d: 'Acknowledge caution & warning' }, onPress: () => { sim.ackCaution(); sim.ackWarning(); } });
ackBtn.group.position.set(-0.116, -0.1, 0); rightPanel.add(ackBtn.group);
const recBtn = litButton({ label: 'DISP', sub: 'NOW', color: '#ff3b28', w: 0.062, h: 0.042, tip: { t: 'DISPATCH', d: 'Dispatch pending incident' }, onPress: () => doDispatch() });
recBtn.group.position.set(-0.039, -0.1, 0); rightPanel.add(recBtn.group);
{ const up = recBtn.update.bind(recBtn); recBtn.update = dt => { recBtn.on = !!sim.pending && Math.floor(T * 3) % 2 === 0; up(dt); }; }
// ALL CALL mushroom
{
  const g = new THREE.Group(); g.position.set(0.17, -0.1, 0); rightPanel.add(g);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.008, 48), new THREE.MeshPhysicalMaterial({ color: 0xe8b100, roughness: 0.3, clearcoat: 1 })); ring.rotation.x = Math.PI / 2; ring.position.z = 0.004; g.add(ring);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 24), M.black); stem.rotation.x = Math.PI / 2; stem.position.z = 0.016; g.add(stem);
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xc00a06, roughness: 0.18, clearcoat: 1, emissive: 0xff1a0a, emissiveIntensity: 0.2 });
  const domeG = new THREE.Group(); g.add(domeG);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.028, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.55, 1); dome.position.z = 0.026; dome.castShadow = true; domeG.add(dome);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 48), domeMat); rim.rotation.x = Math.PI / 2; rim.position.z = 0.023; domeG.add(rim);
  const ctrl = {
    tip: { t: 'ALL CALL', d: 'Tone all stations + siren' }, pressed: false, pv: 0, fl: 0,
    onDown() { this.pressed = true; this.fl = 1; audio.click('arcade'); audio.alert(3); sim.toneStation(0); sim.addLog('ALL CALL — GENERAL ALARM ALL STATIONS', COL.red); },
    onUp() { this.pressed = false; },
    update(dt) { this.pv += ((this.pressed ? 1 : 0) - this.pv) * Math.min(1, dt * 30); domeG.position.z = -this.pv * 0.006; this.fl = Math.max(0, this.fl - dt * 0.4); domeMat.emissiveIntensity = (0.2 + this.fl * (Math.sin(T * 20) > 0 ? 3 : 0.5)) * bootPanel; },
  };
  reg(ctrl, dome, rim);
}

/* ---------- ARCADE DECK ---------- */
function wedge(w, d, h0, h1, mat) {
  const sh = new THREE.Shape(); sh.moveTo(d / 2, 0); sh.lineTo(d / 2, h0); sh.lineTo(-d / 2, h1); sh.lineTo(-d / 2, 0); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2); geo.translate(w / 2, 0, 0);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function slopedTop(parent, w, d, h0, h1, paint, opts) {
  const a = Math.atan2(h1 - h0, d), L = Math.hypot(d, h1 - h0);
  const top = makePanel(w, L, paint, { thick: 0.004, ...opts });
  top.rotation.x = -Math.PI / 2 + a;
  top.position.set(0, (h0 + h1) / 2, 0).add(new V3(0, Math.cos(a), Math.sin(a)).multiplyScalar(0.0036)); parent.add(top);
  return top;
}
const deck = new THREE.Group(); deck.position.set(0, DESK, 0.075); scene.add(deck);
deck.add(wedge(0.66, 0.26, 0.035, 0.068, M.gloss));
const ARC = [
  { x: 0.035, y: 0.038, color: 0xe01010, label: 'DISPATCH', tip: 'Dispatch nearest units to pending call', f: () => doDispatch() },
  { x: 0.105, y: 0.05, color: 0xf0c000, label: 'NEXT INC', tip: 'Cycle selected incident', f: () => { sim.cycleIncident(); audio.click('blip'); } },
  { x: 0.175, y: 0.046, color: 0x1060f0, label: 'RECALL', tip: 'Recall units from selected incident', f: () => sim.recall() },
  { x: 0.03, y: -0.034, color: 0xeeeeee, label: 'HYDRANTS', tip: 'Toggle hydrant layer', f: () => { sim.layers.hydrants = !sim.layers.hydrants; } },
  { x: 0.1, y: -0.022, color: 0x10c040, label: 'TRAFFIC', tip: 'Toggle traffic layer', f: () => { sim.layers.traffic = !sim.layers.traffic; } },
  { x: 0.17, y: -0.026, color: 0xff6a00, label: 'MUTUAL AID', tip: 'Request county strike team', f: () => sim.requestMutualAid() },
];
const deckTop = slopedTop(deck, 0.66, 0.26, 0.035, 0.068, p => {
  const c = p.c;
  // flame art
  const g = c.createLinearGradient(0, 0, p.W, 0); g.addColorStop(0, 'rgba(255,60,10,0.25)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,60,10,0.22)');
  c.fillStyle = g; c.fillRect(0, 0, p.W, p.H);
  // diagonal racing stripes (screen-printed overlay)
  const stripe = (x0, w, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x0, p.H); c.lineTo(x0 + w, p.H); c.lineTo(x0 + w + p.H * 0.55, 0); c.lineTo(x0 + p.H * 0.55, 0); c.closePath(); c.fill(); };
  for (let i = 0; i < 9000; i++) { const y = Math.random() * p.H, x = Math.random() * p.W, l = 20 + Math.random() * 260; c.strokeStyle = `rgba(${Math.random() < 0.5 ? '210,212,215' : '0,0,0'},${0.012 + Math.random() * 0.03})`; c.lineWidth = 0.6 + Math.random() * 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (Math.random() - 0.5) * 1.5); c.stroke(); }
  // panel rim line
  c.strokeStyle = 'rgba(255,120,60,0.35)'; c.lineWidth = 3; c.strokeRect(14, 14, p.W - 28, p.H - 28);
  p.text('FIRE COMMAND', 0.075, 0.108, { size: 0.0165, font: FONTS.head, weight: 700, color: '#ffd6a8', glow: '#ff8a3a', spacing: 0.0022 });
  p.text('RESPONSE DECK', -0.225, 0.108, { size: 0.0085, font: FONTS.mono, weight: 400, color: '#ff9a50', glow: '#ff6a20', spacing: 0.001 });
  p.ring(-0.225, 0.0, 0.048, 0.052, { color: 'rgba(70,227,255,0.6)', w: 0.0012 });
  p.text('TRACK · MAP PAN', -0.225, -0.072, { size: 0.0075, glow: '#46e3ff' });
  p.ring(-0.085, 0.01, 0.036, 0, { color: 'rgba(255,255,255,0.35)', w: 0.001 });
  p.text('THERMAL CAM', -0.085, -0.072, { size: 0.0075 });
  for (const b of ARC) { p.ring(b.x, b.y, 0.0275, 0, { color: 'rgba(255,200,150,0.35)', w: 0.001 }); p.text(b.label, b.x, b.y - 0.0365, { size: 0.0062 }); }
  p.text('CENTER', 0.272, 0.058 - 0.024, { size: 0.0058 }); p.text('FOLLOW', 0.272, -0.02 - 0.024, { size: 0.0058 });
  p.line(-0.15, -0.09, -0.15, 0.09, { color: 'rgba(255,120,60,0.25)' }); p.line(0.235, -0.09, 0.235, 0.09, { color: 'rgba(255,120,60,0.25)' });
}, { base: '#1e1d1b', seed: 41, rough: 0.85, metal: 0.75, wear: 1.6 });
const tb = trackball({ tip: { t: 'TRACKBALL', d: 'Roll to pan the tactical map' } }); tb.group.position.set(-0.225, 0, 0); deckTop.add(tb.group);
const js = joystick({ tip: { t: 'JOYSTICK', d: 'Aim the thermal camera (MFD 2)' } }); js.group.position.set(-0.085, 0.01, 0); deckTop.add(js.group);
const arcCtrls = ARC.map(b => { const c = arcadeButton({ color: b.color, tip: { t: b.label, d: b.tip }, onPress: b.f }); c.group.position.set(b.x, b.y, 0); deckTop.add(c.group); return c; });
{
  const c1 = arcadeButton({ color: 0xffffff, s: 0.7, tip: { t: 'CENTER', d: 'Center map on selected incident' }, onPress: () => sim.centerOn(sim.selected, 1.8) }); c1.group.position.set(0.272, 0.058, 0); deckTop.add(c1.group);
  const c2 = arcadeButton({ color: 0x46e3ff, s: 0.7, tip: { t: 'FOLLOW', d: 'Map follows selected incident' }, onPress: () => { sim.follow = !sim.follow; } }); c2.group.position.set(0.272, -0.02, 0); deckTop.add(c2.group);
}
// marquee strip on deck front + T-molding
{
  const c = makeCanvas(2048, 96), x = c.getContext('2d');
  x.fillStyle = '#050100'; x.fillRect(0, 0, 2048, 96);
  const g = x.createLinearGradient(0, 0, 2048, 0); g.addColorStop(0, '#ff3a10'); g.addColorStop(0.5, '#ffb040'); g.addColorStop(1, '#ff3a10');
  x.fillStyle = g; x.font = `700 58px ${FONTS.head}`; x.textAlign = 'center'; x.textBaseline = 'middle'; if ('letterSpacing' in x) x.letterSpacing = '22px';
  x.shadowColor = '#ff5a10'; x.shadowBlur = 18; x.fillText('◆  EVERY SECOND COUNTS  ◆', 1024, 50);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.026), new THREE.MeshBasicMaterial({ map: tex(c), color: new THREE.Color(1.5, 1.5, 1.5) }));
  m.position.set(0, 0.0175, 0.1331); deck.add(m); deck.userData.marquee = m;
  const a = Math.atan2(0.033, 0.26), L = Math.hypot(0.26, 0.033);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.666, 0.0035, 0.0035), M.tmold); front.position.set(0, 0.0355, 0.1315); deck.add(front);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, L), M.tmold); e.position.set(s * 0.3315, 0.052, 0); e.rotation.x = a; deck.add(e); });
}

/* ---------- MAP CONTROL BOX (left of deck) ---------- */
const kbox = new THREE.Group(); kbox.position.set(-0.47, DESK, 0.06); kbox.rotation.y = 0.12; scene.add(kbox);
kbox.add(wedge(0.17, 0.16, 0.03, 0.058, M.body));
const kTop = slopedTop(kbox, 0.17, 0.16, 0.03, 0.058, p => {
  p.text('MAP ZOOM', -0.04, -0.06, { size: 0.0072 }); p.ticks(-0.04, 0.0, 0.032, 9, -225 * DEG, 45 * DEG, 0.004);
  p.text('VOLUME', 0.045, -0.06, { size: 0.0072 }); p.ticks(0.045, 0.0, 0.024, 11, -225 * DEG, 45 * DEG);
  p.text('RANGE', -0.04, 0.062, { size: 0.0062, color: '#aaa' }); p.text('AUDIO', 0.045, 0.062, { size: 0.0062, color: '#aaa' });
}, { seed: 51 });
const zoomKnob = knob({ r: 0.019, big: true, min: 1, max: 3.2, value: 1.05, tip: { t: 'MAP ZOOM', d: 'Drag or scroll to zoom the map' }, onChange: v => sim.zoomTo(v) });
zoomKnob.group.position.set(-0.04, 0, 0); kTop.add(zoomKnob.group);
const volKnob = knob({ r: 0.013, min: 0, max: 1, value: 0.8, tip: { t: 'VOLUME', d: 'Master audio volume' }, onChange: v => audio.setVolume(v) });
volKnob.group.position.set(0.045, 0, 0); kTop.add(volKnob.group);

/* ---------- THROTTLE QUADRANT ---------- */
const tq = new THREE.Group(); tq.position.set(0.5, DESK, 0.04); tq.rotation.y = -0.1; scene.add(tq);
{
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.05, 0.22, 3, 0.01), M.body); housing.position.y = 0.025; housing.castShadow = true; housing.receiveShadow = true; tq.add(housing);
  const top = makePanel(0.16, 0.21, p => {
    [-0.05, 0, 0.05].forEach(x => { p.well(x, 0.005, 0.011, 0.16, { r: 0.005, color: '#030303' }); });
    ['PUMP 1', 'PUMP 2', 'FOAM'].forEach((l, i) => p.text(l, -0.05 + i * 0.05, -0.092, { size: 0.0072 }));
    p.text('MAX', -0.072, 0.075, { size: 0.0055 }); p.text('IDLE', -0.072, -0.068, { size: 0.0055 });
    for (let k = 0; k < 9; k++) { const y = -0.065 + k * 0.017; p.line(0.068, y, 0.075, y, { color: 'rgba(230,226,214,0.8)', lit: true }); }
  }, { thick: 0.004, seed: 61 });
  top.position.y = 0.0505; top.rotation.x = -Math.PI / 2; tq.add(top);
  [['#1a1a1a', 0], ['#1a1a1a', 1], ['#c8100a', 2]].forEach(([col, k], i) => {
    const lv = throttleLever({ k, color: new THREE.Color(col).getHex(), tip: { t: ['PUMP 1', 'PUMP 2', 'FOAM'][i], d: 'Drag up/down to set discharge' } });
    lv.group.position.set(-0.05 + i * 0.05, 0.005, 0); top.add(lv.group);
  });
}

/* ---------- MONITORS ---------- */
function arcPlace(prevEdge, phi, width) {
  const dir = new V3(Math.cos(phi), 0, -Math.sin(phi));
  const c = prevEdge.clone().addScaledVector(dir, width / 2);
  const outer = prevEdge.clone().addScaledVector(dir, width);
  return { c, outer };
}
const monitorRoot = new THREE.Group(); scene.add(monitorRoot);
const mMap = monitor(screens.map, 1.04, 0.585, { ralColor: 0xc9d6e6, ralK: 9, label: 'TACVIEW 55' }); mMap.position.set(0, 1.3, -0.72); mMap.rotation.x = -0.04; monitorRoot.add(mMap);
const sideW = 0.62, sideH = 0.442, wingW = 0.56, wingH = 0.4;
const rs = arcPlace(new V3(0.552, 0, -0.72), -0.5, sideW + 0.042);
const rw = arcPlace(rs.outer.clone().add(new V3(0.008, 0, 0)), -1.05, wingW + 0.042);
function placeMon(mon, p, phi, y) { mon.position.set(p.x, y, p.z); mon.rotation.set(-0.03, phi, 0, 'YXZ'); monitorRoot.add(mon); }
const mFleet = monitor(screens.fleet, sideW, sideH, { ralColor: 0xc8d8e0, ralK: 5, label: 'TACVIEW 27' }); placeMon(mFleet, new V3(-rs.c.x, 0, rs.c.z), 0.5, 1.28);
const mPeople = monitor(screens.people, sideW, sideH, { ralColor: 0xe6d8c8, ralK: 5, label: 'TACVIEW 27' }); placeMon(mPeople, rs.c, -0.5, 1.28);
const mLog = monitor(screens.log, wingW, wingH, { ralColor: 0xe6cfc8, ralK: 4, label: 'TACVIEW 24' }); placeMon(mLog, new V3(-rw.c.x, 0, rw.c.z), 1.05, 1.26);
const mWx = monitor(screens.wx, wingW, wingH, { ralColor: 0xc8d8e0, ralK: 4, label: 'TACVIEW 24' }); placeMon(mWx, rw.c, -1.05, 1.26);
// stands & arms
function stand(x, z, y0, y1) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, y1 - y0, 20), M.satin); pole.position.set(x, (y0 + y1) / 2, z); pole.castShadow = true; scene.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 32), M.satin); base.position.set(x, y0 + 0.006, z); scene.add(base);
}
stand(0, -0.82, 0.97, 1.2);
stand(-0.86, -0.72, 0.97, 1.2); stand(0.86, -0.72, 0.97, 1.2);
[-1, 1].forEach(s => {
  stand(s * 1.38, -0.62, 0.97, 1.26);
  const p0 = new V3(s * 1.38, 1.26, -0.62), p1 = new V3(s * rw.c.x, 1.26, rw.c.z).addScaledVector(new V3(s * Math.sin(1.05), 0, -Math.cos(1.05)), 0.06);
  const armM = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, p0.distanceTo(p1), 16), M.satin);
  armM.position.copy(p0).add(p1).multiplyScalar(0.5); armM.quaternion.setFromUnitVectors(new V3(0, 1, 0), p1.clone().sub(p0).normalize()); scene.add(armM);
});

/* ---------- GLARESHIELD (MCP) ---------- */
const glarePanel = makePanel(1.12, 0.094, p => {
  GLARE_GROUPS.forEach(g => p.text(g.label, g.x, 0.032, { size: 0.0068, spacing: 0.0004 }));
  p.well(0.005, -0.006, 0.88, 0.044, { r: 0.004, color: '#070505' });
}, { thick: 0.075, seed: 71 });
glarePanel.position.set(0, 1.663, -0.69); glarePanel.rotation.x = 0.2; scene.add(glarePanel);
const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.032), new THREE.MeshBasicMaterial({ map: glare.tex, color: new THREE.Color(1.7, 1.7, 1.7) })); strip.position.set(0.005, -0.006, 0.0008); glarePanel.add(strip);
const mWarn = litButton({ label: 'MASTER\nWARNING', color: '#ff2a1a', full: true, w: 0.062, h: 0.05, tip: { t: 'MASTER WARNING', d: 'Flashes for PASS alarm / evacuation. Click to acknowledge.' }, onPress: () => sim.ackWarning() });
mWarn.group.position.set(-0.515, -0.002, 0); glarePanel.add(mWarn.group);
const mCaut = litButton({ label: 'MASTER\nCAUTION', color: '#ffb02e', full: true, w: 0.062, h: 0.05, tip: { t: 'MASTER CAUTION', d: 'Flashes for new calls. Click to acknowledge.' }, onPress: () => sim.ackCaution() });
mCaut.group.position.set(0.515, -0.002, 0); glarePanel.add(mCaut.group);
{ const uw = mWarn.update.bind(mWarn), uc = mCaut.update.bind(mCaut);
  mWarn.update = dt => { mWarn.on = sim.warning && Math.floor(T * 3) % 2 === 0; uw(dt); };
  mCaut.update = dt => { mCaut.on = sim.caution && Math.floor(T * 2.5) % 2 === 0; uc(dt); }; }
// leather visor lip over glareshield
const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 1.08, 6, 20), M.leather); visor.rotation.z = Math.PI / 2; visor.position.set(0, 1.715, -0.69); visor.scale.set(1, 1, 2.2); scene.add(visor);

/* ================= PROPS ================= */
const props = buildProps({ scene, M, sim, reg });
const backdrop = buildBackdrop({ scene, M, screens });
props.truck.position.set(0.38, 1.734, -0.72); scene.add(props.truck);
{
  const s1 = props.sticky('call Batt. Chief\nre: hydrant 0412', '#ffe066', 0.06); s1.position.set(-0.3, -0.442 / 2 - 0.021 + 0.05, 0.006); s1.position.x = 0.23; mFleet.add(s1);
  s1.position.set(sideW / 2 - 0.02, sideH / 2 + 0.012, 0.007); s1.rotation.z = -0.12;
  const s2 = props.sticky('L4 OOS\nuntil Thu!', '#ff9fb8', 0.1); s2.position.set(-sideW / 2 + 0.03, sideH / 2 + 0.01, 0.007); mPeople.add(s2);
  const s3 = props.sticky('coffee ≠\nwater supply', '#9ff0b0', -0.08); s3.position.set(0.48, -0.31, 0.006); mMap.add(s3);
}

/* ================= BAKED CONTACT SHADOWS ================= */
{
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(), box = new THREE.Box3(), corner = new V3();
  for (const pg of panels) {
    const p = pg.userData.painter; inv.copy(pg.matrixWorld).invert();
    for (const ch of pg.children) {
      if (ch.userData.isPanel || ch.isMesh && ch.geometry.type !== 'PlaneGeometry' && ch.geometry.type !== 'BoxGeometry' && ch.geometry.type !== 'RoundedBoxGeometry' && false) continue;
      if (ch === pg.children[0] || (ch.isMesh && ch.geometry.type === 'CapsuleGeometry')) continue;
      box.setFromObject(ch); if (box.isEmpty()) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zmax = 0;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
        x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y); zmax = Math.max(zmax, corner.z);
      }
      if (x1 - x0 > 0.5 || zmax < 0.0015) continue;
      const tall = Math.min(1, zmax / 0.02);
      // tight dark contact + wider soft occlusion, dropped toward the viewer
      p.ao(x0, y0, x1, y1, { pad: 0.003, alpha: 0.75, drop: 0.001 });
      p.ao(x0, y0, x1, y1, { pad: 0.008 + tall * 0.01, alpha: 0.35 + tall * 0.2, drop: 0.003 + tall * 0.006 });
    }
    pg.userData.map.needsUpdate = true;
  }
}

/* ================= LIGHTS ================= */
const hemi = new THREE.HemisphereLight(0x3a3a40, 0x0a0806, 0.08); scene.add(hemi);
const flood = new THREE.SpotLight(0xfff0e0, 3, 6, 0.5, 1.0, 1.4);
flood.position.set(0.15, 2.85, 0.75); flood.target.position.set(0, 0.8, -0.2); scene.add(flood, flood.target);
flood.castShadow = true; flood.shadow.mapSize.set(2048, 2048); flood.shadow.bias = -0.0002; flood.shadow.normalBias = 0.02; flood.shadow.radius = 5;
const rim = new THREE.DirectionalLight(0x8a8478, 0.06); rim.position.set(0.5, 2.6, -3); scene.add(rim);
const fireGlow = { intensity: 0 };
const consoleFlood = new THREE.RectAreaLight(0xffe2c4, 0.07, 3.2, 0.6); consoleFlood.position.set(0, 2.3, 0.1); consoleFlood.lookAt(0, 0.8, -0.3); scene.add(consoleFlood);
[-1, 1].forEach(s => {
  if (s < 0) return;
  const up = new THREE.SpotLight(0x5a6890, 7, 5, 0.6, 1, 1.3); up.position.set(s * 2.05, 0.15, -1.75); up.target.position.set(s * 2.05, 2.6, -1.95); scene.add(up, up.target);
});
const troffLight = { intensity: 0 };
let roomOn = false, flicker = 0;
function roomLights(on) { roomOn = on; setTimeout(captureEnv, 400); }

/* ================= POST ================= */
const rt = new THREE.WebGLRenderTarget(innerWidth * DPR0, innerHeight * DPR0, { type: THREE.HalfFloatType, samples: 4 });
rt.depthTexture = new THREE.DepthTexture(innerWidth * DPR0, innerHeight * DPR0); rt.depthTexture.type = THREE.UnsignedIntType;
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR0); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const dof = new DOFPass(camera); composer.addPass(dof);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.5, 0.9);
{ const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }
composer.addPass(bloom);
composer.addPass(new OutputPass());
/* live reflections: capture the actual cockpit into the environment map */
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.05, 30, cubeRT); cubeCam.position.set(0, 1.12, 0.2); scene.add(cubeCam);
const pmremGen = new THREE.PMREMGenerator(renderer);
let envRT = null;
function captureEnv() {
  cubeCam.update(renderer, scene);
  const n = pmremGen.fromCubemap(cubeRT.texture);
  if (envRT) envRT.dispose(); envRT = n; scene.environment = n.texture;
  renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(innerWidth, innerHeight) }, flash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; uniform float flash; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5; float r2 = dot(d,d);
      float ca = 0.006 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv - d*ca*1.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + d*ca*1.0).b;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(col, col*vec3(1.02,1.0,0.96), (1.0 - smoothstep(0.0, 0.45, l))*0.4);
      col = mix(col, col*vec3(1.06,1.0,0.92), smoothstep(0.45, 1.0, l)*0.3);
      col = (col - 0.5) * 1.1 + 0.5; col = max(col - 0.012, 0.0) * 1.012;
      float v = smoothstep(0.95, 0.25, length(d*vec2(1.0, 1.15)));
      col *= mix(0.32, 1.0, v);
      float g = rand(uv*res + fract(time)*100.0) - 0.5;
      col += g * 0.045 * (1.0 - l*0.6);
      col += vec3(1.0,0.15,0.08) * flash * 0.15 * (1.0 - v*0.6);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(finalPass);

/* ================= CAMERA ================= */
const SEAT = new V3(0, 1.31, 1.1);
const cam = { mode: 'intro', pos: new V3(0, 1.85, 3.0), look: new V3(0, 1.1, -0.8), yaw: 0, pitch: -0.13, tyaw: 0, tpitch: -0.13, fov: 34, tfov: 56, speed: 1.2, focusPos: new V3(), focusLook: new V3(), name: 'SEAT' };
const viewEl = document.getElementById('hud-view');
const seatOff = new V3();
function toSeat() { cam.mode = 'seat'; cam.tfov = 56; cam.speed = 3.2; cam.name = 'SEAT'; viewEl.textContent = 'SEAT'; seatOff.set(0, 0, 0); cam.tyaw = 0; cam.tpitch = -0.13; }
/* arrow keys look around, exactly like dragging the mouse */
const held = new Set();
/* WASD move, Q/E down/up, Shift faster — stays inside the operator side of the room */
const ROOM = { x0: -2.05, x1: 2.05, y0: 0.85, y1: 2.45, z0: 0.42, z1: 2.9 };
function walk(dt) {
  const f = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0);
  const r = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
  const u = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
  if (!f && !r && !u) return;
  if (cam.mode !== 'seat') {
    // continue from wherever a focus view left the camera
    const dir = cam.focusLook.clone().sub(camera.position).normalize();
    cam.yaw = cam.tyaw = Math.atan2(dir.x, -dir.z); cam.pitch = cam.tpitch = Math.asin(clamp(dir.y, -1, 1));
    seatOff.copy(camera.position).sub(SEAT);
    cam.mode = 'seat'; cam.tfov = 56; cam.speed = 3.2;
  }
  const sp = (held.has('ShiftLeft') || held.has('ShiftRight') ? 2.4 : 0.9) * dt;
  const fwd = new V3(Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)), right = new V3(Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  seatOff.addScaledVector(fwd, f * sp).addScaledVector(right, r * sp); seatOff.y += u * sp;
  const p = SEAT.clone().add(seatOff);
  p.x = clamp(p.x, ROOM.x0, ROOM.x1); p.y = clamp(p.y, ROOM.y0, ROOM.y1); p.z = clamp(p.z, ROOM.z0, ROOM.z1);
  seatOff.copy(p).sub(SEAT);
  if (cam.name !== 'FREE') { cam.name = 'FREE'; viewEl.textContent = 'FREE'; }
}
function look(dt) {
  const yx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const py = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
  if (!yx && !py) return;
  if (cam.mode !== 'seat') { toSeat(); return; }
  const rate = (held.has('ShiftLeft') || held.has('ShiftRight') ? 2.2 : 1.1) * dt * (cam.fov / 56);
  cam.tyaw = clamp(cam.tyaw + yx * rate, -2.6, 2.6);
  cam.tpitch = clamp(cam.tpitch + py * rate, -0.85, 0.35);
}
function focusOn(mesh, w, h, name, pad = 1.1, fov = 34) {
  mesh.updateMatrixWorld(true);
  const c = new V3().setFromMatrixPosition(mesh.matrixWorld), n = new V3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const vf = fov * DEG, dist = Math.max(h / 2 / Math.tan(vf / 2), w / 2 / (Math.tan(vf / 2) * camera.aspect)) * pad;
  cam.focusPos.copy(c).addScaledVector(n, dist); cam.focusLook.copy(c); cam.tfov = fov; cam.mode = 'focus'; cam.speed = 3.2; cam.name = name; viewEl.textContent = name;
}
function focusPose(pos, look, fov, name) { cam.focusPos.copy(pos); cam.focusLook.copy(look); cam.tfov = fov; cam.mode = 'focus'; cam.speed = 3.0; cam.name = name; viewEl.textContent = name; }
const VIEWS = {
  1: () => focusOn(screens.map.mesh, 1.04, 0.585, 'TACTICAL MAP'),
  2: () => focusOn(screens.fleet.mesh, sideW, sideH, 'FLEET'),
  3: () => focusOn(screens.people.mesh, sideW, sideH, 'PERSONNEL'),
  4: () => focusOn(screens.log.mesh, wingW, wingH, 'CAD QUEUE'),
  5: () => focusOn(screens.wx.mesh, wingW, wingH, 'WEATHER / COMMS'),
  6: () => focusOn(screens.equip.mesh, 0.3, 0.27, 'MFD 1', 1.05, 30),
  7: () => focusOn(screens.therm.mesh, 0.3, 0.27, 'MFD 2', 1.05, 30),
  8: () => focusPose(new V3(0, 1.2, 0.62), new V3(0, 0.82, -0.32), 50, 'MAIN PANEL'),
  9: () => focusPose(new V3(0.12, 1.0, 0.5), new V3(0.08, 0.76, 0.02), 46, 'RESPONSE DECK'),
};
const _d = new V3();
function updateCamera(dt) {
  look(dt); walk(dt);
  let dPos, dLook;
  if (cam.mode === 'intro') { dPos = _d.set(Math.sin(T * 0.12) * 0.25, 1.8, 2.9); dLook = new V3(0, 1.15, -0.7); }
  else if (cam.mode === 'seat') {
    const k = 1 - Math.exp(-dt * 6); cam.yaw += (cam.tyaw - cam.yaw) * k; cam.pitch += (cam.tpitch - cam.pitch) * k;
    dPos = SEAT.clone().add(seatOff).add(new V3(Math.sin(T * 0.31) * 0.006 + Math.sin(T * 0.13) * 0.004, Math.sin(T * 0.47) * 0.004, 0));
    const dir = new V3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch));
    dLook = dPos.clone().addScaledVector(dir, 2);
  } else { dPos = cam.focusPos; dLook = cam.focusLook; }
  const k = 1 - Math.exp(-dt * cam.speed);
  cam.pos.lerp(dPos, k); cam.look.lerp(dLook, k);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  cam.fov += (cam.tfov - cam.fov) * k; camera.fov = cam.fov; camera.updateProjectionMatrix();
}

/* ================= INPUT ================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const tipEl = document.getElementById('tip');
function pick(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(hitList, false);
  for (const h of hits) if (h.object.userData.ctrl) return h;
  return null;
}
let down = null, hover = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  audio.init();
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 2) { toSeat(); return; }
  const hit = pick(e);
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, ctrl: hit ? hit.object.userData.ctrl : null, hit, moved: 0 };
  if (down.ctrl) { down.ctrl.onDown && down.ctrl.onDown(hit); shadowDirty = true; }
  else canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', e => {
  if (!started) return;
  if (down) {
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY; down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.ctrl) { down.ctrl.onDrag && down.ctrl.onDrag(dx, dy); shadowDirty = true; }
    else {
      if (cam.mode !== 'seat') { if (down.moved > 8) toSeat(); return; }
      const s = cam.fov / 56;
      cam.tyaw = clamp(cam.tyaw + dx * 0.0032 * s, -2.6, 2.6); cam.tpitch = clamp(cam.tpitch - dy * 0.0032 * s, -0.85, 0.35);
    }
    return;
  }
  const hit = pick(e); const c = hit ? hit.object.userData.ctrl : null;
  hover = c;
  if (c && c.tip) {
    const t = typeof c.tip === 'string' ? { t: '', d: c.tip } : c.tip;
    tipEl.innerHTML = `<span class="t">${t.t}</span>${t.d}`; tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px'; tipEl.classList.add('on');
  } else tipEl.classList.remove('on');
  canvas.classList.toggle('ptr', !!c);
});
const endDown = () => { if (down && down.ctrl && down.ctrl.onUp) down.ctrl.onUp(); down = null; canvas.classList.remove('drag'); };
canvas.addEventListener('pointerup', endDown);
canvas.addEventListener('pointercancel', endDown);
canvas.addEventListener('dblclick', e => {
  if (!started) return;
  const hit = pick(e); const c = hit && hit.object.userData.ctrl;
  if (c && c.focus) c.focus();
  else if (!c && cam.mode !== 'seat') toSeat();
});
canvas.addEventListener('wheel', e => {
  if (!started) return; e.preventDefault();
  if (hover && hover.onWheel) { hover.onWheel(e.deltaY); return; }
  if (cam.mode === 'seat') cam.tfov = clamp(cam.tfov + e.deltaY * 0.02, 22, 62);
  else cam.tfov = clamp(cam.tfov + e.deltaY * 0.015, 14, 60);
}, { passive: false });
const LOOK_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight'];
const WALK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'];
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => held.clear());
addEventListener('keydown', e => {
  if (!started) return;
  if (WALK_KEYS.includes(e.code) && !e.metaKey && !e.ctrlKey) { const fresh = !held.has(e.code); held.add(e.code); if (fresh && !e.repeat) walk(1 / 30); return; }
  if (LOOK_KEYS.includes(e.code)) { const fresh = !held.has(e.code); held.add(e.code); if (e.code.startsWith('Arrow')) { e.preventDefault(); if (fresh && !e.repeat) look(1 / 20); return; } }
  const k = e.key.toLowerCase();
  if (e.code === 'BracketRight') { e.preventDefault(); if (e.shiftKey) setBacklight(panelDim + 0.1); else setLight(lightLevel + 0.1); return; }
  if (e.code === 'BracketLeft') { e.preventDefault(); if (e.shiftKey) setBacklight(panelDim - 0.1); else setLight(lightLevel - 0.1); return; }
  if (e.code === 'Backslash') { setLight(1); setBacklight(1); return; }
  if (VIEWS[k]) VIEWS[k]();
  else if (k === 'escape' || k === '0') toSeat();
  else if (k === 'c') document.body.classList.toggle('cinema');
  else if (k === 'h') document.body.classList.toggle('nohud');
  else if (k === 'm') { audio.init(); muteBtn.set(audio.toggleMute()); }
  else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if (k === ' ') { e.preventDefault(); doDispatch(); }
});

/* keyboard lighting: [ ] room/desk light, Shift+[ ] control backlighting, \ reset */
const toastEl = document.getElementById('toast'); let toastT = 0;
function toast(label, v) {
  const pct = Math.round(v * 100);
  toastEl.innerHTML = `<span class="t">${label}</span><span class="v">${pct}%</span><span class="b"><i style="width:${Math.min(100, pct / 3)}%"></i></span>`;
  toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1400);
}
function setLight(v) { lightLevel = clamp(Math.round(v * 10) / 10, 0, 3); toast('ROOM / DESK LIGHT', lightLevel); clearTimeout(setLight.t); setLight.t = setTimeout(captureEnv, 600); }
function setBacklight(v) { panelDim = clamp(Math.round(v * 10) / 10, 0.1, 2.5); lk[0].setValue(Math.min(1.8, panelDim), false); toast('CONTROL BACKLIGHT', panelDim); }

// screens as interactive surfaces
const SCREEN_VIEWS = [[screens.map, 1, 'Tactical map — click an incident to select, double-click to focus'], [screens.fleet, 2, 'Fleet status — double-click to focus'], [screens.people, 3, 'Personnel accountability — double-click to focus'], [screens.log, 4, 'CAD queue & radio log — double-click to focus'], [screens.wx, 5, 'Weather & comms — double-click to focus'], [screens.equip, 6, 'MFD 1 — use the bezel soft keys'], [screens.therm, 7, 'MFD 2 — aim with the joystick']];
for (const [s, v, d] of SCREEN_VIEWS) {
  const ctrl = {
    tip: { t: s.name, d }, focus: () => VIEWS[v](),
    onDown(hit) {
      if (s === screens.map && hit && hit.uv) {
        const vw = sim.view, wx = (hit.uv.x * 1600 - 800) / vw.zoom + vw.cx, wy = ((1 - hit.uv.y) * 900 - 450) / vw.zoom + vw.cy;
        if (sim.selectAt(wx, wy)) audio.click('blip');
      }
    },
  };
  reg(ctrl, s.mesh);
}

function doDispatch() {
  if (sim.dispatch()) { audio.click('blip'); sim.ackCaution(); }
  else audio.click('soft');
}

/* ================= SIM EVENTS ================= */
sim.on('incident', () => { audio.alert(3); });
sim.on('warning', () => { audio.warning(); });
sim.on('chatter', c => { audio.chatter(c.dur, c.ch === sim.radioCh || c.ch === FREQ.indexOf(sim.com[1].act)); });

/* ================= BOOT / INTRO ================= */
let bootPanel = 0, engageT = -1;
const envShots = [4.5, 9, 20];
const engageBtn = document.getElementById('engage');
// warm-up: render a few frames so shaders compile before the user engages
setProgress('COMPILING SHADERS…');
await new Promise(r => setTimeout(r, 30));
renderer.compile(scene, camera);
drawCom();
setProgress('SYSTEMS READY');
engageBtn.disabled = false;
engageBtn.addEventListener('click', () => {
  audio.init(); audio.chime();
  started = true; engageT = T;
  document.getElementById('intro').classList.add('gone');
  document.body.classList.add('live');
  cam.mode = 'seat'; cam.speed = 0.75; cam.tfov = 56;
  const sch = { map: 1.6, fleet: 2.1, people: 2.4, log: 2.9, wx: 3.2, equip: 2.2, therm: 2.6 };
  for (const k in sch) screens[k].boot(T + sch[k]);
  setTimeout(() => { if (cam.mode === 'seat') cam.speed = 3.2; }, 4500);
  setTimeout(() => document.body.classList.add('quiet'), 12000);
});
{
  const q = new URLSearchParams(location.search);
  if (q.has('auto')) { engageBtn.click(); const v = q.get('view'); if (v && VIEWS[v]) setTimeout(() => VIEWS[v](), 200); if (q.has('fast')) { document.getElementById('intro').style.display = 'none'; cam.speed = 50; for (const k in screens) screens[k].boot(-10); engageT = -10; } }
}

/* ================= LOOP ================= */
const clock = new THREE.Clock();
let perfAcc = 0, perfN = 0, curDPR = DPR0;
const hudClock = document.getElementById('hud-clock');
let clockAcc = 0, comAcc = 0;
function frame() {
  const rawDt = clock.getDelta(); const dt = Math.min(rawDt, 0.05); T += dt;
  if (started) sim.update(dt);

  // panel lighting fades up after engage
  const targetBoot = started ? clamp((T - engageT - 0.8) / 1.6) : 0;
  const prevBoot = bootPanel; bootPanel = targetBoot;
  if ((prevBoot <= 0.5) !== (bootPanel <= 0.5)) drawCom();
  flicker = Math.max(0, flicker - dt);
  const fl = flicker > 0 ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
  for (const m of panelMats) m.emissiveIntensity = (0.04 + bootPanel * panelDim * 1.2) * fl * (m.userData.boost || 1);
  M.backlight.color.setRGB(1.0, 0.6, 0.28).multiplyScalar(1.3 * bootPanel * panelDim * fl);
  M.pointer.emissiveIntensity = 1.4 * (0.2 + 0.8 * bootPanel) * panelDim;

  for (const c of controls) c.update && c.update(dt);

  let budget = 2;
  const order = Object.values(screens).sort((a, b) => b.acc * b.fps - a.acc * a.fps);
  for (const s of order) {
    if (budget > 0) { if (s.tick(sim, T, dt)) budget--; } else s.acc += dt;
    if (s.mat) s.mat.emissiveIntensity = s.k * screenK * fl;
    if (s.ral) s.ral.intensity = s.ralK * 0.22 * s.power * screenK * fl * Math.sqrt(lightLevel);
  }
  glare.power = bootPanel > 0.5 ? 1 : 0; glare.tick(sim, dt);
  comAcc += dt; if (comAcc > 1) { comAcc = 0; drawCom(); }

  props.update(T, dt); backdrop.update(T, dt);
  flood.intensity = (started ? floodK * 9 * lightLevel : 0.8) * fl;
  consoleFlood.intensity = 0.07 * lightLevel; props.lampLight.intensity = 1.15 * Math.min(lightLevel, 2) * fl;
  scene.environmentIntensity = 0.12 * (0.4 + 0.6 * lightLevel);
  const roomK = roomOn ? 1 : 0;
  props.troffMat.color.setRGB(0.12 + roomK * 2.2, 0.15 + roomK * 2.4, 0.2 + roomK * 2.6);
  troffLight.intensity = roomK * 6 * fl;
  hemi.intensity = (0.015 + roomK * 0.7) * lightLevel;
  fireGlow.intensity = 0.6 + Math.sin(T * 7) * 0.12 + Math.sin(T * 13.3) * 0.08;
  finalPass.uniforms.time.value = T;
  finalPass.uniforms.flash.value = sim.warning ? Math.max(0, Math.sin(T * 6)) : 0;

  updateCamera(dt);
  const fTarget = cam.mode === 'focus' ? cam.focusPos.distanceTo(cam.focusLook) : cam.mode === 'intro' ? 3.6 : 1.85;
  dof.focus += (fTarget - dof.focus) * Math.min(1, dt * 4);
  if (started && envShots.length && T - engageT > envShots[0]) { envShots.shift(); captureEnv(); }
  clockAcc += dt; if (clockAcc > 0.5) { clockAcc = 0; hudClock.textContent = clockStr(); }
  shadowAcc += dt;
  if (shadowDirty || shadowAcc > 0.5) { renderer.shadowMap.needsUpdate = true; shadowAcc = 0; shadowDirty = !!down; }
  composer.render();
  // adaptive resolution: keep it smooth on weaker GPUs
  if (rawDt < 0.2 && document.hasFocus()) { perfAcc += rawDt; perfN++; }
  if (perfN > 90) {
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    let want = curDPR;
    if (avg > 0.03 && curDPR > 0.75) want = Math.max(0.75, curDPR - 0.25);
    else if (avg < 0.0175 && curDPR < DPR) want = Math.min(DPR, curDPR + 0.25);
    if (want !== curDPR && document.visibilityState === 'visible') { curDPR = want; renderer.setPixelRatio(curDPR); composer.setPixelRatio(curDPR); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight); finalPass.uniforms.res.value.set(innerWidth, innerHeight);
});

// debug handle
window.__cockpit = { sim, cam, VIEWS, toSeat, scene, camera, renderer, screens, composer, dof, captureEnv, bloom };
