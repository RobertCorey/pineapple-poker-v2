/**
 * Synthesized audio engine using Web Audio API.
 * All sounds are generated procedurally — no asset files needed.
 *
 * Sound intensity scales with score magnitude:
 * - Big win: triumphant rising fanfare
 * - Medium win: cheerful arpeggio
 * - Small win: pleasant ding
 * - Neutral: quiet blip
 * - Small loss: dull low tone
 * - Medium loss: descending notes
 * - Big loss: dramatic descent with bass rumble
 */

export type ScoreIntensity =
  | 'neutral'
  | 'small-win'
  | 'medium-win'
  | 'big-win'
  | 'small-loss'
  | 'medium-loss'
  | 'big-loss';

export function getScoreIntensity(score: number): ScoreIntensity {
  if (score === 0) return 'neutral';
  if (score > 0) {
    if (score <= 2) return 'small-win';
    if (score <= 5) return 'medium-win';
    return 'big-win';
  }
  if (score >= -2) return 'small-loss';
  if (score >= -5) return 'medium-loss';
  return 'big-loss';
}

export function isWin(intensity: ScoreIntensity): boolean {
  return intensity === 'small-win' || intensity === 'medium-win' || intensity === 'big-win';
}

export function isLoss(intensity: ScoreIntensity): boolean {
  return intensity === 'small-loss' || intensity === 'medium-loss' || intensity === 'big-loss';
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.3,
    delay: number = 0,
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    // Quick attack to avoid click
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.01);
  }

  /** Play the score reveal impact sound based on intensity. */
  playScoreReveal(intensity: ScoreIntensity) {
    switch (intensity) {
      case 'neutral':
        this.playTone(440, 0.15, 'sine', 0.08);
        break;

      case 'small-win':
        this.playTone(660, 0.25, 'sine', 0.15);
        this.playTone(880, 0.2, 'sine', 0.1, 0.08);
        break;

      case 'medium-win':
        // Rising arpeggio C5-E5-G5
        this.playTone(523, 0.15, 'sine', 0.18, 0);
        this.playTone(659, 0.15, 'sine', 0.18, 0.1);
        this.playTone(784, 0.35, 'sine', 0.22, 0.2);
        break;

      case 'big-win':
        // Triumphant fanfare: C5-E5-G5-C6 with sustained chord
        this.playTone(523, 0.12, 'sine', 0.2, 0);
        this.playTone(659, 0.12, 'sine', 0.2, 0.07);
        this.playTone(784, 0.12, 'sine', 0.2, 0.14);
        this.playTone(1047, 0.6, 'sine', 0.28, 0.21);
        // Harmony chord underneath
        this.playTone(523, 0.5, 'triangle', 0.12, 0.21);
        this.playTone(659, 0.5, 'triangle', 0.1, 0.21);
        this.playTone(784, 0.5, 'triangle', 0.1, 0.21);
        // Sparkle on top
        this.playTone(2093, 0.08, 'sine', 0.06, 0.35);
        this.playTone(2637, 0.08, 'sine', 0.05, 0.45);
        this.playTone(3136, 0.1, 'sine', 0.04, 0.55);
        break;

      case 'small-loss':
        this.playTone(280, 0.25, 'sine', 0.12);
        break;

      case 'medium-loss':
        // Descending G4-E4-C4
        this.playTone(392, 0.18, 'sine', 0.15, 0);
        this.playTone(330, 0.18, 'sine', 0.15, 0.12);
        this.playTone(262, 0.35, 'sine', 0.18, 0.24);
        break;

      case 'big-loss':
        // Dramatic descent with bass rumble
        this.playTone(392, 0.2, 'sawtooth', 0.1, 0);
        this.playTone(330, 0.2, 'sawtooth', 0.1, 0.12);
        this.playTone(262, 0.2, 'sawtooth', 0.1, 0.24);
        this.playTone(196, 0.5, 'sawtooth', 0.12, 0.36);
        // Bass rumble
        this.playTone(82, 0.8, 'sine', 0.18, 0.3);
        this.playTone(98, 0.6, 'sine', 0.12, 0.4);
        break;
    }
  }

  /** Quick tick sound during score counting. */
  playTick() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  }

  /** Card placement click sound. */
  playCardPlace() {
    this.playTone(1200, 0.04, 'square', 0.06);
    this.playTone(800, 0.03, 'sine', 0.04, 0.015);
  }

  /** Card deal / flip sound. */
  playCardDeal() {
    this.playTone(600, 0.03, 'square', 0.05);
    this.playTone(900, 0.02, 'sine', 0.03, 0.02);
  }

  /** Timer warning tick (plays when countdown < 10s). */
  playTimerTick() {
    this.playTone(1000, 0.05, 'sine', 0.08);
  }

  /** Timer critical tick (plays when countdown < 5s). */
  playTimerCritical() {
    this.playTone(1200, 0.06, 'square', 0.1);
    this.playTone(1200, 0.06, 'square', 0.08, 0.12);
  }

  /** Foul buzzer. */
  playFoul() {
    this.playTone(150, 0.4, 'sawtooth', 0.12);
    this.playTone(140, 0.4, 'sawtooth', 0.1, 0.05);
  }
}

export const soundEngine = new SoundEngine();
