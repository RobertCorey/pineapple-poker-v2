import { Howl } from 'howler';

const MUTE_KEY = 'pineapple:muted';

class SoundEngine {
  private static instance: SoundEngine | null = null;
  private ctx: AudioContext | null = null;
  private initialized = false;
  private _muted: boolean;
  private samples: Record<string, Howl> = {};
  private samplesLoaded = false;

  private constructor() {
    this._muted = localStorage.getItem(MUTE_KEY) === 'true';
  }

  static get(): SoundEngine {
    if (!SoundEngine.instance) {
      SoundEngine.instance = new SoundEngine();
    }
    return SoundEngine.instance;
  }

  init(): void {
    if (this.initialized) return;
    this.ctx = new AudioContext();
    this.loadSamples();
    this.initialized = true;
  }

  private loadSamples(): void {
    if (this.samplesLoaded) return;
    this.samples = {
      coins: new Howl({ src: ['/sounds/coins.mp3'], volume: 0.6 }),
      chime: new Howl({ src: ['/sounds/chime.mp3'], volume: 0.5 }),
      thud: new Howl({ src: ['/sounds/thud.mp3'], volume: 0.4 }),
      crowd: new Howl({ src: ['/sounds/crowd.mp3'], volume: 0.3 }),
    };
    this.samplesLoaded = true;
  }

  private playSample(name: string, volume?: number): void {
    if (this._muted) return;
    const howl = this.samples[name];
    if (!howl) return;
    if (volume !== undefined) howl.volume(volume);
    howl.play();
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;
    localStorage.setItem(MUTE_KEY, String(v));
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  playTone(freq: number, duration: number, type: OscillatorType, gain: number): void {
    if (this._muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const vol = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.value = gain;

    // Quick fade-out to avoid clicks
    const fadeStart = this.ctx.currentTime + duration - 0.02;
    vol.gain.setValueAtTime(gain, fadeStart);
    vol.gain.linearRampToValueAtTime(0, fadeStart + 0.02);

    osc.connect(vol);
    vol.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playArpeggio(freqs: number[], interval: number, type: OscillatorType, gain: number): void {
    if (this._muted || !this.ctx) return;

    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const vol = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freqs[i];

      const startTime = this.ctx.currentTime + i * interval;
      const noteDuration = interval * 0.9;
      const fadeStart = startTime + noteDuration - 0.02;

      vol.gain.value = 0;
      vol.gain.setValueAtTime(gain, startTime);
      vol.gain.setValueAtTime(gain, fadeStart);
      vol.gain.linearRampToValueAtTime(0, fadeStart + 0.02);

      osc.connect(vol);
      vol.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    }
  }
  playTick(urgency: number): void {
    const freq = 600 + urgency * 400;
    const gain = 0.1 + urgency * 0.15;
    this.playTone(freq, 0.1, 'sine', gain);
  }

  playFoulAlert(): void {
    this.playTone(220, 0.2, 'square', 0.25);
  }

  playCardPlace(): void {
    if (this._muted || !this.ctx) return;
    // Short white noise burst — tactile "tap" feel
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.02, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length); // decay envelope
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const vol = this.ctx.createGain();
    vol.gain.value = 0.08;
    source.connect(vol);
    vol.connect(this.ctx.destination);
    source.start();
  }

  playCardDeal(): void {
    this.playArpeggio([600, 600, 600], 0.03, 'sine', 0.1);
  }

  playScoreReveal(intensity: number): void {
    // Synthesized tones
    if (intensity > 0.5) {
      this.playArpeggio([523, 659, 784, 1047], 0.12, 'sine', 0.3);
    } else if (intensity > 0) {
      this.playArpeggio([523, 784], 0.15, 'sine', 0.2);
    } else if (intensity > -0.5) {
      if (intensity === 0) {
        this.playTone(523, 0.2, 'sine', 0.15);
      } else {
        this.playArpeggio([262, 208], 0.15, 'sawtooth', 0.2);
      }
    } else {
      this.playArpeggio([262, 208, 175, 156], 0.12, 'sawtooth', 0.3);
    }

    // Layered samples
    if (intensity > 0.8) {
      this.playSample('coins');
      this.playSample('crowd');
    } else if (intensity > 0.2) {
      this.playSample('chime');
    } else if (intensity < -0.3) {
      this.playSample('thud');
    }
  }
}

export { SoundEngine };
