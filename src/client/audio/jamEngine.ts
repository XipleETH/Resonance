/**
 * RESONANCE audio engine — plays the SHARED collaborative pattern.
 *
 * Lessons baked in from the on-device spike (Android Reddit webview):
 *  - polyphony ceiling ~8-12 voices → use ONE monophonic synth per track
 *    (max simultaneous voices = number of tracks = 8; near the low end of the
 *    measured ceiling, so watch for distortion on device — a Limiter is in place).
 *  - short envelopes + a master Limiter so stacked peaks don't distort.
 *  - lightweight synths only.
 *
 * All melody is locked to C minor pentatonic → "you can't play a wrong note".
 */
import * as Tone from 'tone';
import {
  BVOL_DB,
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
  | Tone.FMSynth
  | Tone.AMSynth
  | Tone.DuoSynth;

type Voice = { synth: AnySynth; inst: Instrument };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MINOR_PENT = [0, 3, 5, 7, 10]; // semitone offsets from the root

function baseOctaveFor(inst: Instrument): number {
  if (inst.octave !== undefined) return inst.octave;
  switch (inst.category) {
    case 'bass':
      return 2;
    case 'melody':
    case 'pad':
      return 4;
    case 'fx':
      return 5;
    default:
      return 3;
  }
}

/** Whether a sound rides the day's scale (pitched) vs. plays a fixed note / noise. */
function isPitched(inst: Instrument): boolean {
  if (inst.pitched !== undefined) return inst.pitched;
  return inst.category === 'bass' || inst.category === 'melody' || inst.category === 'fx' || inst.category === 'pad';
}

/**
 * Note for a pitched instrument at a given step (spreads a pentatonic phrase across the bar).
 * `offset` shifts this beat up/down the scale in scale-degrees (per-beat pitch; negative = down /
 * "backwards"), wrapping through octaves. offset 0 = the original column-derived pitch.
 */
function scaleNote(rootPc: number, inst: Instrument, step: number, offset = 0): string {
  const L = MINOR_PENT.length;
  const octBump = step >= 8 ? 1 : 0; // second half of the bar climbs an octave
  const totalDeg = (step % L) + offset;
  const degree = ((totalDeg % L) + L) % L;
  const degOct = Math.floor(totalDeg / L);
  const semi = rootPc + (MINOR_PENT[degree] ?? 0);
  // Clamp to an audible range so a big pitch offset can't push a note subsonic (silent) or ultrasonic.
  const octave = Math.min(7, Math.max(1, baseOctaveFor(inst) + octBump + degOct + Math.floor(semi / 12)));
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

const envOf = (inst: Instrument, d: [number, number, number, number]): { attack: number; decay: number; sustain: number; release: number } => {
  const e = inst.env ?? d;
  return { attack: e[0], decay: e[1], sustain: e[2], release: e[3] };
};

// Loudness normalization: the library's hand-tuned volumes span ~-3 to -26 dB, so the
// quietest sounds (bright metals, soft shakers) were nearly inaudible. Floor the effective
// volume so nothing drops below VOL_FLOOR — drums still sit louder than cymbals, but every
// sound is now audible on its own.
const VOL_FLOOR = -16;
function buildSynth(inst: Instrument): AnySynth {
  const V = (d: number): number => Math.max(VOL_FLOOR, inst.vol ?? d);
  switch (inst.synth) {
    case 'membrane': {
      const deep = inst.id === 'sub' || inst.id === 'boom';
      return new Tone.MembraneSynth({
        volume: V(deep ? -3 : -4),
        pitchDecay: deep ? 0.08 : 0.03,
        octaves: deep ? 8 : 5,
        envelope: envOf(inst, [0.001, deep ? 0.5 : 0.32, 0, 0.2]),
      });
    }
    case 'noise': {
      const short = inst.id === 'hat' || inst.id === 'tss';
      const long = inst.id === 'riser';
      const decay = inst.env ? inst.env[1] : short ? 0.03 : long ? 0.5 : 0.14;
      const type = inst.noise ?? (inst.id === 'snare' || inst.id === 'pah' ? 'pink' : 'white');
      return new Tone.NoiseSynth({
        volume: V(short ? -20 : -13),
        noise: { type },
        envelope: { attack: inst.env?.[0] ?? 0.001, decay, sustain: 0 },
      });
    }
    case 'metal':
      return new Tone.MetalSynth({ volume: V(-22) });
    case 'mono':
      return new Tone.MonoSynth({
        volume: V(-11),
        portamento: inst.glide ?? 0,
        oscillator: { type: inst.osc ?? (inst.recipe === 'meow' || inst.recipe === 'bark' ? 'sawtooth' : 'square') },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: inst.filterHz ?? 400, octaves: 3 },
        envelope: envOf(inst, [0.01, 0.2, 0.3, 0.15]),
      });
    case 'fm':
      // FM is inherently quieter than mono/membrane, so its default sits higher — otherwise
      // the FM recipe sounds (lobo/búho/pájaro/láser…) come out weak next to everything else.
      return new Tone.FMSynth({ volume: V(-10), portamento: inst.glide ?? 0, envelope: envOf(inst, [0.01, 0.2, 0.2, 0.2]) });
    case 'am':
      return new Tone.AMSynth({ volume: V(-14), portamento: inst.glide ?? 0, oscillator: { type: inst.osc ?? 'sine' }, envelope: envOf(inst, [0.01, 0.2, 0.3, 0.2]) });
    case 'duo':
      return new Tone.DuoSynth({ volume: V(-17), vibratoAmount: 0.15 });
    case 'synth':
    case 'pluck':
    default:
      return new Tone.Synth({
        volume: V(-14),
        oscillator: { type: inst.osc ?? 'triangle' },
        envelope: envOf(inst, [0.005, 0.2, 0.1, 0.2]),
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

type PitchedSynth = Tone.MembraneSynth | Tone.MetalSynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth;

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
  dur: number | undefined,
  offset = 0
): { pitched: boolean; baseHz: number } {
  if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease(dur ?? (inst.id === 'pah' || inst.id === 'clap' ? '8n' : '16n'), time);
    return { pitched: false, baseHz: 0 };
  }
  if (inst.recipe) {
    applyRecipe(inst.recipe, inst, synth, step, time);
    return { pitched: false, baseHz: 0 };
  }
  const pitched = isPitched(inst);
  const note = pitched ? scaleNote(rootPc, inst, step, offset) : (inst.note ?? 'C2');
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
    case 'owl': // soft descending hoot
      synth.triggerAttackRelease(hz('D4'), 0.35, time);
      f.setValueAtTime(hz('D4'), time);
      f.linearRampToValueAtTime(hz('B3'), time + 0.16);
      break;
    case 'duck': // quack down-blip
      synth.triggerAttackRelease(hz('B3'), 0.14, time);
      f.setValueAtTime(hz('B3'), time);
      f.exponentialRampToValueAtTime(hz('F3'), time + 0.12);
      break;
    case 'cricket': // quick high chirp
      synth.triggerAttackRelease(hz('B6'), 0.07, time);
      break;
    case 'moo': // low falling
      synth.triggerAttackRelease(hz('C3'), 0.42, time);
      f.setValueAtTime(hz('E3'), time);
      f.linearRampToValueAtTime(hz('C3'), time + 0.38);
      break;
    case 'baa': // bleaty wobble
      synth.triggerAttackRelease(hz('E4'), 0.3, time);
      f.setValueAtTime(hz('E4'), time);
      f.linearRampToValueAtTime(hz('D4'), time + 0.06);
      f.linearRampToValueAtTime(hz('E4'), time + 0.12);
      f.linearRampToValueAtTime(hz('D4'), time + 0.18);
      break;
    case 'buzz': // sustained insect buzz
      synth.triggerAttackRelease(hz('A2'), 0.3, time);
      f.setValueAtTime(hz('A2'), time);
      f.linearRampToValueAtTime(hz('B2'), time + 0.15);
      f.linearRampToValueAtTime(hz('A2'), time + 0.3);
      break;
    case 'howl': // rise then fall
      synth.triggerAttackRelease(hz('A3'), 0.6, time);
      f.setValueAtTime(hz('A3'), time);
      f.exponentialRampToValueAtTime(hz('E4'), time + 0.3);
      f.linearRampToValueAtTime(hz('C4'), time + 0.58);
      break;
    case 'crow': // squawk up-down
      synth.triggerAttackRelease(hz('C4'), 0.25, time);
      f.setValueAtTime(hz('C4'), time);
      f.linearRampToValueAtTime(hz('G4'), time + 0.1);
      f.linearRampToValueAtTime(hz('D4'), time + 0.22);
      break;
    case 'bubble': // quick up
      synth.triggerAttackRelease(hz('C5'), 0.1, time);
      f.setValueAtTime(hz('C5'), time);
      f.exponentialRampToValueAtTime(hz('C6'), time + 0.08);
      break;
    case 'drip': // short down plink
      synth.triggerAttackRelease(hz('C6'), 0.12, time);
      f.setValueAtTime(hz('C6'), time);
      f.exponentialRampToValueAtTime(hz('G5'), time + 0.1);
      break;
    case 'laser': // fast down zap
      synth.triggerAttackRelease(hz('C7'), 0.18, time);
      f.setValueAtTime(hz('C7'), time);
      f.exponentialRampToValueAtTime(hz('C4'), time + 0.16);
      break;
    case 'coin': // up blip (arcade coin)
      synth.triggerAttackRelease(hz('E5'), 0.12, time);
      f.setValueAtTime(hz('E5'), time);
      f.exponentialRampToValueAtTime(hz('B5'), time + 0.06);
      break;
    case 'powerup': // rising sweep
      synth.triggerAttackRelease(hz('C4'), 0.3, time);
      f.setValueAtTime(hz('C4'), time);
      f.exponentialRampToValueAtTime(hz('C6'), time + 0.28);
      break;
    case 'siren': // up and down
      synth.triggerAttackRelease(hz('A4'), 0.4, time);
      f.setValueAtTime(hz('A4'), time);
      f.linearRampToValueAtTime(hz('E5'), time + 0.2);
      f.linearRampToValueAtTime(hz('A4'), time + 0.38);
      break;
    case 'warp': // down then up
      synth.triggerAttackRelease(hz('C5'), 0.3, time);
      f.setValueAtTime(hz('C5'), time);
      f.exponentialRampToValueAtTime(hz('C3'), time + 0.14);
      f.exponentialRampToValueAtTime(hz('C5'), time + 0.28);
      break;
    case 'whistle': // slide up whistle
      synth.triggerAttackRelease(hz('C6'), 0.35, time);
      f.setValueAtTime(hz('G5'), time);
      f.exponentialRampToValueAtTime(hz('C6'), time + 0.15);
      break;
    default:
      synth.triggerAttackRelease(inst.note ?? 'C4', '16n', time);
  }
}

/**
 * Play a beat and apply ITS wave (per-cell fx) as a per-note modulation.
 * `fx.pitch` shifts the note up/down the scale; `fx.sub` fires it as 1..4 rapid hits (a
 * ratchet/roll within the step); `fx.dur` sets each hit's length (staccato → legato).
 */
function triggerVoice(
  inst: Instrument,
  synth: AnySynth,
  gain: Tone.Gain,
  filter: Tone.Filter,
  fx: TrackFx | undefined,
  step: number,
  time: number
): void {
  const sub = Math.max(1, Math.min(4, Math.round(fx?.sub ?? 1)));
  const durN = fx?.dur ?? 0.5;
  const pitch = fx?.pitch ?? 0;
  const stepDur = Tone.Time('16n').toSeconds();
  const slot = stepDur / sub; // time budget per ratchet hit
  // note length: staccato (short) → legato (rings ~1.6 steps for a single hit). For a ratchet
  // the length is capped to the slot so hits stay distinct.
  const legatoMax = sub > 1 ? slot * 0.95 : stepDur * 1.6;
  const staccatoMin = sub > 1 ? slot * 0.2 : stepDur * 0.22;
  const hasFx = !!fx && fx.type !== 'none' && fx.depth > 0;
  // Ratchet hits stay short so they read as distinct; a single beat with a wave gets a
  // sustained note so the LFO has room to modulate it. The LFO window follows the note.
  const dryLen = staccatoMin + (legatoMax - staccatoMin) * durN;
  // Never below ~45ms, or a percussive attack can be cut to silence.
  const noteLen = Math.max(0.045, sub > 1 ? dryLen : hasFx ? Math.max(dryLen, 0.35) : dryLen);
  const win = Math.max(noteLen, 0.1);
  const cyc = fx ? 0.5 + fx.rate * 3 : 1;
  // Per-beat volume: this beat's resting gain. Tremolo rides on top of it (see the map below).
  const g0 = Math.pow(10, ((fx?.vol ?? 0) * BVOL_DB) / 20);

  for (let k = 0; k < sub; k++) {
    const t = time + k * slot;
    // reset this track's modulation to this beat's level / an open filter, for each hit
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(g0, t);
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setValueAtTime(FILTER_OPEN, t);

    const base = triggerBase(inst, synth, step, t, noteLen, pitch);
    if (!hasFx || !fx) continue;
    if (fx.type === 'tremolo')
      applyRamps(
        gain.gain,
        tremoloCurve(fx.depth, cyc).map((v) => v * g0),
        t,
        win
      );
    else if (fx.type === 'wah') applyRamps(filter.frequency, wahCurve(fx.depth, cyc), t, win);
    else if (fx.type === 'vibrato' && base.pitched && base.baseHz > 0 && !(synth instanceof Tone.NoiseSynth))
      applyRamps(synth.frequency, vibratoCurve(base.baseHz, fx.depth, cyc), t, win);
  }
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

/**
 * Resume the AudioContext if a no-gesture autoplay attempt (on the fresh expanded page)
 * left it suspended. MUST be called from inside a user gesture to actually take effect.
 */
export async function resumeAudio(): Promise<void> {
  try {
    const ctx = Tone.getContext();
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    /* ignore */
  }
}
