import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, tex, FONTS, rng, grimeCanvas, dotMatrix } from './textures.js';
import { mergeStatic } from './merge.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildProps({ scene, M, sim, reg }) {
  const updaters = [];
  const out = {};
  const r = rng(77);
  const add = (obj, parent = scene) => { parent.add(obj); return obj; };
  const shadow = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  /* ---------------- ROOM ---------------- */
  const wallTex = tex(grimeCanvas(512, 512, { base: 120, seed: 31, blot: 90, blotAmp: 0.2 }), { srgb: false, wrap: true, rep: [3, 2] });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.92, roughnessMap: wallTex });
  // acoustic panels pattern
  const acc = makeCanvas(512, 512), ax = acc.getContext('2d');
  ax.fillStyle = '#16191d'; ax.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { ax.fillStyle = (i + j) % 2 ? '#121418' : '#15181c'; ax.fillRect(i * 128 + 3, j * 128 + 3, 122, 122); }
  const accMap = tex(acc, { wrap: true, rep: [4, 2] });
  const panelWallMat = new THREE.MeshStandardMaterial({ map: accMap, color: 0x8a8f98, roughness: 0.95 });

  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7, roughnessMap: tex(grimeCanvas(512, 512, { seed: 8, base: 110 }), { srgb: false, wrap: true, rep: [6, 6] }) })));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), wallMat)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.9;
  const lw = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 2.9), panelWallMat)); lw.position.set(-2.3, 1.45, 0.5); lw.rotation.y = Math.PI / 2; lw.receiveShadow = true;
  const rw = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 2.9), panelWallMat)); rw.position.set(2.3, 1.45, 0.5); rw.rotation.y = -Math.PI / 2; rw.receiveShadow = true;
  const fw = add(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), wallMat)); fw.position.set(0, 1.45, 3.2); fw.rotation.y = Math.PI;
  /* ---------------- LED TICKER ---------------- */
  const tickerMsg = '   ★ METRO FIRE DEPT ★  RED FLAG WARNING IN EFFECT UNTIL 2000 HRS  ·  WINDS SW 15 G25  ·  HUMIDITY 17%  ·  LADDER 4 OUT OF SERVICE  ·  STAGING AT STATION 4  ·  STAY SAFE · EVERYONE GOES HOME  ';
  const dm = dotMatrix(tickerMsg, { rows: 16, cell: 6, font: FONTS.head, weight: 700 });
  const tickTex = tex(dm, { wrap: true }); tickTex.wrapT = THREE.ClampToEdgeWrapping;
  const tickerW = 1.12, tickerH = 0.125;
  tickTex.repeat.set((tickerW / tickerH) * dm.height / dm.width, 1);
  const tickerGroup = add(new THREE.Group()); tickerGroup.position.set(0, 1.86, -0.86); tickerGroup.rotation.x = 0.08;
  const tbody = new THREE.Mesh(new RoundedBoxGeometry(tickerW + 0.08, tickerH + 0.06, 0.07, 2, 0.01), M.bezel); tbody.position.z = -0.035; tickerGroup.add(tbody);
  const tplane = new THREE.Mesh(new THREE.PlaneGeometry(tickerW, tickerH), new THREE.MeshBasicMaterial({ map: tickTex, color: new THREE.Color(3.2, 3.2, 3.2) })); tplane.position.z = 0.001; tickerGroup.add(tplane);
  [-0.5, 0.5].forEach(x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.0), M.steel); c.position.set(x, 0.56, -0.03); tickerGroup.add(c); });
  const tglow = new THREE.PointLight(0xff2a10, 0.25, 0.9, 2); tglow.position.z = 0.12; tickerGroup.add(tglow);
  updaters.push((t, dt) => { tickTex.offset.x += dt * 0.028; });

  /* ---------------- CEILING LIGHTS ---------------- */
  const troffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.45, 0.6) });
  out.troffers = [];
  [[-1.1, 0.2], [1.1, 0.2], [0, 1.6]].forEach(([x, z]) => {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.14), troffMat)); m.position.set(x, 2.89, z); out.troffers.push(m);
  });
  out.troffMat = troffMat;

  /* ---------------- BEACON ---------------- */
  const beacon = add(new THREE.Group()); beacon.position.set(1.72, 2.12, -1.55);
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 32), M.black); beacon.add(bBase);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.4), M.steel); bracket.position.set(0, -0.035, -0.2); beacon.add(bracket);
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xff2010, emissive: 0xff1800, emissiveIntensity: 0.2, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.055, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.position.y = 0.025; dome.scale.y = 1.6; beacon.add(dome);
  const rot = new THREE.Group(); rot.position.y = 0.06; beacon.add(rot);
  const refl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.004), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, emissive: 0xff3010, emissiveIntensity: 0 })); refl.position.z = -0.012; rot.add(refl);
  const bSpot = new THREE.SpotLight(0xff1a08, 0, 9, 0.42, 0.6, 1.3); bSpot.position.set(0, 0, 0); rot.add(bSpot);
  const bTarget = new THREE.Object3D(); bTarget.position.set(0, -0.35, 2); rot.add(bTarget); bSpot.target = bTarget;
  const bSpot2 = new THREE.SpotLight(0xff1a08, 0, 9, 0.42, 0.6, 1.3); rot.add(bSpot2);
  const bTarget2 = new THREE.Object3D(); bTarget2.position.set(0, -0.35, -2); rot.add(bTarget2); bSpot2.target = bTarget2;
  const beamLen = 2.2, beamMats = [];
  [1, -1].forEach(dir => {
    const g = new THREE.ConeGeometry(0.55, beamLen, 32, 1, true); g.translate(0, -beamLen / 2, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { k: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y/' + beamLen.toFixed(2) + '; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float k; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.0); float a = pow(clamp(1.0 - vY, 0.0, 1.0), 2.2) * f * k * smoothstep(0.0, 0.05, vY); gl_FragColor = vec4(vec3(1.0, 0.12, 0.05)*a, a); }',
    });
    const cone = new THREE.Mesh(g, m); cone.rotation.x = dir > 0 ? -Math.PI / 2 + 0.17 : Math.PI / 2 - 0.17; rot.add(cone); beamMats.push(m);
  });
  out.beaconOn = 0;
  updaters.push((t, dt) => {
    const want = (sim.warning || sim.evac || sim.pending || out.beaconTest) ? 1 : 0;
    out.beaconOn += (want - out.beaconOn) * Math.min(1, dt * 4);
    rot.rotation.y += dt * 7.5 * out.beaconOn;
    bSpot.intensity = bSpot2.intensity = out.beaconOn * 6;
    domeMat.emissiveIntensity = 0.05 + out.beaconOn * (0.35 + Math.max(0, Math.sin(rot.rotation.y * 2)) * 0.5);
    refl.material.emissiveIntensity = out.beaconOn * 0.5;
    beamMats.forEach(m => { m.uniforms.k.value = out.beaconOn * 0.05; });
  });

  /* ---------------- SERVER RACK ---------------- */
  const rack = add(new THREE.Group()); rack.position.set(-2.05, 0, -1.0); rack.rotation.y = Math.PI / 2;
  const rackBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.0, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.4, metalness: 0.6 })); rackBody.position.y = 1.0; rack.add(rackBody);
  const ledN = 260, ledGeo = new THREE.BoxGeometry(0.006, 0.004, 0.002), ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, ledN); rack.add(leds);
  const dummy = new THREE.Object3D(), ledCols = [new THREE.Color(0.1, 2.2, 0.6), new THREE.Color(2.4, 1.2, 0.1), new THREE.Color(0.2, 0.9, 2.6), new THREE.Color(2.6, 0.2, 0.1)], dark = new THREE.Color(0.02, 0.02, 0.02);
  const ledState = [];
  for (let i = 0; i < ledN; i++) {
    const row = Math.floor(i / 13), col = i % 13;
    dummy.position.set(-0.24 + col * 0.018 + (col > 6 ? 0.08 : 0), 0.25 + row * 0.08, 0.252); dummy.updateMatrix(); leds.setMatrixAt(i, dummy.matrix);
    ledState.push({ c: ledCols[r() < 0.7 ? 0 : r() < 0.6 ? 2 : r() < 0.7 ? 1 : 3], rate: 0.5 + r() * 8, ph: r() * 10 });
    leds.setColorAt(i, ledState[i].c);
  }
  // rack unit faceplates
  for (let k = 0; k < 22; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: k % 3 ? 0x17191d : 0x1e2126, roughness: 0.5, metalness: 0.5 })); p.position.set(0, 0.25 + k * 0.08, 0.247); rack.add(p); }
  updaters.push(t => {
    for (let i = 0; i < ledN; i++) { const s = ledState[i]; leds.setColorAt(i, Math.sin(t * s.rate + s.ph) > -0.2 || s.rate < 1 ? s.c : dark); }
    leds.instanceColor.needsUpdate = true;
  });

  /* ---------------- EXTINGUISHER ---------------- */
  const ext = add(new THREE.Group()); ext.position.set(2.2, 0.45, -1.2);
  const red = new THREE.MeshPhysicalMaterial({ color: 0xa50d0d, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 32), red); ext.add(cyl);
  const capE = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), red); capE.position.y = 0.25; ext.add(capE);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08), M.chrome); valve.position.y = 0.34; ext.add(valve);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.03), M.black); handle.position.set(0.03, 0.39, 0); handle.rotation.z = -0.15; ext.add(handle);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.02, 0.34, 0), V(-0.1, 0.3, 0.02), V(-0.1, 0, 0.05), V(-0.08, -0.15, 0.06)]), 20, 0.009, 8), M.rubber); ext.add(hose);
  const lbl = makeCanvas(256, 256), lx = lbl.getContext('2d'); lx.fillStyle = '#f2efe6'; lx.fillRect(0, 0, 256, 256); lx.fillStyle = '#111'; lx.font = `700 34px ${FONTS.label}`; lx.textAlign = 'center'; lx.fillText('FIRE', 128, 70); lx.fillText('EXTINGUISHER', 128, 110); lx.font = `600 24px ${FONTS.label}`; lx.fillText('CLASS A · B · C', 128, 160); lx.fillStyle = '#c00'; lx.fillRect(30, 190, 196, 20);
  const lblM = new THREE.Mesh(new THREE.CylinderGeometry(0.0755, 0.0755, 0.18, 32, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({ map: tex(lbl), roughness: 0.6 })); lblM.position.y = 0.02; lblM.rotation.y = -Math.PI / 2; ext.add(lblM);
  ext.rotation.y = -Math.PI / 2;
  shadow(ext);
  const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshStandardMaterial({ map: (() => { const c = makeCanvas(300, 120), x = c.getContext('2d'); x.fillStyle = '#b5100f'; x.fillRect(0, 0, 300, 120); x.fillStyle = '#fff'; x.font = `700 40px ${FONTS.label}`; x.textAlign = 'center'; x.fillText('FIRE', 150, 52); x.font = `600 28px ${FONTS.label}`; x.fillText('EXTINGUISHER ▼', 150, 96); return tex(c); })(), roughness: 0.5, emissive: 0x330000 })));
  sign.position.set(2.29, 1.12, -1.2); sign.rotation.y = -Math.PI / 2;

  /* ---------------- DESK PROPS ---------------- */
  const DESK = 0.74;

  // Coffee mug
  const mug = add(new THREE.Group()); mug.position.set(-0.68, DESK, 0.13); mug.rotation.y = 0.6;
  const prof = [[0, 0], [0.036, 0], [0.039, 0.003], [0.0405, 0.012], [0.041, 0.09], [0.0418, 0.097], [0.037, 0.098], [0.036, 0.092], [0.035, 0.012], [0, 0.01]].map(([a, b]) => new THREE.Vector2(a, b));
  const logoC = makeCanvas(1024, 256), lgx = logoC.getContext('2d');
  lgx.fillStyle = '#7a0d0b'; lgx.fillRect(0, 0, 1024, 256);
  lgx.save(); lgx.translate(0, 256); lgx.scale(1, -1);
  lgx.fillStyle = '#f4e9d6'; lgx.font = `700 34px ${FONTS.head}`; lgx.textAlign = 'center'; lgx.textBaseline = 'middle';
  for (const [x, s] of [[256, 'STATION 7'], [768, 'NIGHT SHIFT']]) { lgx.fillText(s, x, 96); }
  lgx.restore();
  const mugMat = new THREE.MeshPhysicalMaterial({ map: tex(logoC), roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const mugBody = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), mugMat); mug.add(mugBody);
  const mugIn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.002, 48), new THREE.MeshPhysicalMaterial({ color: 0x140804, roughness: 0.04, clearcoat: 1 })); mugIn.position.y = 0.078; mug.add(mugIn);
  const mh = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0065, 16, 32, Math.PI), mugMat); mh.rotation.z = -Math.PI / 2; mh.position.set(0.04, 0.05, 0); mug.add(mh);
  shadow(mug);
  // steam
  const steamC = makeCanvas(128, 128), sx = steamC.getContext('2d');
  const sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64); sg.addColorStop(0, 'rgba(255,255,255,0.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
  const steamTex = tex(steamC);
  const steam = [];
  for (let i = 0; i < 10; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: 0xd8d0c8, transparent: true, opacity: 0, depthWrite: false }));
    sm.userData = { ph: i / 10, dx: (r() - 0.5) * 0.03, sp: 0.8 + r() * 0.5 }; mug.add(sm); steam.push(sm);
  }
  updaters.push((t) => {
    for (const s of steam) {
      const p = (t * 0.12 * s.userData.sp + s.userData.ph) % 1;
      s.position.set(Math.sin(t * 1.3 + s.userData.ph * 9) * 0.012 * p + s.userData.dx * p, 0.1 + p * 0.22, Math.cos(t + s.userData.ph * 5) * 0.01 * p);
      const sc = 0.02 + p * 0.09; s.scale.set(sc, sc * 1.4, sc);
      s.material.opacity = Math.sin(p * Math.PI) * 0.09; s.material.rotation = p * 2 + s.userData.ph * 6;
    }
  });

  // Fire helmet (traditional style: tall dome, combs, short front brim, long rear tail)
  const helmet = add(new THREE.Group()); helmet.position.set(0.98, DESK, 0.1); helmet.rotation.y = Math.PI - 0.55;
  const hGrime = tex(grimeCanvas(512, 512, { seed: 44, base: 90, blot: 120, blotAmp: 0.3, scratches: 160 }), { srgb: false });
  const hMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.3, roughnessMap: hGrime, clearcoat: 1, clearcoatRoughness: 0.18 });
  const HY = 0.03;
  const domeH = new THREE.Mesh(new THREE.SphereGeometry(0.1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), hMat); domeH.scale.set(1, 1.28, 1.17); domeH.position.y = HY; helmet.add(domeH);
  for (let k = -3; k <= 3; k++) { if (!k) continue; const rib = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0032, 8, 48, Math.PI), hMat); rib.rotation.y = Math.PI / 2 + k * 0.2; rib.scale.set(1.17, 1.28, 1); rib.position.y = HY; helmet.add(rib); }
  const comb = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 10, 48, Math.PI), hMat); comb.rotation.y = Math.PI / 2; comb.scale.set(1.18, 1.3, 1); comb.position.y = HY; helmet.add(comb);
  // brim
  const SEG = 128, RINGS = 6, bpos = [], bidx = [], outerPts = [];
  for (let i = 0; i <= SEG; i++) {
    const th = i / SEG * Math.PI * 2, back = Math.pow((1 - Math.cos(th)) / 2, 1.7);
    const ix = Math.sin(th) * 0.099, iz = -Math.cos(th) * 0.1165;
    const outer = 0.14 + 0.115 * back, ox = Math.sin(th) * outer, oz = -Math.cos(th) * outer * 1.04;
    for (let j = 0; j <= RINGS; j++) {
      const t = j / RINGS, y = HY - t * t * (0.008 + 0.05 * back) + (1 - back) * t * 0.004;
      bpos.push(ix + (ox - ix) * t, y, iz + (oz - iz) * t);
      if (j === RINGS) outerPts.push(new V(ox, y, oz));
    }
  }
  function V(x, y, z) { return new THREE.Vector3(x, y, z); }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RINGS; j++) { const a = i * (RINGS + 1) + j, b = a + RINGS + 1; bidx.push(a, b, a + 1, b, b + 1, a + 1); }
  const brimG = new THREE.BufferGeometry(); brimG.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); brimG.setIndex(bidx); brimG.computeVertexNormals();
  const brimMat = hMat.clone(); brimMat.side = THREE.DoubleSide;
  helmet.add(new THREE.Mesh(brimG, brimMat));
  const edge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outerPts, true), 160, 0.0042, 8, true), new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.35, metalness: 0.2, emissive: 0x2a2000, emissiveIntensity: 0.3 }));
  helmet.add(edge);
  // leather front shield
  const shC = makeCanvas(256, 300), shx = shC.getContext('2d');
  shx.fillStyle = '#8a0f0d'; shx.beginPath(); shx.moveTo(128, 6); shx.quadraticCurveTo(250, 30, 244, 150); shx.quadraticCurveTo(230, 270, 128, 294); shx.quadraticCurveTo(26, 270, 12, 150); shx.quadraticCurveTo(6, 30, 128, 6); shx.fill();
  shx.strokeStyle = '#d8c48a'; shx.lineWidth = 7; shx.stroke();
  shx.fillStyle = '#f1ecd9'; shx.textAlign = 'center'; shx.font = `700 40px ${FONTS.head}`; shx.fillText('ENGINE', 128, 82);
  shx.font = `700 124px ${FONTS.head}`; shx.fillText('7', 128, 204); shx.font = `700 28px ${FONTS.head}`; shx.fillText('FIRE RESCUE', 128, 252);
  const shTex = tex(shC);
  const shieldG = new THREE.Group(); shieldG.position.set(0, HY + 0.07, -0.113); shieldG.rotation.y = Math.PI; helmet.add(shieldG);
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.088), new THREE.MeshStandardMaterial({ map: shTex, roughness: 0.6, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  shield.rotation.x = -0.42; shieldG.add(shield);
  const eagle = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 })); eagle.scale.set(1.4, 1, 0.6); eagle.position.set(0, 0.052, -0.014); shieldG.add(eagle);
  shadow(helmet);

  // Portable radio in charger
  const radio = add(new THREE.Group()); radio.position.set(-0.86, DESK, -0.02); radio.rotation.y = 0.35;
  const chg = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.04, 0.07, 3, 0.008), M.bezel); chg.position.y = 0.02; radio.add(chg);
  const cled = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.4) })); cled.position.set(0.03, 0.03, 0.035); radio.add(cled);
  const rb = new THREE.Group(); rb.position.set(0, 0.035, -0.002); rb.rotation.x = -0.12; radio.add(rb);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.82, roughnessMap: hGrime });
  const rbody = new THREE.Mesh(new RoundedBoxGeometry(0.062, 0.14, 0.04, 4, 0.01), rubber); rbody.position.y = 0.07; rb.add(rbody);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.13, 12), rubber); ant.position.set(-0.018, 0.2, 0); rb.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), rubber); antTip.position.set(-0.018, 0.265, 0); rb.add(antTip);
  const knobR = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 16), M.black); knobR.position.set(0.015, 0.15, 0); rb.add(knobR);
  const rledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.1, 0.1) });
  const rled = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 12, 8), rledMat); rled.position.set(0.0, 0.142, 0.012); rb.add(rled);
  const lcdC = makeCanvas(160, 64), lcx = lcdC.getContext('2d');
  const lcdTex = tex(lcdC);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.018), new THREE.MeshBasicMaterial({ map: lcdTex, color: new THREE.Color(1.4, 1.4, 1.4) })); lcd.position.set(0, 0.115, 0.0201); rb.add(lcd);
  const grillR = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.045), new THREE.MeshStandardMaterial({ map: (() => { const c = makeCanvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#161616'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#050505'; for (let i = 0; i < 9; i++) x.fillRect(8, 10 + i * 13, 112, 6); return tex(c); })(), roughness: 0.9 })); grillR.position.set(0, 0.055, 0.0201); rb.add(grillR);
  // PTT side
  const ptt = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.035, 0.018, 2, 0.002), M.black); ptt.position.set(-0.033, 0.09, 0); rb.add(ptt);
  shadow(radio);
  let lcdAcc = 0;
  updaters.push((t, dt) => {
    const on = sim.chatter && Math.floor(t * 8) % 2;
    rledMat.color.setRGB(on ? 0.2 : 0.05, on ? 3 : 0.05, on ? 0.3 : 0.05);
    lcdAcc += dt; if (lcdAcc > 0.5) {
      lcdAcc = 0; lcx.fillStyle = '#0d1a08'; lcx.fillRect(0, 0, 160, 64); lcx.fillStyle = '#9dff5a'; lcx.font = `30px ${FONTS.mono}`; lcx.textBaseline = 'middle';
      lcx.fillText(['DISP', 'TAC-1', 'TAC-2', 'TAC-3', 'FGND', 'M-AID'][sim.radioCh], 8, 26); lcx.font = `18px ${FONTS.mono}`; lcx.fillText(sim.chatter ? 'RX ▮▮▮▮' : 'SCAN ▮▮▮', 8, 52); lcdTex.needsUpdate = true;
    }
  });

  // Folded paper street map with pen (front right)
  const mp = add(new THREE.Group()); mp.position.set(0.74, DESK + 0.001, 0.25); mp.rotation.y = -0.32;
  const mc = makeCanvas(1024, 768), mx = mc.getContext('2d');
  mx.fillStyle = '#e6dfcc'; mx.fillRect(0, 0, 1024, 768);
  mx.fillStyle = '#cfe0c2'; for (let i = 0; i < 9; i++) mx.fillRect(r() * 1000, r() * 740, 40 + r() * 90, 30 + r() * 70);
  mx.fillStyle = '#b9d3e6'; mx.beginPath(); mx.moveTo(0, 520); for (let x = 0; x <= 1024; x += 16) mx.lineTo(x, 520 - x * 0.18 + Math.sin(x / 90) * 18); for (let x = 1024; x >= 0; x -= 16) mx.lineTo(x, 556 - x * 0.18 + Math.sin(x / 90) * 18); mx.fill();
  mx.strokeStyle = '#ffffff'; mx.lineWidth = 7; for (let i = 0; i < 16; i++) { const x = 30 + i * 64 + r() * 10; mx.beginPath(); mx.moveTo(x, 0); mx.lineTo(x + 20, 768); mx.stroke(); }
  for (let j = 0; j < 11; j++) { const y = 20 + j * 70 + r() * 10; mx.beginPath(); mx.moveTo(0, y); mx.lineTo(1024, y - 15); mx.stroke(); }
  mx.strokeStyle = '#f2c14a'; mx.lineWidth = 12; mx.beginPath(); mx.moveTo(0, 160); mx.bezierCurveTo(400, 100, 600, 600, 1024, 520); mx.stroke();
  mx.strokeStyle = '#999'; mx.lineWidth = 1; for (let i = 0; i < 16; i++) { mx.beginPath(); mx.moveTo(30 + i * 64, 0); mx.lineTo(50 + i * 64, 768); mx.stroke(); }
  mx.fillStyle = '#333'; mx.font = `600 18px ${FONTS.label}`; for (let i = 0; i < 40; i++) mx.fillText(['OAK', 'ELM', 'PINE', 'MAIN', '3RD', '5TH', 'RIDGE', 'CANAL'][i % 8], r() * 980, r() * 760);
  mx.strokeStyle = '#c4161c'; mx.lineWidth = 5; mx.beginPath(); mx.arc(610, 330, 34, 0, 7); mx.stroke(); mx.beginPath(); mx.moveTo(380, 600); mx.lineTo(600, 360); mx.stroke();
  mx.fillStyle = '#c4161c'; mx.font = `600 34px ${FONTS.hand}`; mx.fillText('stage here →', 380, 640);
  // fold creases
  mx.fillStyle = 'rgba(0,0,0,0.08)'; mx.fillRect(510, 0, 4, 768); mx.fillRect(0, 380, 1024, 3);
  const mapTex = tex(mc);
  const mapMat = new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.88, color: 0xa8a8a8 });
  const half = (u0, ang, x) => { const g = new THREE.PlaneGeometry(0.17, 0.25); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5); const m = new THREE.Mesh(g, mapMat); m.rotation.x = -Math.PI / 2; m.rotation.y = ang; m.position.set(x, Math.abs(ang) * 0.04, 0); m.receiveShadow = true; m.castShadow = true; mp.add(m); };
  half(0, 0.0, -0.085); half(0.5, -0.06, 0.085);
  const pen2 = new THREE.Group(); pen2.position.set(0.02, 0.006, 0.03); pen2.rotation.y = 0.7; mp.add(pen2);
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 16), new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.25, clearcoat: 1 })); pb.rotation.z = Math.PI / 2; pen2.add(pb);
  const pc2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.035, 16), M.chrome); pc2.rotation.z = Math.PI / 2; pc2.position.x = 0.05; pen2.add(pc2);
  const ptip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 16), M.chrome); ptip.rotation.z = Math.PI / 2; ptip.position.x = -0.071; pen2.add(ptip);
  shadow(mp);

  // Spiral notebook with handwritten notes (front left)
  const nb = add(new THREE.Group()); nb.position.set(-0.6, DESK, 0.26); nb.rotation.y = 0.28;
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.01, 0.27, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.7 })); cover.position.y = 0.005; nb.add(cover);
  const ncv = makeCanvas(600, 800), ncx = ncv.getContext('2d');
  ncx.fillStyle = '#ece6d6'; ncx.fillRect(0, 0, 600, 800);
  ncx.strokeStyle = '#9db4cf'; ncx.lineWidth = 1.5; for (let i = 0; i < 24; i++) { ncx.beginPath(); ncx.moveTo(0, 90 + i * 30); ncx.lineTo(600, 90 + i * 30); ncx.stroke(); }
  ncx.strokeStyle = '#d58a8a'; ncx.beginPath(); ncx.moveTo(70, 0); ncx.lineTo(70, 800); ncx.stroke();
  ncx.fillStyle = '#1d2a66'; ncx.font = `600 30px ${FONTS.hand}`;
  ['B-SHIFT  10/28', 'E4 brush — 1 ac, contained', 'H-0412 low psi → water dept', 'L4 hydraulics, OOS til Thu', 'PAR 1505 ok', 'red flag — stage E5 @ Sta 4', 'call BC re: mutual aid', 'coffee machine (again)'].forEach((t, i) => ncx.fillText(t, 84, 84 + i * 60));
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.255), new THREE.MeshStandardMaterial({ map: tex(ncv), roughness: 0.9, color: 0xa0a0a0 })); page.rotation.x = -Math.PI / 2; page.position.set(0, 0.0105, 0.004); nb.add(page);
  for (let k = 0; k < 15; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0009, 6, 16), M.steel); ring.rotation.y = Math.PI / 2; ring.position.set(-0.088 + k * 0.0125, 0.01, -0.13); nb.add(ring); }
  const pen = new THREE.Group(); pen.position.set(0.05, 0.016, 0.02); pen.rotation.y = -0.5; nb.add(pen);
  const pb3 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 16), new THREE.MeshPhysicalMaterial({ color: 0x0b2a7a, roughness: 0.3, clearcoat: 1 })); pb3.rotation.z = Math.PI / 2; pen.add(pb3);
  const clipP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.002, 0.003), M.chrome); clipP.position.set(0.045, 0.004, 0); pen.add(clipP);
  shadow(nb);

  // Headset
  const hs = add(new THREE.Group()); hs.position.set(-0.98, DESK + 0.018, 0.17); hs.rotation.set(-Math.PI / 2 + 0.05, 0, 0.5);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 12, 48, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.5 })); hs.add(band);
  [-1, 1].forEach(s => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 32), new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.55 })); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.075, -0.005, 0); hs.add(cup);
    const pad = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.01, 12, 32), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 })); pad.rotation.y = Math.PI / 2; pad.position.set(s * 0.06, -0.005, 0); hs.add(pad);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.01, 24), new THREE.MeshStandardMaterial({ color: 0xff3d1e, emissive: 0xff3d1e, emissiveIntensity: 0.3 })); dot.rotation.y = s * Math.PI / 2; dot.position.set(s * 0.0905, -0.005, 0); hs.add(dot);
  });
  const boom = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.08, -0.01, 0.01), V(-0.07, -0.05, 0.05), V(-0.03, -0.08, 0.07)]), 16, 0.0025, 8), M.black); hs.add(boom);
  shadow(hs);

  // Toy fire truck on the glareshield
  const truck = new THREE.Group(); truck.position.set(0.38, 0, 0); truck.rotation.y = -0.4; truck.scale.setScalar(0.9);
  const tRed = new THREE.MeshPhysicalMaterial({ color: 0xb00c08, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const tb = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.032, 0.04, 2, 0.004), tRed); tb.position.y = 0.024; truck.add(tb);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.03, 0.04, 2, 0.005), tRed); cab.position.set(0.064, 0.03, 0); truck.add(cab);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.013), new THREE.MeshPhysicalMaterial({ color: 0x0a1520, roughness: 0.05 })); win.position.set(0.0821, 0.036, 0); win.rotation.y = Math.PI / 2; truck.add(win);
  const chromeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.004, 0.041), M.chrome); chromeStrip.position.y = 0.012; truck.add(chromeStrip);
  for (const [x, z] of [[-0.035, 1], [-0.035, -1], [0.06, 1], [0.06, -1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 20), M.rubber); w.rotation.x = Math.PI / 2; w.position.set(x, 0.011, z * 0.021); truck.add(w); }
  const ladder = new THREE.Group(); ladder.position.set(-0.005, 0.044, 0); ladder.rotation.z = 0.08; truck.add(ladder);
  [-1, 1].forEach(s => { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.003, 0.003), M.chrome); rail.position.z = s * 0.009; ladder.add(rail); });
  for (let k = 0; k < 9; k++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.018), M.chrome); rung.rotation.x = Math.PI / 2; rung.position.x = -0.055 + k * 0.0137; ladder.add(rung); }
  const lbR = new THREE.MeshBasicMaterial({ color: 0x300000 }), lbB = new THREE.MeshBasicMaterial({ color: 0x000030 });
  const lb1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.012), lbR); lb1.position.set(0.064, 0.048, 0.008); truck.add(lb1);
  const lb2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.012), lbB); lb2.position.set(0.064, 0.048, -0.008); truck.add(lb2);
  shadow(truck);
  updaters.push(t => { const a = Math.floor(t * 6) % 2; lbR.color.setRGB(a ? 4 : 0.2, 0, 0); lbB.color.setRGB(0, 0.1, a ? 0.2 : 4); });
  out.truck = truck;

  // Sticky notes (attached later to monitors)
  out.sticky = (text, color = '#ffe066', rotZ = 0.08) => {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(0,0,0,0.08)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#1b1b4a'; x.font = `600 40px ${FONTS.hand}`; x.textAlign = 'center';
    text.split('\n').forEach((l, i, a) => x.fillText(l, 128, 128 + (i - (a.length - 1) / 2) * 44));
    const geo = new THREE.PlaneGeometry(0.075, 0.075, 6, 6);
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) p.setZ(i, (y * y) * 4); } geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.92, side: THREE.DoubleSide }));
    m.rotation.z = rotZ; m.castShadow = true; return m;
  };

  /* ---------------- DESK LAMP ---------------- */
  const lamp = add(new THREE.Group()); lamp.position.set(-1.18, DESK, -0.05);
  const lampMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1d20, roughness: 0.35, metalness: 0.8, clearcoat: 0.4 });
  const lbase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.022, 48), lampMat); lbase.position.y = 0.011; lamp.add(lbase);
  const pts = [V(0, 0.02, 0), V(0, 0.2, 0), V(0.03, 0.36, 0.03), V(0.12, 0.44, 0.08), V(0.22, 0.43, 0.13)];
  const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.008, 12), lampMat); lamp.add(arm);
  // gooseneck rings
  const curve = new THREE.CatmullRomCurve3(pts);
  for (let i = 1; i < 40; i++) { const p = curve.getPoint(i / 40), tg = curve.getTangent(i / 40); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0015, 6, 16), lampMat); ring.position.copy(p); ring.lookAt(p.clone().add(tg)); lamp.add(ring); }
  const head = new THREE.Group(); head.position.set(0.22, 0.43, 0.13); lamp.add(head);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.065, 0.1, 48, 1, true), lampMat); shade.material = lampMat.clone(); shade.material.side = THREE.DoubleSide;
  const shadeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.064, 0.099, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff2e0, emissive: 0xffc78a, emissiveIntensity: 0.3, side: THREE.BackSide }));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.4) })); bulb.position.y = -0.02;
  const headInner = new THREE.Group(); headInner.add(shade, shadeInner, bulb); head.add(headInner);
  // aim head toward desk target
  const lampTarget = V(-0.62, DESK, 0.08);
  lamp.updateMatrixWorld(true);
  head.lookAt(lampTarget); headInner.rotation.x = -Math.PI / 2;
  head.updateMatrixWorld(true);
  const lampLight = new THREE.SpotLight(0xffc88a, 1.15, 4, 0.72, 0.65, 1.6);
  lampLight.castShadow = true; lampLight.shadow.mapSize.set(2048, 2048); lampLight.shadow.bias = -0.0002; lampLight.shadow.normalBias = 0.015; lampLight.shadow.radius = 4;
  lampLight.shadow.camera.near = 0.05; lampLight.shadow.camera.far = 3;
  const lampWorld = new THREE.Vector3(); bulb.getWorldPosition(lampWorld);
  lampLight.position.copy(lampWorld); scene.add(lampLight);
  const lt = new THREE.Object3D(); lt.position.copy(lampTarget); scene.add(lt); lampLight.target = lt;
  out.lampLight = lampLight;
  shadow(lamp); bulb.castShadow = false; shadeInner.castShadow = false;
  // volumetric cone
  const coneLen = 0.62;
  const coneGeo = new THREE.ConeGeometry(0.42, coneLen, 48, 1, true); coneGeo.translate(0, -coneLen / 2, 0);
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1.0, 0.72, 0.4) }, k: { value: 0.05 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y/' + coneLen.toFixed(2) + '; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 col; uniform float k; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 1.6); float a = clamp(1.0 - vY, 0.0, 1.0) * (1.0-vY) * f * k * smoothstep(0.0,0.08,vY); gl_FragColor = vec4(col*a, a); }',
  });
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.copy(lampWorld);
  cone.lookAt(lampTarget); cone.rotateX(-Math.PI / 2); scene.add(cone);

  /* ---------------- DUST ---------------- */
  const dN = 600, dPos = new Float32Array(dN * 3), dSeed = new Float32Array(dN);
  for (let i = 0; i < dN; i++) { dPos[i * 3] = (r() - 0.5) * 3; dPos[i * 3 + 1] = 0.75 + r() * 1.6; dPos[i * 3 + 2] = -1.2 + r() * 2.2; dSeed[i] = r(); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, lamp: { value: lampWorld.clone() }, px: { value: window.devicePixelRatio || 1 } },
    vertexShader: `attribute float seed; uniform float time; uniform vec3 lamp; uniform float px; varying float vA;
      void main(){ vec3 p = position; p.x += sin(time*0.11 + seed*40.0)*0.08; p.y += sin(time*0.07 + seed*20.0)*0.06 - mod(time*0.004 + seed, 0.3);
        p.z += cos(time*0.09 + seed*30.0)*0.08;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        float dl = distance(p, lamp); vA = (0.12 + 1.6*exp(-dl*dl*7.0)) * (0.5+0.5*sin(time*0.6+seed*80.0));
        gl_PointSize = (1.6 + seed*2.0) * px * (1.0 / -mv.z); }`,
    fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5,0.0,d)*vA*0.5; gl_FragColor = vec4(vec3(1.0,0.86,0.7)*a, a); }',
  });
  add(new THREE.Points(dGeo, dMat));
  updaters.push(t => { dMat.uniforms.time.value = t; });

  // collapse static prop geometry into a few draw calls
  for (const grp of [lamp, rack, ext, mug, helmet, radio, mp, nb, hs, truck]) mergeStatic(grp);
  out.update = (t, dt) => updaters.forEach(f => f(t, dt));
  return out;
}
