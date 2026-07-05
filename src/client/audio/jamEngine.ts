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

const FILTER_OPEN = 18000; // transparent lowpass cutoff

let started = false;
let playing = false;
let master: Tone.Gain;
let seq: Tone.Sequence<number> | null = null;

const voices: Array<Voice | null> = new Array(TRACKS).fill(null);
const trackGains: Array<Tone.Gain | null> = new Array(TRACKS).fill(null); // tremolo
const trackFilters: Array<Tone.Filter | null> = new Array(TRACKS).fill(null); // wah
let instrumentIds: string[] = new Array(TRACKS).fill('');
let active: Map<string, TrackFx> = new Map(); // cell key -> its wave
let rootPc = 0;

// A minimal audio-param shape so we can ramp synth.frequency / gain.gain / filter.frequency alike.
type Rampable = {
  cancelScheduledValues(t: number): unknown;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
};
function applyRamps(param: Rampable, values: number[], time: number, dur: number): void {
  param.cancelScheduledValues(time);
  param.setValueAtTime(values[0] ?? 0, time);
  for (let i = 1; i < values.length; i++) {
    param.linearRampToValueAtTime(values[i] ?? 0, time + (dur * i) / (values.length - 1));
  }
}
const wave = (cyc: number, i: number, n: number): number => Math.sin((i / (n - 1)) * cyc * 2 * Math.PI);
function vibratoCurve(baseHz: number, depth: number, cyc: number): number[] {
  const n = 17;
  return Array.from({ length: n }, (_, i) => baseHz * Math.pow(2, (depth * 2 * wave(cyc, i, n)) / 12));
}
function tremoloCurve(depth: number, cyc: number): number[] {
  const n = 17;
  return Array.from({ length: n }, (_, i) => 1 - depth * 0.7 * (0.5 - 0.5 * Math.cos((i / (n - 1)) * cyc * 2 * Math.PI)));
}
function wahCurve(depth: number, cyc: number): number[] {
  const n = 17;
  return Array.from({ length: n }, (_, i) => 300 + depth * 5000 * (0.5 + 0.5 * wave(cyc, i, n)));
}

let stepCb: ((step: number) => void) | null = null;
export function onStep(cb: (step: number) => void): void {
  stepCb = cb;
}

function buildSynth(inst: Instrument): AnySynth {
  switch (inst.synth) {
    case 'membrane': {
      const deep = inst.id === 'sub' || inst.id === 'boom';
      return new Tone.MembraneSynth({
        volume: deep ? -3 : -4,
        pitchDecay: deep ? 0.08 : 0.03,
        octaves: deep ? 8 : 5,
        envelope: { attack: 0.001, decay: deep ? 0.5 : 0.32, sustain: 0, release: 0.2 },
      });
    }
    case 'noise': {
      const short = inst.id === 'hat' || inst.id === 'tss';
      const long = inst.id === 'riser';
      const decay = short ? 0.03 : long ? 0.5 : 0.14;
      const type: 'white' | 'pink' = inst.id === 'snare' || inst.id === 'pah' ? 'pink' : 'white';
      return new Tone.NoiseSynth({
        volume: short ? -20 : -13,
        noise: { type },
        envelope: { attack: 0.001, decay, sustain: 0 },
      });
    }
    case 'metal':
      return new Tone.MetalSynth({ volume: -22 });
    case 'mono':
      return new Tone.MonoSynth({
        volume: -11,
        oscillator: { type: inst.recipe === 'meow' || inst.recipe === 'bark' ? 'sawtooth' : 'square' },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 400, octaves: 3 },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.15 },
      });
    case 'fm':
      return new Tone.FMSynth({ volume: -15 });
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
  voices[track] = { synth: buildSynth(inst), inst };
  routeTrack(track);
}

/** Connect a track's synth into its gain(tremolo) -> filter(wah) -> master chain. */
function routeTrack(track: number): void {
  const v = voices[track];
  const g = trackGains[track];
  if (!v || !g) return;
  v.synth.disconnect();
  v.synth.connect(g);
}

type PitchedSynth = Tone.MembraneSynth | Tone.MetalSynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth;

const hz = (n: string): number => Tone.Frequency(n).toFrequency();

function triggerTrack(track: number, step: number, time: number): void {
  const v = voices[track];
  const gain = trackGains[track];
  const filter = trackFilters[track];
  if (!v || !gain || !filter) return;
  triggerVoice(v.inst, v.synth, gain, filter, active.get(`${track}_${step}`), step, time);
}

/** Trigger the raw sound. Returns whether it's pitched (vibrato-eligible) and its base Hz. */
function triggerBase(
  inst: Instrument,
  synth: AnySynth,
  step: number,
  time: number,
  dur: number | undefined
): { pitched: boolean; baseHz: number } {
  if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease(dur ?? (inst.id === 'pah' || inst.id === 'clap' ? '8n' : '16n'), time);
    return { pitched: false, baseHz: 0 };
  }
  if (inst.recipe) {
    applyRecipe(inst.recipe, inst, synth, step, time);
    return { pitched: false, baseHz: 0 };
  }
  const pitched = inst.category === 'bass' || inst.category === 'melody' || inst.category === 'fx';
  const note = pitched ? scaleNote(rootPc, inst, step) : (inst.note ?? 'C2');
  synth.frequency.cancelScheduledValues(time);
  synth.triggerAttackRelease(note, dur ?? '16n', time);
  return { pitched, baseHz: hz(note) };
}

