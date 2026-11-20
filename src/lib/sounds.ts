/**
 * Short sound cues for the TV, made in the browser: no audio files.
 *
 * A cue is a few notes. Which moments play which cue is each game's
 * business; what a cue sounds like is the theme's (a pack may bring
 * its own `sounds`), with these as the default.
 */

export type Cue = 'start' | 'reveal' | 'open' | 'drinks' | 'alarm' | 'win';

/** Notes are [frequency in Hz, length in ms]. */
export type Sound = { wave?: OscillatorType; notes: [number, number][] };
export type SoundSet = Partial<Record<Cue, Sound>>;

export const DEFAULT_SOUNDS: Record<Cue, Sound> = {
  start: { wave: 'triangle', notes: [[440, 120], [660, 240]] },
  reveal: { wave: 'triangle', notes: [[660, 100], [880, 220]] },
  open: { wave: 'sine', notes: [[523, 100], [784, 240]] },
  drinks: { wave: 'triangle', notes: [[392, 140], [523, 300]] },
  alarm: { wave: 'sawtooth', notes: [[220, 200], [165, 400]] },
  win: { wave: 'triangle', notes: [[523, 120], [659, 120], [784, 120], [1047, 480]] },
};

let ctx: AudioContext | null = null;

/**
 * Browsers only allow sound after someone has touched the page. Call
 * this from a tap; it returns whether sound is now on.
 */
export async function unlockSound(): Promise<boolean> {
  try {
    ctx ||= new AudioContext();
    if (ctx.state !== 'running') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

export function soundOn(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Play a cue, if sound has been turned on. Never throws: a silent TV is fine. */
export function playCue(cue: Cue, sounds?: SoundSet): void {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const sound = sounds?.[cue] ?? DEFAULT_SOUNDS[cue];
    let at = ctx.currentTime + 0.02;
    for (const [hz, ms] of sound.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound.wave ?? 'triangle';
      osc.frequency.value = hz;
      // A quick fade in and out, so notes don't click.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + ms / 1000 + 0.02);
      at += ms / 1000;
    }
  } catch {
    // no sound, no problem
  }
}
