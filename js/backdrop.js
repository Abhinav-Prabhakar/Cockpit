import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, tex, FONTS, rng, grimeCanvas } from './textures.js';
import { mergeStatic } from './merge.js';

/* Everything behind the operator's glass partition: a second dispatch room with
   operators and a video wall, and the apparatus bay with parked engines.
   It is meant to be seen through the depth-of-field pass, so geometry is
   moderately detailed and leans on lights, reflections and silhouettes. */
export function buildBackdrop({ scene, M, screens }) {
  const updaters = [];
  const r = rng(909);
  const add = (o, p = scene) => { p.add(o); return o; };
  const GZ = -1.95; // glass line

  /* ---------- glass partition ---------- */
  const mullMat = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.35, metalness: 0.8 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0d10, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 });
  const glass = add(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), glassMat)); glass.position.set(0, 1.45, GZ);
  [-2.3, -1.15, 0, 1.15, 2.3].forEach(x => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.9, 0.08), mullMat)); m.position.set(x, 1.45, GZ); });
  [0.05, 0.95, 2.86].forEach(y => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.05, 0.08), mullMat)); m.position.set(0, y, GZ); });
  // smudges on glass
  const smC = makeCanvas(1024, 512), smx = smC.getContext('2d');
  for (let i = 0; i < 60; i++) { const x = r() * 1024, y = r() * 512, rad = 20 + r() * 90; const g = smx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,255,255,${0.025 + r() * 0.04})`); g.addColorStop(1, 'rgba(255,255,255,0)'); smx.fillStyle = g; smx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const smudge = add(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), new THREE.MeshBasicMaterial({ map: tex(smC), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x334455 })));
  smudge.position.set(0, 1.45, GZ + 0.01);

  const concreteRough = tex(grimeCanvas(512, 512, { seed: 501, base: 110, blot: 160, blotAmp: 0.35, scratches: 80 }), { srgb: false, wrap: true, rep: [8, 8] });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.32, roughnessMap: concreteRough, metalness: 0.1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85 });

  /* ---------- OPS ROOM 2 (left, behind glass) ---------- */
  const room = add(new THREE.Group());
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), floorMat); f2.rotation.x = -Math.PI / 2; f2.position.set(-1.15, 0.001, -3.85); room.add(f2);
  const c2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), wallMat); c2.rotation.x = Math.PI / 2; c2.position.set(-1.15, 2.9, -3.85); room.add(c2);
  const bw2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.9), wallMat); bw2.position.set(-1.15, 1.45, -5.75); room.add(bw2);
  const lw2 = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.9), wallMat); lw2.rotation.y = Math.PI / 2; lw2.position.set(-2.35, 1.45, -3.85); room.add(lw2);
  // glass divider between room 2 and the bay
  const div = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.9), glassMat); div.rotation.y = Math.PI / 2; div.position.set(0.05, 1.45, -3.85); room.add(div);
  [-2.0, -3.9, -5.7].forEach(z => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.9, 0.07), mullMat); m.position.set(0.05, 1.45, z); room.add(m); });
  // ceiling light strips
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 3.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.24, 0.27) })); s.position.set(-1.9 + i * 0.75, 2.88, -3.85); room.add(s); }
  const roomLight = new THREE.PointLight(0xcfe0ff, 1.2, 5, 1.5); roomLight.position.set(-1.15, 2.5, -3.6); room.add(roomLight);
  // video wall using the live screen textures
  const vw = [[screens.map, 1.25, 0.7, -1.15, 2.15], [screens.fleet, 0.62, 0.44, -2.05, 2.0], [screens.wx, 0.62, 0.44, -0.25, 2.0]];
  for (const [s, w, h, x, y] of vw) {
    const bz = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05), M.bezel); bz.position.set(x, y, -5.7); room.add(bz);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.tex, color: new THREE.Color(0.5, 0.5, 0.5) })); p.position.set(x, y, -5.67); room.add(p);
  }
  // desks + monitors + operators
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.5, metalness: 0.3 });
  const operatorMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.7 });
  const srcs = [screens.people, screens.log, screens.map, screens.fleet, screens.wx, screens.people];
  [[-3.05, 0], [-4.35, 1]].forEach(([z, row]) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.75), deskMat); d.position.set(-1.15, 0.74, z); room.add(d);
    const db = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.04), deskMat); db.position.set(-1.15, 0.37, z + 0.35); room.add(db);
    for (let k = 0; k < 3; k++) {
      const s = srcs[row * 3 + k], x = -1.85 + k * 0.7, rotY = (1 - k) * 0.25 + Math.PI;
      const mon = new THREE.Group(); mon.position.set(x, 1.08, z - 0.22); mon.rotation.y = rotY; room.add(mon);
      const bz = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.04), M.bezel); mon.add(bz);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), new THREE.MeshBasicMaterial({ map: s.tex, color: new THREE.Color(0.45, 0.45, 0.45) })); sp.position.z = -0.021; sp.rotation.y = Math.PI; mon.add(sp);
    }
    // operators sitting, facing the monitors (away from us)
    const seats = row === 0 ? [-1.5, -0.6] : [-1.2];
    for (const sx of seats) {
      const op = new THREE.Group(); op.userData.noMerge = true; op.position.set(sx, 0, z + 0.55); room.add(op);
      const chair = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.75, 0.08, 2, 0.03), operatorMat); chair.position.set(0, 0.95, 0.22); op.add(chair);
      const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.48, 2, 0.03), operatorMat); seat.position.set(0, 0.5, 0); op.add(seat);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 6, 16), new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.85 })); torso.position.set(0, 0.95, 0.05); torso.scale.set(1.15, 1, 0.75); op.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), skin); head.position.set(0, 1.37, 0.0); head.scale.set(0.9, 1.1, 1); op.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 16, 0, Math.PI * 2, 0, 1.6), operatorMat); hair.position.copy(head.position); hair.scale.copy(head.scale); hair.rotation.x = 0.5; op.add(hair);
      const hs = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 24, Math.PI), operatorMat); hs.position.set(0, 1.38, 0); op.add(hs);
      updaters.push(t => { op.rotation.y = Math.sin(t * 0.3 + sx * 4) * 0.12; head.rotation.y = Math.sin(t * 0.5 + sx) * 0.2; });
    }
  });

  /* ---------- APPARATUS BAY (right, behind glass) ---------- */
  const bay = add(new THREE.Group());
  const bf = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), floorMat); bf.rotation.x = -Math.PI / 2; bf.position.set(4.5, 0, -8); bay.add(bf);
  const bc = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), wallMat); bc.rotation.x = Math.PI / 2; bc.position.set(4.5, 5.2, -8); bay.add(bc);
  const bbw = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.2), wallMat); bbw.position.set(4.5, 2.6, -13.5); bay.add(bbw);
  const brw = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.2), wallMat); brw.rotation.y = -Math.PI / 2; brw.position.set(9.5, 2.6, -8); bay.add(brw);
  // yellow floor lines
  for (const x of [0.3, 2.5, 4.9, 7.3]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 9), new THREE.MeshStandardMaterial({ color: 0xc89a10, roughness: 0.6 })); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.003, -8); bay.add(l); }
  // roll-up bay doors with windows at the back
  const doorC = makeCanvas(512, 512), dx = doorC.getContext('2d');
  dx.fillStyle = '#3a3d42'; dx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) { dx.fillStyle = '#2a2d31'; dx.fillRect(0, y, 512, 4); dx.fillStyle = '#4a4e54'; dx.fillRect(0, y + 4, 512, 2); }
  dx.fillStyle = '#0a1a33'; for (let k = 0; k < 4; k++) dx.fillRect(40 + k * 112, 200, 90, 44);
  const doorTex = tex(doorC);
  for (const x of [1.4, 4.4, 7.4]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.8), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0.6, emissiveMap: doorTex, emissive: 0x081830, emissiveIntensity: 0.12 })); d.position.set(x, 1.9, -13.45); bay.add(d);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.5 })); fr.position.set(x, 3.9, -13.4); bay.add(fr);
  }
  // high-bay lights
  const hbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.28, 0.25) });
  for (const x of [1.4, 4.4, 7.4]) for (const z of [-4.5, -8, -11.5]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 0.25, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide })); shade.position.set(x, 4.7, z); bay.add(shade);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), hbMat); disc.rotation.x = Math.PI / 2; disc.position.set(x, 4.6, z); bay.add(disc);
  }
  [[2.6, -7.5]].forEach(([x, z]) => { const s = new THREE.SpotLight(0xfff0dc, 30, 7, 0.6, 0.9, 1.5); s.position.set(x, 4.6, z); s.target.position.set(x, 0, z); bay.add(s, s.target); });
  const bayFill = new THREE.PointLight(0xff3a20, 14, 4, 1.5); bayFill.position.set(4, 3.2, -8.5); bay.add(bayFill);

  // engines
  const engines = [makeEngine('9', 0), makeEngine('9', 1)];
  engines[0].group.position.set(2.45, 0, -6.95); engines[0].group.rotation.y = -0.12;
  engines[1].group.position.set(5.3, 0, -7.9); engines[1].group.rotation.y = 0.03;
  engines.forEach(e => bay.add(e.group));
  // red rotating wall beacons in the bay
  const wallBeacons = [];
  for (const [x, z] of [[0.3, -3.2], [6.5, -3.2], [9.4, -6]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.15) })); b.position.set(x, 3.6, z); bay.add(b); wallBeacons.push(b);
  }
  

  updaters.push(t => {
    engines.forEach((e, i) => e.update(t + i * 0.37));
    wallBeacons.forEach((b, i) => { const v = Math.max(0, Math.sin(t * 6 + i * 2)); b.material.color.setRGB(0.08 + v * 0.35, 0.01 + v * 0.03, 0.01 + v * 0.02); });
    bayFill.intensity = 1.2 + Math.max(0, Math.sin(t * 6)) * 1.3;
  });

  mergeStatic(room); mergeStatic(bay);
  // soft red spill from the bay onto the right side of the console
  const spill = new THREE.PointLight(0xff2a14, 1.6, 3.2, 2); spill.position.set(1.7, 1.9, -2.25); scene.add(spill);
  updaters.push(t => { spill.intensity = 0.12 + Math.max(0, Math.sin(t * 6)) * 0.15; });
  return { update: (t, dt) => updaters.forEach(f => f(t, dt)) };

  /* ---------- engine model ---------- */
  function makeEngine(num, variant) {
    const g = new THREE.Group();
    const red = new THREE.MeshPhysicalMaterial({ color: 0x9c0a06, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.05, clearcoat: 1 });
    const L = 9.2, W = 2.5;
    const cab = new THREE.Mesh(new RoundedBoxGeometry(W, 2.0, 2.6, 4, 0.14), red); cab.position.set(0, 1.55, L / 2 - 1.3); g.add(cab);
    const body = new THREE.Mesh(new RoundedBoxGeometry(W, 2.35, L - 2.7, 3, 0.08), red); body.position.set(0, 1.72, -1.35); g.add(body);
    const wind = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), dark); wind.position.set(0, 2.0, L / 2 + 0.005); g.add(wind);
    [-1, 1].forEach(s => { const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.7), dark); sw.rotation.y = s * Math.PI / 2; sw.position.set(s * (W / 2 + 0.005), 2.0, L / 2 - 1.3); g.add(sw); });
    const bump = new THREE.Mesh(new RoundedBoxGeometry(W + 0.1, 0.32, 0.3, 2, 0.05), chrome); bump.position.set(0, 0.55, L / 2 + 0.08); g.add(bump);
    const grill = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.55), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.25 })); grill.position.set(0, 1.0, L / 2 + 0.006); g.add(grill);
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.38, 0.32) });
    [-0.95, -0.7, 0.7, 0.95].forEach(x => { const h = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), headMat); h.position.set(x, 0.95, L / 2 + 0.008); g.add(h); });
    // light bar
    const lbL = new THREE.MeshBasicMaterial({ color: 0xff0000 }), lbR = new THREE.MeshBasicMaterial({ color: 0xff0000 }), lbW = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lb = [lbL, lbW, lbR];
    lb.forEach((m, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.13, 0.28), m); b.position.set(-0.65 + i * 0.65, 2.62, L / 2 - 0.4); g.add(b); });
    // side warning lights + stripe + compartments
    const sideRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xf2e6c0, roughness: 0.35, metalness: 0.3, emissive: 0x332a18, emissiveIntensity: 0.4 });
    const rollC = makeCanvas(256, 256), rx = rollC.getContext('2d'); rx.fillStyle = '#b8bcc2'; rx.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 10) { rx.fillStyle = '#8a8e94'; rx.fillRect(0, y, 256, 3); }
    const rollTex = tex(rollC);
    [-1, 1].forEach(s => {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, L - 0.4), stripe); st.position.set(s * (W / 2 + 0.006), 1.05, -0.1); g.add(st);
      for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.35), new THREE.MeshStandardMaterial({ map: rollTex, metalness: 0.9, roughness: 0.3 })); d.rotation.y = s * Math.PI / 2; d.position.set(s * (W / 2 + 0.008), 2.0, -0.4 - k * 1.45); g.add(d); }
      for (const z of [L / 2 - 0.1, -L / 2 + 0.15]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), sideRed); w.position.set(s * (W / 2 + 0.01), 2.55, z); g.add(w); }
      // big number decal
      const nc = makeCanvas(256, 256), nx = nc.getContext('2d'); nx.clearRect(0, 0, 256, 256); nx.fillStyle = '#f4ecd2'; nx.font = `700 230px ${FONTS.head}`; nx.textAlign = 'center'; nx.textBaseline = 'middle'; nx.fillText(num, 128, 140); nx.strokeStyle = '#c9a24a'; nx.lineWidth = 6; nx.strokeText(num, 128, 140);
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: tex(nc), transparent: true, roughness: 0.4 })); nm.rotation.y = s * Math.PI / 2; nm.position.set(s * (W / 2 + 0.012), 1.75, L / 2 - 1.5); g.add(nm);
    });
    // front number on cab
    const fc = makeCanvas(512, 128), fx = fc.getContext('2d'); fx.fillStyle = '#f4ecd2'; fx.font = `700 70px ${FONTS.head}`; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.fillText(variant ? 'LADDER 9' : 'ENGINE 9', 256, 64);
    const fn = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: tex(fc), transparent: true, color: 0x3a3a3a })); fn.position.set(0, 2.5, L / 2 + 0.006); g.add(fn);
    // wheels
    for (const z of [L / 2 - 1.4, -L / 2 + 2.2, -L / 2 + 1.0]) for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.4, 32), M.rubber); w.rotation.z = Math.PI / 2; w.position.set(s * (W / 2 - 0.1), 0.52, z); g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 24), chrome); hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); g.add(hub);
    }
    if (variant) {
      const lad = new THREE.Group(); lad.position.set(0, 3.05, -1.2); g.add(lad);
      [-0.45, 0.45].forEach(x => { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 8.5), chrome); rail.position.x = x; lad.add(rail); });
      for (let k = 0; k < 24; k++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), chrome); rung.rotation.z = Math.PI / 2; rung.position.z = -4.1 + k * 0.36; lad.add(rung); }
    }
    return {
      group: g,
      update(t) {
        const a = Math.floor(t * 5) % 2, b = Math.floor(t * 7.5) % 3;
        lbL.color.setRGB(a ? 0.55 : 0.06, 0, 0); lbR.color.setRGB(a ? 0.06 : 0.55, 0, 0); lbW.color.setScalar(b === 0 ? 0.4 : 0.06);
        sideRed.color.setRGB(Math.floor(t * 4) % 2 ? 0.6 : 0.06, 0, 0);
      },
    };
  }
}
