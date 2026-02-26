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

    // Card placement variants
    for (let i = 1; i <= 4; i++) {
      this.samples[`card-place-${i}`] = new Howl({ src: [`/sounds/card-place-${i}.ogg`], volume: 0.4 });
    }

    // Card deal
    this.samples['card-fan-1'] = new Howl({ src: ['/sounds/card-fan-1.ogg'], volume: 0.5 });

    // Chip lay (neutral score)
    for (let i = 1; i <= 3; i++) {
      this.samples[`chip-lay-${i}`] = new Howl({ src: [`/sounds/chip-lay-${i}.ogg`], volume: 0.5 });
    }

    // Chips stack (win)
    for (let i = 1; i <= 6; i++) {
      this.samples[`chips-stack-${i}`] = new Howl({ src: [`/sounds/chips-stack-${i}.ogg`], volume: 0.5 });
    }

    // Chips collide (loss)
    for (let i = 1; i <= 4; i++) {
      this.samples[`chips-collide-${i}`] = new Howl({ src: [`/sounds/chips-collide-${i}.ogg`], volume: 0.5 });
    }

    // Chips handle (big win/loss accent)
    for (let i = 1; i <= 6; i++) {
      this.samples[`chips-handle-${i}`] = new Howl({ src: [`/sounds/chips-handle-${i}.ogg`], volume: 0.4 });
    }

    this.samplesLoaded = true;
  }

  private playRandom(prefix: string, count: number): void {
    const i = Math.floor(Math.random() * count) + 1;
    this.playSample(`${prefix}-${i}`);
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
    // Dissonant descending chord — matches the FOUL overlay slamming down
    this.playArpeggio([311, 233, 185], 0.1, 'square', 0.2);
    this.playRandom('chips-collide', 4);
  }

  /** Play when a row overlay appears with royalties. Pitch scales with royalty value. */
  playRoyaltyReveal(royalties: number): void {
    if (royalties <= 0) return;
    // Base note C5, scale up with royalty value (capped at 50)
    const base = 523;
    if (royalties >= 15) {
      // Big royalty: bright 4-note arpeggio + chips-handle
      this.playArpeggio([base, base * 1.25, base * 1.5, base * 2], 0.08, 'sine', 0.25);
      this.playRandom('chips-handle', 6);
    } else if (royalties >= 6) {
      // Medium royalty: 3-note arpeggio + chips-stack
      this.playArpeggio([base, base * 1.25, base * 1.5], 0.1, 'sine', 0.2);
      this.playRandom('chips-stack', 6);
    } else {
      // Small royalty: 2-note shimmer
      this.playArpeggio([base, base * 1.5], 0.1, 'sine', 0.18);
    }
  }

  /** Subtle chime when a row is completed (non-royalty hand worth showing). */
  playRowComplete(): void {
    this.playTone(784, 0.12, 'sine', 0.12);
  }

  playCardPlace(): void {
    this.playRandom('card-place', 4);
  }

  playCardDeal(): void {
    this.playSample('card-fan-1');
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

    // Layered Kenney samples
    if (intensity > 0.5) {
      this.playRandom('chips-stack', 6);
      this.playRandom('chips-handle', 6);
    } else if (intensity > 0.2) {
      this.playRandom('chips-stack', 6);
    } else if (intensity === 0) {
      this.playRandom('chip-lay', 3);
    } else if (intensity > 0) {
      // Tiny win — no sample
    } else if (intensity > -0.3) {
      // Tiny loss — no sample
    } else if (intensity > -0.5) {
      this.playRandom('chips-collide', 4);
    } else {
      this.playRandom('chips-collide', 4);
      this.playRandom('chips-handle', 6);
    }
  }
}

export { SoundEngine };
