/**
 * RESONANCE audio engine — plays the SHARED collaborative pattern.
 *
 * Lessons baked in from the on-device spike (Android Reddit webview):
 *  - polyphony ceiling ~8-12 voices → use ONE monophonic synth per track
 *    (max simultaneous voices = number of tracks = 6).
 *  - short envelopes + a master Limiter so stacked peaks don't distort.
 *  - lightweight synths only.
 *
 * All melody is locked to C minor pentatonic → "you can't play a wrong note".
 */
import * as Tone from 'tone';
import {
  TRACKS,
  instrumentById,
  type Instrument,
  type SynthKind,
  type TrackFx,
} from '../../shared/jam';

type AnySynth =
  | Tone.MembraneSynth
  | Tone.NoiseSynth
  | Tone.MetalSynth
  | Tone.MonoSynth
  | Tone.Synth
  | Tone.FMSynth;

type Voice = { synth: AnySynth; inst: Instrument };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MINOR_PENT = [0, 3, 5, 7, 10]; // semitone offsets from the root

function baseOctaveFor(inst: Instrument): number {
  switch (inst.category) {
    case 'bass':
      return 2;
    case 'melody':
      return 4;
    case 'fx':
      return 5;
    default:
      return 3;
  }
}

/** Note for a pitched instrument at a given step (spreads a pentatonic phrase across the bar). */
function scaleNote(rootPc: number, inst: Instrument, step: number): string {
  const degree = step % MINOR_PENT.length;
  const octBump = step >= 8 ? 1 : 0; // second half of the bar climbs an octave
  const semi = rootPc + (MINOR_PENT[degree] ?? 0);
  const octave = baseOctaveFor(inst) + octBump + Math.floor(semi / 12);
  return `${NOTE_NAMES[semi % 12] ?? 'C'}${octave}`;
}

let started = false;
let playing = false;
let master: Tone.Gain;
let seq: Tone.Sequence<number> | null = null;

type FxNode = Tone.Vibrato | Tone.Tremolo | Tone.AutoFilter;

const voices: Array<Voice | null> = new Array(TRACKS).fill(null);
const fxNodes: Array<FxNode | null> = new Array(TRACKS).fill(null);
const fxCodes: string[] = new Array(TRACKS).fill('');
let instrumentIds: string[] = new Array(TRACKS).fill('');
let active: Set<string> = new Set();
let rootPc = 0;

const rateToHz = (rate: number): number => 0.4 + rate * 7.6; // 0.4..8 Hz LFO

let stepCb: ((step: number) => void) | null = null;
export function onStep(cb: (step: number) => void): void {
  stepCb = cb;
}

function buildSynth(kind: SynthKind): AnySynth {
  switch (kind) {
    case 'membrane':
      return new Tone.MembraneSynth({ volume: -4 });
    case 'noise':
      return new Tone.NoiseSynth({
        volume: -14,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      });
    case 'metal':
      return new Tone.MetalSynth({ volume: -20 });
    case 'mono':
      return new Tone.MonoSynth({
        volume: -12,
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.15 },
      });
    case 'fm':
      return new Tone.FMSynth({ volume: -16 });
    case 'pluck':
    default:
      return new Tone.Synth({
        volume: -14,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.2 },
      });
  }
}

function setTrackInstrument(track: number, id: string): void {
  const prev = voices[track];
  if (prev) {
    prev.synth.dispose();
    voices[track] = null;
  }
  const inst = id ? instrumentById(id) : undefined;
  if (!inst) return;
  voices[track] = { synth: buildSynth(inst.synth), inst };
  routeTrack(track);
}

/** Connect a track's synth to master, through its effect node if it has one. */
function routeTrack(track: number): void {
  const v = voices[track];
  if (!v) return;
  v.synth.disconnect();
  const node = fxNodes[track];
  if (node) v.synth.connect(node);
  else v.synth.connect(master);
}

function buildFxNode(fx: TrackFx): FxNode | null {
  if (fx.type === 'none' || fx.depth <= 0) return null;
  const freq = rateToHz(fx.rate);
  if (fx.type === 'vibrato') {
    return new Tone.Vibrato({ frequency: freq, depth: fx.depth * 0.4 }).connect(master);
  }
  if (fx.type === 'tremolo') {
    return new Tone.Tremolo({ frequency: freq, depth: fx.depth * 0.9 }).connect(master).start();
  }
  // wah — an LFO-swept filter
  const af = new Tone.AutoFilter({ frequency: freq, depth: fx.depth, baseFrequency: 220, octaves: 4 }).connect(master);
  af.wet.value = 0.85;
  return af.start();
}

function setTrackFx(track: number, fx: TrackFx): void {
  const old = fxNodes[track];
  if (old) {
    old.dispose();
    fxNodes[track] = null;
  }
  fxNodes[track] = buildFxNode(fx);
  routeTrack(track);
}

/** Apply per-track expression waves; rebuilds only the tracks whose fx changed. */
export function setFxs(list: TrackFx[]): void {
  for (let t = 0; t < TRACKS; t++) {
    const fx = list[t];
    if (!fx) continue;
    const code = `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}`;
    if (code !== fxCodes[t]) {
      fxCodes[t] = code;
      setTrackFx(t, fx);
    }
  }
}

function triggerTrack(track: number, step: number, time: number): void {
  const v = voices[track];
  if (!v) return;
  const { synth, inst } = v;
  if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease('16n', time);
    return;
  }
  const pitched = inst.category === 'bass' || inst.category === 'melody' || inst.category === 'fx';
  const note = pitched ? scaleNote(rootPc, inst, step) : (inst.note ?? 'C2');
  // MembraneSynth / MetalSynth / MonoSynth / Synth / FMSynth all accept (note, duration, time)
  synth.triggerAttackRelease(note, '16n', time);
}

export async function initAudio(): Promise<void> {
  if (started) return;
  await Tone.start(); // must be inside a user gesture
  started = true;
  const limiter = new Tone.Limiter(-2).toDestination();
  master = new Tone.Gain(0.9).connect(limiter);

  seq = new Tone.Sequence<number>(
    (time, step) => {
      for (let t = 0; t < TRACKS; t++) {
        if (active.has(`${t}_${step}`)) triggerTrack(t, step, time);
      }
      Tone.getDraw().schedule(() => {
        if (stepCb) stepCb(step);
      }, time);
    },
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    '16n'
  );
  seq.start(0);
}

/** Set the day's key (root pitch class). */
export function setKey(key: string): void {
  const pc = NOTE_NAMES.indexOf(key);
  rootPc = pc >= 0 ? pc : 0;
}

/** Rebuild only the track synths whose instrument changed. */
export function setInstruments(ids: string[]): void {
  for (let t = 0; t < TRACKS; t++) {
    const id = ids[t] ?? '';
    if (id !== instrumentIds[t]) setTrackInstrument(t, id);
  }
  instrumentIds = ids.slice(0, TRACKS);
}

export function setBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

/** The merged set of cells to play (shared ± local draft). Keys are `${track}_${step}`. */
export function setActive(cells: Set<string>): void {
  active = cells;
}

export function start(): void {
  if (!started || playing) return;
  Tone.getTransport().start('+0.1');
  playing = true;
}

export function isPlaying(): boolean {
  return playing;
}
