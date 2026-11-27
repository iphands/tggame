/**
 * Procedural sound via WebAudio: no audio files. The context is created on the first user
 * gesture (browsers block audio before that). Each game builds its own cues from `tone` and
 * `noise`.
 */

export type MuteStore = { muted: () => boolean; setMuted: (m: boolean) => void };

export function createAudio(saved: MuteStore) {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = saved.muted();

  const isMuted = (): boolean => muted;

  function setMuted(m: boolean): void {
    muted = m;
    saved.setMuted(m);
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.4, ctx.currentTime, 0.02);
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  function unlockAudio(): void {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function tone(wave: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur: number, vol: number, f0: number, f1: number): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
  }

  /** Somebody is being told to hurry up: a nudge (1), a honk (2), an air horn (3). */
  function heckle(level: number): void {
    if (level <= 1) return tone('sine', 700, 520, 0.12, 0.3);
    if (level === 2) {
      tone('sawtooth', 311, 300, 0.16, 0.3);
      tone('sawtooth', 311, 300, 0.22, 0.3, 0.2);
      return;
    }
    for (let i = 0; i < 3; i++) {
      tone('sawtooth', 392, 370, 0.2, 0.32, i * 0.22);
      tone('square', 494, 466, 0.2, 0.16, i * 0.22);
    }
  }

  return { isMuted, setMuted, unlockAudio, tone, noise, heckle };
}
