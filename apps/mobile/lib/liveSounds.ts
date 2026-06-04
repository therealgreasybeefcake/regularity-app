/**
 * Per-lap audio cues for the live spectator view. Synthesizes short tones with
 * the Web Audio API (no asset files). Web only — on native this is a no-op.
 * Browser autoplay policy requires a user gesture, so `ensureLiveAudio()` must be
 * called from a tap (the sound toggle) before tones will play.
 */

type LapType = 'bonus' | 'base' | 'broken' | 'changeover' | 'safety';

let ctx: any = null;

/** Lazily create/resume the audio context. Returns true if audio is available. */
export function ensureLiveAudio(): boolean {
  const g = globalThis as any;
  const AC = g.AudioContext || g.webkitAudioContext;
  if (!AC) return false;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return false;
    }
  }
  if (ctx && ctx.state === 'suspended') {
    try {
      ctx.resume();
    } catch {
      /* ignore */
    }
  }
  return !!ctx;
}

function tone(freq: number, startOffset: number, dur: number, type = 'sine', peak = 0.16): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play a short cue for a newly-recorded lap, distinct per lap type. */
export function playLapTone(lapType: LapType): void {
  if (!ctx) return;
  switch (lapType) {
    case 'bonus':
      tone(880, 0, 0.12);
      tone(1318.5, 0.1, 0.2); // bright rising "ding-ding"
      break;
    case 'base':
      tone(660, 0, 0.16); // neutral single tone
      break;
    case 'broken':
      tone(196, 0, 0.32, 'sawtooth', 0.2); // low buzz — went under target
      break;
    case 'changeover':
      tone(523.25, 0, 0.12);
      tone(523.25, 0.16, 0.14); // double beep — handover
      break;
    case 'safety':
      tone(330, 0, 0.45, 'triangle'); // slow low tone
      break;
  }
}
