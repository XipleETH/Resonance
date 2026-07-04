/**
 * Audio spike engine — answers the 3 make-or-break questions for a MUSIC game
 * inside Reddit's Devvit webview:
 *   1. Does Web Audio / Tone.js even PLAY in the webview? (ctxState === 'running')
 *   2. How many simultaneous sounds can the device handle before FPS/audio degrade?
 *      (press "+voces" / "+samples" until it chokes)
 *   3. What is the real audio latency? (baseLatency / outputLatency / lookAhead)
 *
 * Everything is procedurally synthesized (zero audio assets) so this file is
 * self-contained and cannot fail on a missing sample. All melodic content is
 * locked to C minor pentatonic — the "you can't play a wrong note" scale that
 * the real game will use so any combination of collaborators sounds consonant.
 */
import * as Tone from 'tone';

// C minor pentatonic — no dissonant intervals possible.
const BASS = ['C2', 'Eb2', 'F2', 'G2', 'Bb2'];
const LEAD = ['C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5', 'Eb5'];

let started = false;
let playing = false;
let extraVoices = 0;
let extraSamples = 0;
let currentStep = 0;

let kick: Tone.MembraneSynth;
let snare: Tone.NoiseSynth;
let hat: Tone.NoiseSynth;
let bass: Tone.MonoSynth;
let lead: Tone.Synth;
let pad: Tone.PolySynth;
let seq: Tone.Sequence<number>;
let noise: Tone.ToneAudioBuffer;

let beatCb: ((step: number) => void) | null = null;
export function onBeat(cb: (step: number) => void): void {
  beatCb = cb;
}

/** MUST be called from inside a real user gesture (a tap/click). */
export async function initAudio(): Promise<void> {
  if (started) return;
  await Tone.start(); // resumes the AudioContext — only works inside a gesture
  started = true;

  const master = new Tone.Gain(0.9).toDestination();
  const comp = new Tone.Compressor(-24, 3).connect(master);

  kick = new Tone.MembraneSynth({ volume: -3 }).connect(comp);
  snare = new Tone.NoiseSynth({
    volume: -14,
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
  }).connect(comp);
  hat = new Tone.NoiseSynth({
    volume: -22,
    envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
  }).connect(comp);
  bass = new Tone.MonoSynth({
    volume: -10,
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
  }).connect(comp);
  lead = new Tone.Synth({ volume: -16, oscillator: { type: 'triangle' } }).connect(comp);
  pad = new Tone.PolySynth(Tone.Synth).connect(comp);
  pad.maxPolyphony = 512;
  pad.volume.value = -28;

  // Generated decaying-noise one-shot to stress sample playback (no asset file).
  const raw = Tone.getContext().rawContext;
  const len = Math.floor(raw.sampleRate * 0.18);
  const audioBuf = raw.createBuffer(1, len, raw.sampleRate);
  const ch = audioBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  noise = new Tone.ToneAudioBuffer(audioBuf);

  const transport = Tone.getTransport();
  transport.bpm.value = 96;

  seq = new Tone.Sequence<number>(
    (time, step) => {
      currentStep = step;

      // --- the always-on base beat (what a fresh visitor would hear) ---
      if (step % 4 === 0) kick.triggerAttackRelease('C1', '8n', time);
      if (step === 4 || step === 12) snare.triggerAttackRelease('16n', time);
      if (step % 2 === 0) hat.triggerAttackRelease('32n', time);
      if (step % 2 === 0) {
        bass.triggerAttackRelease(BASS[(step / 2) % BASS.length] ?? 'C2', '8n', time);
      }
      if (step % 8 === 2 || step % 8 === 6) {
        lead.triggerAttackRelease(LEAD[step % LEAD.length] ?? 'C4', '16n', time);
      }

      // --- STRESS 1: extra polyphonic voices (a growing pad chord) ---
      if (extraVoices > 0) {
        const notes: string[] = [];
        for (let v = 0; v < extraVoices; v++) notes.push(LEAD[(step + v) % LEAD.length] ?? 'C4');
        pad.triggerAttackRelease(notes, '16n', time);
      }

      // --- STRESS 2: extra one-shot buffer sources per step ---
      for (let s = 0; s < extraSamples; s++) {
        const src = new Tone.ToneBufferSource(noise).toDestination();
        src.onended = () => src.dispose();
        src.start(time);
      }

      // Beat-synced visual on the animation frame nearest the AUDIO time.
      // (Do NOT draw straight from the transport callback — it runs ahead.)
      Tone.getDraw().schedule(() => {
        if (beatCb) beatCb(step);
      }, time);
    },
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    '16n'
  );
  seq.start(0);
}

export function togglePlay(): boolean {
  const t = Tone.getTransport();
  if (playing) {
    t.pause();
    playing = false;
  } else {
    t.start();
    playing = true;
  }
  return playing;
}

export function addVoices(n: number): void {
  extraVoices = Math.max(0, extraVoices + n);
}
export function addSamples(n: number): void {
  extraSamples = Math.max(0, extraSamples + n);
}
export function resetStress(): void {
  extraVoices = 0;
  extraSamples = 0;
}

export type AudioStats = {
  started: boolean;
  playing: boolean;
  ctxState: string;
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  lookAheadMs: number;
  voices: number;
  samples: number;
  step: number;
};

export function getStats(): AudioStats {
  if (!started) {
    return {
      started: false,
      playing: false,
      ctxState: '—',
      sampleRate: 0,
      baseLatencyMs: 0,
      outputLatencyMs: 0,
      lookAheadMs: 0,
      voices: 0,
      samples: 0,
      step: 0,
    };
  }
  const ctx = Tone.getContext();
  const raw = ctx.rawContext;
  const baseLatencyMs = 'baseLatency' in raw ? raw.baseLatency * 1000 : 0;
  const outputLatencyMs = 'outputLatency' in raw ? raw.outputLatency * 1000 : 0;
  return {
    started,
    playing,
    ctxState: raw.state,
    sampleRate: raw.sampleRate,
    baseLatencyMs,
    outputLatencyMs,
    lookAheadMs: ctx.lookAhead * 1000,
    voices: extraVoices,
    samples: extraSamples,
    step: currentStep,
  };
}
