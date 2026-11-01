export class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.masterGain = null;

    // Engine sound nodes
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.isEngineRunning = false;

    // Tire squeal nodes
    this.tireNoiseNode = null;
    this.tireGain = null;

    // Siren nodes
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenInterval = null;
    this.isSirenActive = false;

    // Radio
    this.radioGain = null;
    this.currentStationIndex = 0;
    this.radioInterval = null;
    this.radioTracks = [
      { name: "Flash FM 102.9", song: "Sunset Boulevard - Synthwave", bpm: 120 },
      { name: "Vice Wave 98.4", song: "Neon Palms - Chillwave", bpm: 95 },
      { name: "Leonida Trap 105.1", song: "Ocean Drive Heat - 808 Trap", bpm: 130 },
      { name: "Radio Off", song: "Off", bpm: 0 }
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);

    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.35;
    this.radioGain.connect(this.masterGain);

    this.initEngineAudio();
    this.initTireAudio();
    this.startRadio();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  /**
   * Play a one-shot sound with a volume multiplier (used for distance attenuation).
   * Works by temporarily routing the synth graph through a dedicated gain node.
   */
  play(name, volume = 1, ...args) {
    if (!this.ctx || volume <= 0.01) return;
    const fnName = {
      gunshot: 'playGunshot',
      punch: 'playPunch',
      hit: 'playHitMarker',
      horn: 'playHorn',
      crash: 'playCrash',
      explosion: 'playExplosion',
      pickup: 'playPickup',
      empty: 'playEmptyClick',
      reload: 'playReload',
      prisonDoor: 'playPrisonDoor',
      carChirp: 'playCarChirp',
      missionStart: 'playMissionStart',
      missionPassed: 'playMissionPassed',
      missionFailed: 'playMissionFailed',
      radioComms: 'playRadioComms',
      cratePickup: 'playCratePickup'
    }[name];
    if (!fnName || typeof this[fnName] !== 'function') return;
    const realMaster = this.masterGain;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(volume, 1.5);
    g.connect(realMaster);
    this.masterGain = g;
    try {
      this[fnName](...args);
    } finally {
      this.masterGain = realMaster;
    }
    setTimeout(() => g.disconnect(), 3000);
  }

  setRadioEnabled(on) {
    if (!this.ctx || !this.radioGain) return;
    this.radioGain.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.2);
  }

  setSirenVolume(v) {
    if (this.sirenGain && this.ctx) {
      this.sirenGain.gain.setTargetAtTime(0.18 * v, this.ctx.currentTime, 0.1);
    }
  }

  _noiseBuffer(seconds, decay = 0.3) {
    const size = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * decay));
    return buffer;
  }

  playExplosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(1.6, 0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    noise.connect(lp); lp.connect(g); g.connect(this.masterGain);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(1.0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(og); og.connect(this.masterGain);
    noise.start(t); osc.start(t); osc.stop(t + 1.0);
  }

  playPickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t + i * 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(0.12, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.1);
      o.connect(g); g.connect(this.masterGain);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.12);
    });
  }

  playEmptyClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(2400, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g); g.connect(this.masterGain);
    o.start(t); o.stop(t + 0.04);
  }

  playReload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.35].forEach((off) => {
      const n = this.ctx.createBufferSource();
      n.buffer = this._noiseBuffer(0.05, 0.3);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = off ? 3000 : 1800;
      const g = this.ctx.createGain();
      g.gain.value = 0.35;
      n.connect(bp); bp.connect(g); g.connect(this.masterGain);
      n.start(t + off);
    });
  }

  playPrisonDoor() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Industrial security buzzer (harsh sawtooth buzz)
    const buzz = this.ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(115, t);
    const buzzFilter = this.ctx.createBiquadFilter();
    buzzFilter.type = 'bandpass';
    buzzFilter.frequency.value = 420;
    buzzFilter.Q.value = 2.5;
    const buzzGain = this.ctx.createGain();
    buzzGain.gain.setValueAtTime(0.28, t);
    buzzGain.gain.setValueAtTime(0.28, t + 0.55);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    buzz.connect(buzzFilter);
    buzzFilter.connect(buzzGain);
    buzzGain.connect(this.masterGain);
    buzz.start(t);
    buzz.stop(t + 0.68);

    // Heavy steel cell gate clank right as buzzer finishes
    const clankTime = t + 0.52;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.45, 0.22);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, clankTime);
    bp.Q.value = 3.0;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.65, clankTime);
    ng.gain.exponentialRampToValueAtTime(0.001, clankTime + 0.42);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.masterGain);
    noise.start(clankTime);

    const thud = this.ctx.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(160, clankTime);
    thud.frequency.exponentialRampToValueAtTime(42, clankTime + 0.28);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.55, clankTime);
    tg.gain.exponentialRampToValueAtTime(0.001, clankTime + 0.32);
    thud.connect(tg);
    tg.connect(this.masterGain);
    thud.start(clankTime);
    thud.stop(clankTime + 0.35);
  }

  playCarChirp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Double high-pitched key-fob unlock chirp
    [0, 0.13].forEach((offset) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2150, t + offset);
      osc.frequency.exponentialRampToValueAtTime(2650, t + offset + 0.065);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t + offset);
      g.gain.linearRampToValueAtTime(0.22, t + offset + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.08);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.09);
    });
  }

  playMissionStart() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Sleek Vice City two-note synth chime
    [523.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.11);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t + idx * 0.11);
      g.gain.linearRampToValueAtTime(0.22, t + idx * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.11 + 0.35);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t + idx * 0.11);
      osc.stop(t + idx * 0.11 + 0.38);
    });
  }

  playMissionPassed() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // GTA-style triumphant synth brass chord fanfare (D minor -> A7 -> D major resolve)
    const notes = [
      { f: 293.66, start: 0.0, dur: 0.25 },
      { f: 440.00, start: 0.18, dur: 0.25 },
      { f: 523.25, start: 0.36, dur: 0.28 },
      { f: 587.33, start: 0.58, dur: 1.45 },
      { f: 440.00, start: 0.58, dur: 1.45 },
      { f: 369.99, start: 0.58, dur: 1.45 }
    ];
    for (const n of notes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, t + n.start);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1950, t + n.start);
      lp.frequency.exponentialRampToValueAtTime(650, t + n.start + n.dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t + n.start);
      g.gain.linearRampToValueAtTime(0.18, t + n.start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      osc.start(t + n.start);
      osc.stop(t + n.start + n.dur + 0.05);
    }
  }

  playMissionFailed() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [220, 164.81].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.28);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + idx * 0.28 + 0.45);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 480;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.28, t + idx * 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.28 + 0.5);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      osc.start(t + idx * 0.28);
      osc.stop(t + idx * 0.28 + 0.55);
    });
  }

  playRadioComms() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Two-tone encrypted walkie/phone chirp
    [1480, 1920].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.055);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t + idx * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.055 + 0.048);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t + idx * 0.055);
      osc.stop(t + idx * 0.055 + 0.055);
    });
  }

  playCratePickup() {
    if (!this.ctx) return;
    this.playPickup();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1174.66, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t + 0.14);
    osc.stop(t + 0.5);
  }

  initEngineAudio() {
    if (!this.ctx) return;
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineGain = this.ctx.createGain();

    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';

    this.engineOsc1.frequency.setValueAtTime(45, this.ctx.currentTime);
    this.engineOsc2.frequency.setValueAtTime(22.5, this.ctx.currentTime);

    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

    this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  initTireAudio() {
    if (!this.ctx) return;
    // Create white noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.tireNoiseNode = this.ctx.createBufferSource();
    this.tireNoiseNode.buffer = noiseBuffer;
    this.tireNoiseNode.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 3.0;

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.tireNoiseNode.connect(filter);
    filter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

    this.tireNoiseNode.start();
  }

  updateEngine(rpmRatio, throttle, inCar) {
    if (!this.ctx || !this.engineGain) return;

    if (!inCar) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    // Base pitch from idle (50Hz) to redline (280Hz)
    const baseFreq = 50 + rpmRatio * 220;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.03);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.03);

    // Filter opens with throttle
    const filterCutoff = 350 + throttle * 1200 + rpmRatio * 600;
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, this.ctx.currentTime, 0.04);

    // Volume
    const targetGain = 0.15 + throttle * 0.12 + rpmRatio * 0.08;
    this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
  }

  updateTires(slipAmount) {
    if (!this.ctx || !this.tireGain) return;
    const targetGain = Math.min(Math.max(slipAmount - 0.25, 0) * 1.5, 0.3);
    this.tireGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
  }

  playGunshot(isAuto = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Noise crack
    const bufferSize = this.ctx.sampleRate * (isAuto ? 0.09 : 0.15);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = isAuto ? 1800 : 1200;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + (isAuto ? 0.08 : 0.14));

    // Bass thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.6, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(t);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playHitMarker() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  playPunch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  playHorn() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const t = this.ctx.currentTime;
    const duration = 0.38;

    // Dual-tone automotive horn frequencies: ~440 Hz (high tone) and ~350 Hz (low tone)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    // Slight frequency modulation / initial settling ramp
    osc1.frequency.setValueAtTime(436, t);
    osc1.frequency.linearRampToValueAtTime(440, t + 0.03);
    osc2.frequency.setValueAtTime(347, t);
    osc2.frequency.linearRampToValueAtTime(350, t + 0.03);

    // Subtle LFO vibrato for realistic diaphragm acoustic resonance
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(26, t); // 26 Hz mechanical buzz
    lfoGain.gain.setValueAtTime(4.5, t); // ±4.5 Hz depth
    lfo.connect(osc1.frequency);
    lfo.connect(osc2.frequency);

    // Bandpass filter to sculpt horn acoustic body
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(820, t);
    filter.Q.setValueAtTime(1.6, t);

    // Horn envelope (subtle attack, sustain, quick release decay)
    const hornGain = this.ctx.createGain();
    hornGain.gain.setValueAtTime(0.001, t);
    hornGain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    hornGain.gain.setValueAtTime(0.35, t + duration - 0.06);
    hornGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(hornGain);
    hornGain.connect(this.masterGain);

    lfo.start(t);
    osc1.start(t);
    osc2.start(t);

    lfo.stop(t + duration);
    osc1.stop(t + duration);
    osc2.stop(t + duration);
  }

  playCrash(speedRatio = 1.0) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const t = this.ctx.currentTime;
    const clampedSpeed = Math.max(0.2, Math.min(speedRatio, 2.0));
    const duration = 0.28 + clampedSpeed * 0.12;

    // 1. White noise burst for crunch / crumpling sheet metal
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const decay = Math.exp(-i / (bufferSize * 0.35));
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Crunch filter sweeping down from high crunch to low rumble
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2200, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(350, t + duration);
    noiseFilter.Q.setValueAtTime(1.5, t);

    const noiseGain = this.ctx.createGain();
    const noiseLevel = Math.min(0.8, 0.4 + clampedSpeed * 0.3);
    noiseGain.gain.setValueAtTime(noiseLevel, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // 2. Heavy punchy bass thump with distortion
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'triangle';
    const startFreq = 120 + clampedSpeed * 30;
    bassOsc.frequency.setValueAtTime(startFreq, t);
    bassOsc.frequency.exponentialRampToValueAtTime(28, t + duration * 0.8);

    // Distortion waveshaper for bass crunch
    const waveShaper = this.ctx.createWaveShaper();
    const curveSamples = 256;
    const curve = new Float32Array(curveSamples);
    const k = 20 * clampedSpeed;
    const deg = Math.PI / 180;
    for (let i = 0; i < curveSamples; i++) {
      const x = (i * 2) / curveSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    waveShaper.curve = curve;

    const bassGain = this.ctx.createGain();
    const bassLevel = Math.min(0.9, 0.5 + clampedSpeed * 0.35);
    bassGain.gain.setValueAtTime(bassLevel, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);

    bassOsc.connect(waveShaper);
    waveShaper.connect(bassGain);
    bassGain.connect(this.masterGain);

    // 3. Resonant metallic clang / chassis ring
    const ringOsc = this.ctx.createOscillator();
    ringOsc.type = 'sawtooth';
    ringOsc.frequency.setValueAtTime(280, t);
    ringOsc.frequency.exponentialRampToValueAtTime(160, t + 0.2);

    const ringFilter = this.ctx.createBiquadFilter();
    ringFilter.type = 'bandpass';
    ringFilter.frequency.setValueAtTime(420, t);
    ringFilter.Q.setValueAtTime(4.0, t);

    const ringGain = this.ctx.createGain();
    ringGain.gain.setValueAtTime(0.25 * clampedSpeed, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    ringOsc.connect(ringFilter);
    ringFilter.connect(ringGain);
    ringGain.connect(this.masterGain);

    noise.start(t);
    bassOsc.start(t);
    ringOsc.start(t);

    bassOsc.stop(t + duration);
    ringOsc.stop(t + 0.25);
  }

  setSiren(active) {
    if (this.isSirenActive === active) return;
    this.isSirenActive = active;

    if (!this.ctx) return;

    if (active) {
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'sawtooth';

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1600;

        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.18;

        this.sirenOsc.connect(filter);
        filter.connect(this.sirenGain);
        this.sirenGain.connect(this.masterGain);

        this.sirenOsc.start();
      }

      let high = false;
      this.sirenInterval = setInterval(() => {
        if (!this.ctx || !this.sirenOsc) return;
        high = !high;
        const targetFreq = high ? 950 : 650;
        this.sirenOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
      }, 500);

    } else {
      if (this.sirenInterval) {
        clearInterval(this.sirenInterval);
        this.sirenInterval = null;
      }
      if (this.sirenOsc) {
        this.sirenOsc.stop();
        this.sirenOsc.disconnect();
        this.sirenOsc = null;
      }
    }
  }

  nextRadioStation() {
    this.currentStationIndex = (this.currentStationIndex + 1) % this.radioTracks.length;
    return this.radioTracks[this.currentStationIndex];
  }

  getCurrentStation() {
    return this.radioTracks[this.currentStationIndex];
  }

  startRadio() {
    if (!this.ctx) return;
    let step = 0;

    // Procedural Synthwave generator
    const chordsFlashFM = [
      [220, 261.63, 329.63], // Am
      [174.61, 220, 261.63], // F
      [261.63, 329.63, 392], // C
      [196, 246.94, 293.66]  // G
    ];

    const notesTrap = [55, 65.41, 73.42, 82.41]; // 808 bass root notes

    this.radioInterval = setInterval(() => {
      if (!this.ctx || this.currentStationIndex === 3) return; // Station 3 is OFF
      const t = this.ctx.currentTime;
      step = (step + 1) % 16;

      if (this.currentStationIndex === 0) { // Flash FM (Synthwave)
        const chordIdx = Math.floor(step / 4) % chordsFlashFM.length;
        const chord = chordsFlashFM[chordIdx];
        const note = chord[step % 3];

        // Synth pluck
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(note * 2, t);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 0.18);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.radioGain);

        osc.start(t);
        osc.stop(t + 0.2);

        // Retro Kick on 0, 4, 8, 12
        if (step % 4 === 0) {
          const kick = this.ctx.createOscillator();
          kick.frequency.setValueAtTime(130, t);
          kick.frequency.exponentialRampToValueAtTime(45, t + 0.08);

          const kickGain = this.ctx.createGain();
          kickGain.gain.setValueAtTime(0.2, t);
          kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

          kick.connect(kickGain);
          kickGain.connect(this.radioGain);
          kick.start(t);
          kick.stop(t + 0.12);
        }

      } else if (this.currentStationIndex === 1) { // Vice Wave (Chillwave)
        if (step % 4 === 0) {
          const chordIdx = Math.floor(step / 4) % chordsFlashFM.length;
          const chord = chordsFlashFM[chordIdx];

          chord.forEach(freq => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 1.5, t);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

            osc.connect(gain);
            gain.connect(this.radioGain);
            osc.start(t);
            osc.stop(t + 0.65);
          });
        }
      } else if (this.currentStationIndex === 2) { // Leonida Trap
        if (step % 8 === 0) {
          const bassNote = notesTrap[Math.floor(step / 4) % notesTrap.length];
          const bass = this.ctx.createOscillator();
          bass.type = 'sine';
          bass.frequency.setValueAtTime(bassNote, t);

          const bassGain = this.ctx.createGain();
          bassGain.gain.setValueAtTime(0.22, t);
          bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

          bass.connect(bassGain);
          bassGain.connect(this.radioGain);
          bass.start(t);
          bass.stop(t + 0.38);
        }
      }
    }, 130);
  }
}
