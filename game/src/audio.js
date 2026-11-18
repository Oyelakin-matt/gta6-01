// Solara Bay — sound, fully synthesised with WebAudio. No audio files, no
// network: engine hum, sirens, gunshots, chimes and clicks, all generated.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.noiseBuf = null;
  }

  // call from the first user gesture (click to play)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    // shared noise buffer for gunshots / crashes
    const len = this.ctx.sampleRate * 0.4;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // engine: two detuned oscillators through a lowpass
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 110;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // siren: triangle wave, frequency flipped by the update loop
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  update(dt, speed, driving, wanted) {
    if (!this.ctx) return;
    // engine follows speed
    const target = driving ? Math.min(0.16, 0.03 + Math.abs(speed) * 0.0035) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const freq = 50 + Math.abs(speed) * 3.2;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + Math.abs(speed) * 22, this.ctx.currentTime, 0.1);
    // siren wail while wanted
    if (wanted > 0) {
      this.sirenPhase += dt;
      const hi = Math.floor(this.sirenPhase / 0.45) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 950 : 700, this.ctx.currentTime, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.2);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click() { this._blip(950, 0.06, 'square', 0.08); }
  chime() { this._blip(880, 0.18, 'sine', 0.22); this._blip(1318, 0.28, 'sine', 0.2, 0.1); }
  phoneRing() { this._blip(1200, 0.12, 'sine', 0.16); this._blip(1200, 0.12, 'sine', 0.16, 0.22); }
  reload() { this._blip(420, 0.07, 'square', 0.1); this._blip(300, 0.07, 'square', 0.1, 0.12); }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
  }
}
