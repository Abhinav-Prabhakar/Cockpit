/* Procedural audio: room tone, panel clicks, station alert tones, radio chatter. No samples. */
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.vol = 0.8; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const a = (this.ctx = new C());
    this.master = a.createGain(); this.master.gain.value = this.vol;
    const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(a.destination);
    this.white = this.buf(2, () => Math.random() * 2 - 1);
    let last = 0; this.brownBuf = this.buf(4, () => { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; return last * 3.5; });

    // room tone + HVAC
    const n = a.createBufferSource(); n.buffer = this.brownBuf; n.loop = true;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = a.createGain(); g.gain.value = 0.28; n.connect(lp).connect(g).connect(this.master); n.start();
    [60, 120, 180].forEach((f, i) => { const o = a.createOscillator(); o.frequency.value = f; const gg = a.createGain(); gg.gain.value = [0.010, 0.005, 0.0018][i]; o.connect(gg).connect(this.master); o.start(); });
    const n2 = a.createBufferSource(); n2.buffer = this.white; n2.loop = true;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
    const g2 = a.createGain(); g2.gain.value = 0.018; n2.connect(bp).connect(g2).connect(this.master); n2.start();

    this.shaper = a.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.2); }
    this.shaper.curve = curve;
    this.radioBus = a.createGain(); this.radioBus.gain.value = 0.55;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    const lp2 = a.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 2900;
    this.radioIn = a.createGain();
    this.radioIn.connect(this.shaper).connect(hp).connect(lp2).connect(this.radioBus).connect(this.master);
  }
  buf(sec, fn) { const a = this.ctx, b = a.createBuffer(1, a.sampleRate * sec, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = fn(); return b; }
  get ok() { return !!this.ctx && !this.muted; }

  noiseHit(t, freq, q, peak, decay, type = 'bandpass') {
    const a = this.ctx, s = a.createBufferSource(); s.buffer = this.white;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + decay + 0.05);
  }
  osc(t, type, f0, f1, dur, peak, dest = this.master) {
    const a = this.ctx, o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  click(kind = 'button') {
    if (!this.ok) return; const t = this.ctx.currentTime;
    if (kind === 'toggle') { this.noiseHit(t, 4200, 1.4, 0.9, 0.035); this.osc(t, 'sine', 1900, 1200, 0.02, 0.06); }
    else if (kind === 'guard') { this.noiseHit(t, 1500, 2, 0.4, 0.07); this.osc(t, 'triangle', 420, 300, 0.05, 0.05); }
    else if (kind === 'knob') this.noiseHit(t, 6500, 3, 0.18, 0.012);
    else if (kind === 'arcade') { this.noiseHit(t, 1900, 1.2, 0.7, 0.045); this.osc(t, 'sine', 160, 60, 0.08, 0.25); }
    else if (kind === 'blip') { this.osc(t, 'square', 880, 880, 0.06, 0.03); this.osc(t + 0.06, 'square', 1320, 1320, 0.08, 0.03); }
    else if (kind === 'soft') { this.noiseHit(t, 2600, 1.6, 0.3, 0.025); }
    else { this.noiseHit(t, 3200, 1.2, 0.6, 0.04); this.osc(t, 'sine', 900, 500, 0.02, 0.04); }
  }
  /* classic hi-lo station alert */
  alert(cycles = 3) {
    if (!this.ok) return; const t = this.ctx.currentTime + 0.05;
    for (let i = 0; i < cycles * 2; i++) { const f = i % 2 ? 725 : 960; this.osc(t + i * 0.34, 'square', f, f, 0.3, 0.035); this.osc(t + i * 0.34, 'sine', f * 2, f * 2, 0.3, 0.02); }
  }
  warning() {
    if (!this.ok) return; const t = this.ctx.currentTime + 0.02;
    for (let i = 0; i < 4; i++) this.osc(t + i * 0.55, 'sawtooth', 380, 1250, 0.5, 0.04);
  }
  chime() { if (!this.ok) return; const t = this.ctx.currentTime; this.osc(t, 'sine', 1046, 1046, 0.5, 0.07); this.osc(t + 0.14, 'sine', 784, 784, 0.7, 0.06); }
  siren(dur = 3.2) {
    if (!this.ok) return; const a = this.ctx, t = a.currentTime;
    const o = a.createOscillator(); o.type = 'sawtooth';
    const lfo = a.createOscillator(); lfo.frequency.value = 0.55; const lg = a.createGain(); lg.gain.value = 380;
    o.frequency.value = 950; lfo.connect(lg).connect(o.frequency);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.4); g.gain.setValueAtTime(0.05, t + dur - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
  /* radio voice-ish gibberish through a crushed band-limited channel */
  chatter(dur = 2, near = true) {
    if (!this.ok) return; const a = this.ctx, t = a.currentTime + 0.02;
    const vol = near ? 1 : 0.3;
    // key-up squelch
    this.squelch(t, 0.06, 0.25 * vol);
    const g = a.createGain(); g.gain.value = 0;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.4;
    const voice = a.createOscillator(); voice.type = 'sawtooth'; voice.frequency.value = 120 + Math.random() * 50;
    const ns = a.createBufferSource(); ns.buffer = this.white; ns.loop = true;
    const nsG = a.createGain(); nsG.gain.value = 0.35;
    voice.connect(bp); ns.connect(nsG).connect(bp); bp.connect(g).connect(this.radioIn);
    let tt = t + 0.08;
    while (tt < t + dur) {
      const seg = 0.06 + Math.random() * 0.14, amp = Math.random() < 0.18 ? 0.02 : 0.25 + Math.random() * 0.6;
      g.gain.setTargetAtTime(amp * vol, tt, 0.015);
      bp.frequency.setTargetAtTime(700 + Math.random() * 1500, tt, 0.02);
      voice.frequency.setTargetAtTime(105 + Math.random() * 70, tt, 0.03);
      tt += seg;
    }
    g.gain.setTargetAtTime(0, t + dur, 0.02);
    voice.start(t); ns.start(t, Math.random()); voice.stop(t + dur + 0.2); ns.stop(t + dur + 0.2);
    this.squelch(t + dur + 0.02, 0.22, 0.32 * vol);
  }
  squelch(t, dur, peak) {
    const a = this.ctx, s = a.createBufferSource(); s.buffer = this.white;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = a.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  setVolume(v) { this.vol = v; if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  toggleMute() { this.muted = !this.muted; if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.05); return this.muted; }
}
