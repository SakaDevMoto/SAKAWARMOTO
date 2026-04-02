export class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.effectsVolume = this.readStoredEffectsVolume();
  }

  async boot() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }

    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.context = new Context();
      this.masterGain = this.context.createGain();
      this.applyEffectsVolume();
      this.masterGain.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  readStoredEffectsVolume() {
    try {
      const stored = window.localStorage?.getItem("last-zone-effects-volume");
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(1, parsed));
      }
    } catch {
      // Ignora falhas de acesso ao storage.
    }

    return 1;
  }

  applyEffectsVolume() {
    if (!this.masterGain) {
      return;
    }

    this.masterGain.gain.value = 0.32 * this.effectsVolume;
  }

  setEffectsVolume(value) {
    this.effectsVolume = Math.max(0, Math.min(1, Number(value) || 0));
    this.applyEffectsVolume();

    try {
      window.localStorage?.setItem("last-zone-effects-volume", String(this.effectsVolume));
    } catch {
      // Ignora falhas de persistencia.
    }
  }

  getEffectsVolume() {
    return this.effectsVolume;
  }

  createNoiseBuffer() {
    const length = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  play(name, options = {}) {
    if (!this.context || !this.masterGain) {
      return;
    }

    switch (name) {
      case "ui":
        this.tone({ frequency: 520, endFrequency: 760, duration: 0.08, volume: 0.06, type: "triangle" });
        break;
      case "join":
        this.tone({ frequency: 360, endFrequency: 540, duration: 0.12, volume: 0.08, type: "triangle" });
        break;
      case "start":
        this.tone({ frequency: 190, endFrequency: 420, duration: 0.18, volume: 0.1, type: "sawtooth" });
        this.noise({ duration: 0.12, volume: 0.035, filter: 1200 });
        break;
      case "rifle":
        this.tone({ frequency: 280, endFrequency: 100, duration: 0.07, volume: 0.07, type: "square" });
        this.noise({ duration: 0.045, volume: 0.02, filter: 1800 });
        break;
      case "shotgun":
        this.tone({ frequency: 210, endFrequency: 70, duration: 0.15, volume: 0.12, type: "sawtooth" });
        this.noise({ duration: 0.09, volume: 0.05, filter: 900 });
        break;
      case "sniper":
        this.tone({ frequency: 660, endFrequency: 120, duration: 0.22, volume: 0.1, type: "triangle" });
        this.noise({ duration: 0.06, volume: 0.02, filter: 2600 });
        break;
      case "launcher":
        this.tone({ frequency: 180, endFrequency: 85, duration: 0.16, volume: 0.1, type: "square" });
        this.noise({ duration: 0.08, volume: 0.032, filter: 700 });
        break;
      case "dash":
        this.tone({ frequency: 900, endFrequency: 240, duration: 0.1, volume: 0.06, type: "triangle" });
        break;
      case "mine":
        this.tone({ frequency: 180, endFrequency: 120, duration: 0.08, volume: 0.05, type: "triangle" });
        this.tone({ frequency: 440, endFrequency: 380, duration: 0.16, volume: 0.03, type: "square", delay: 0.02 });
        break;
      case "overclock":
        this.tone({ frequency: 240, endFrequency: 680, duration: 0.25, volume: 0.07, type: "sawtooth" });
        break;
      case "shield":
        this.tone({ frequency: 520, endFrequency: 870, duration: 0.18, volume: 0.06, type: "triangle" });
        this.noise({ duration: 0.05, volume: 0.015, filter: 3200 });
        break;
      case "cloak":
        this.tone({ frequency: 850, endFrequency: 420, duration: 0.18, volume: 0.05, type: "triangle" });
        break;
      case "recon":
        this.tone({ frequency: 360, endFrequency: 980, duration: 0.2, volume: 0.06, type: "triangle" });
        break;
      case "beam":
        this.tone({ frequency: 920, endFrequency: 220, duration: 0.24, volume: 0.1, type: "sawtooth" });
        break;
      case "gravity":
        this.tone({ frequency: 180, endFrequency: 90, duration: 0.32, volume: 0.08, type: "sine" });
        break;
      case "storm":
        this.noise({ duration: 0.2, volume: 0.04, filter: 450 });
        this.tone({ frequency: 160, endFrequency: 70, duration: 0.22, volume: 0.05, type: "triangle" });
        break;
      case "hit":
        this.tone({ frequency: 180, endFrequency: 90, duration: 0.05, volume: 0.05, type: "square" });
        break;
      case "impact":
        this.noise({ duration: 0.14, volume: 0.05, filter: 700 });
        this.tone({ frequency: 110, endFrequency: 60, duration: 0.18, volume: 0.06, type: "triangle" });
        break;
      case "zone":
        this.tone({ frequency: 160, endFrequency: 120, duration: 0.14, volume: 0.05, type: "sine" });
        break;
      case "elimination":
        this.tone({ frequency: 220, endFrequency: 120, duration: 0.12, volume: 0.06, type: "square" });
        this.tone({ frequency: 480, endFrequency: 760, duration: 0.14, volume: 0.05, type: "triangle", delay: 0.05 });
        break;
      case "respawn":
        this.tone({ frequency: 260, endFrequency: 820, duration: 0.16, volume: 0.07, type: "triangle" });
        this.tone({ frequency: 520, endFrequency: 980, duration: 0.18, volume: 0.04, type: "sine", delay: 0.04 });
        break;
      default:
        this.tone({ frequency: 360, endFrequency: 480, duration: 0.08, volume: 0.04, type: "triangle" });
        break;
    }
  }

  tone({
    frequency,
    endFrequency = frequency,
    duration = 0.15,
    volume = 0.06,
    type = "triangle",
    delay = 0,
  }) {
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise({ duration = 0.1, volume = 0.03, filter = 1200, delay = 0 }) {
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const biquad = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    source.buffer = this.noiseBuffer;
    biquad.type = "lowpass";
    biquad.frequency.setValueAtTime(filter, start);

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(this.masterGain);
    source.start(start);
    source.stop(start + duration);
  }
}