function applyRecipe(r: string, inst: Instrument, synth: PitchedSynth, step: number, time: number): void {
  const f = synth.frequency;
  switch (r) {
    case 'chirp': // bird — quick up-sweep
      synth.triggerAttackRelease(hz('G5'), 0.1, time);
      f.setValueAtTime(hz('G5'), time);
      f.exponentialRampToValueAtTime(hz('E7'), time + 0.09);
      break;
    case 'meow': // cat — up then down
      synth.triggerAttackRelease(hz('E4'), 0.3, time);
      f.setValueAtTime(hz('E4'), time);
      f.linearRampToValueAtTime(hz('A4'), time + 0.12);
      f.linearRampToValueAtTime(hz('D4'), time + 0.28);
      break;
    case 'bark': // dog — short down-blip
      synth.triggerAttackRelease(hz('C3'), 0.12, time);
      f.setValueAtTime(hz('C3'), time);
      f.exponentialRampToValueAtTime(hz('G2'), time + 0.08);
      break;
    case 'ribbit': // frog — croak wobble
      synth.triggerAttackRelease(hz('A2'), 0.16, time);
      f.setValueAtTime(hz('A2'), time);
      f.linearRampToValueAtTime(hz('D3'), time + 0.06);
      f.linearRampToValueAtTime(hz('A2'), time + 0.14);
      break;
    case 'drop': // fx — long down-lifter
      synth.triggerAttackRelease(hz('C6'), 0.32, time);
      f.setValueAtTime(hz('C6'), time);
      f.exponentialRampToValueAtTime(hz('C3'), time + 0.3);
      break;
    case 'vox': // voice — follows the scale
      synth.triggerAttackRelease(scaleNote(rootPc, inst, step), '8n', time);
      break;
    default:
      synth.triggerAttackRelease(inst.note ?? 'C4', '16n', time);
  }
}

/** Play a beat and apply ITS wave (per-cell fx) as a per-note modulation. */
function triggerVoice(
  inst: Instrument,
  synth: AnySynth,
  gain: Tone.Gain,
  filter: Tone.Filter,
  fx: TrackFx | undefined,
  step: number,
  time: number
): void {
  // reset this track's modulation to neutral for the note
  gain.gain.cancelScheduledValues(time);
  gain.gain.setValueAtTime(1, time);
  filter.frequency.cancelScheduledValues(time);
  filter.frequency.setValueAtTime(FILTER_OPEN, time);

  const hasFx = !!fx && fx.type !== 'none' && fx.depth > 0;
  const base = triggerBase(inst, synth, step, time, hasFx ? 0.4 : undefined);

  if (!hasFx || !fx) return;
  const cyc = 0.5 + fx.rate * 3;
  if (fx.type === 'tremolo') applyRamps(gain.gain, tremoloCurve(fx.depth, cyc), time, 0.4);
  else if (fx.type === 'wah') applyRamps(filter.frequency, wahCurve(fx.depth, cyc), time, 0.4);
  else if (fx.type === 'vibrato' && base.pitched && base.baseHz > 0 && !(synth instanceof Tone.NoiseSynth))
    applyRamps(synth.frequency, vibratoCurve(base.baseHz, fx.depth, cyc), time, 0.4);
}

export async function initAudio(): Promise<void> {
  if (started) return;
  await Tone.start(); // must be inside a user gesture
  started = true;
  const limiter = new Tone.Limiter(-2).toDestination();
  master = new Tone.Gain(0.9).connect(limiter);

  // Per-track chain: synth -> gain (tremolo) -> filter (wah) -> master.
  for (let t = 0; t < TRACKS; t++) {
    const filter = new Tone.Filter(FILTER_OPEN, 'lowpass').connect(master);
    const gain = new Tone.Gain(1).connect(filter);
    trackFilters[t] = filter;
    trackGains[t] = gain;
  }

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

/** The merged cells to play (shared ± local draft) → each key `${track}_${step}` maps to its wave. */
export function setActiveCells(cells: Map<string, TrackFx>): void {
  active = cells;
}

export function start(): void {
  if (!started || playing) return;
  Tone.getTransport().start('+0.1');
  playing = true;
}

/**
 * Play only when this post has focus. In an inline feed many posts are mounted
 * at once; pause + mute the ones that aren't being looked at so they don't
 * overlap. Called from window focus/blur + visibilitychange.
 */
export function setPlaying(on: boolean): void {
  if (!started) return;
  const t = Tone.getTransport();
  if (on) {
    master.gain.rampTo(0.9, 0.06);
    if (t.state !== 'started') t.start('+0.02');
    playing = true;
  } else {
    master.gain.rampTo(0, 0.06);
    t.pause();
    playing = false;
  }
}

export function isPlaying(): boolean {
  return playing;
}
