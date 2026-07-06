/**
 * Shared types + constants for the collaborative jam (RESONANCE).
 * No DOM / Node deps — this file is imported by both client and server.
 */

export const STEPS = 16;
export const TRACKS = 8;
export const MAX_FICHAS = 4;
export const REFILL_MS = 12 * 60 * 60 * 1000; // energy refills to MAX every 12h

// ---------------------------------------------------------------------------
// Sound library (the palette users place / switch between).
// MVP = synthesized (zero assets). Animals/voice/foley samples come after the
// on-device audio spike tells us the bundle budget.
// ---------------------------------------------------------------------------
export type InstrumentCategory = 'drum' | 'bass' | 'melody' | 'fx' | 'animal' | 'voice';
export type SynthKind = 'membrane' | 'noise' | 'metal' | 'mono' | 'fm' | 'pluck';

export type Instrument = {
  id: string;
  label: string;
  category: InstrumentCategory;
  synth: SynthKind;
  emoji: string;
  recipe?: string; // special trigger recipe (pitch envelope) for animals/voice/fx
  note?: string; // base note for pitched instruments (client snaps to the day's scale)
  color: number; // crayon color for its pads
};

export const LIBRARY: readonly Instrument[] = [
  // batería
  { id: 'kick', label: 'Bombo', category: 'drum', synth: 'membrane', emoji: '🥁', note: 'C1', color: 0xe2574c },
  { id: 'snare', label: 'Caja', category: 'drum', synth: 'noise', emoji: '👏', color: 0x4a7fd0 },
  { id: 'hat', label: 'Hi-hat', category: 'drum', synth: 'noise', emoji: '🎩', color: 0xf2b705 },
  { id: 'clap', label: 'Palmas', category: 'drum', synth: 'noise', emoji: '👐', color: 0xef8a3c },
  { id: 'tom', label: 'Tom', category: 'drum', synth: 'membrane', emoji: '🪘', note: 'G1', color: 0xd06bd0 },
  // bajo
  { id: 'bass', label: 'Bajo', category: 'bass', synth: 'mono', emoji: '🎸', note: 'C2', color: 0x5bb974 },
  { id: 'sub', label: 'Sub 808', category: 'bass', synth: 'membrane', emoji: '🔊', note: 'C1', color: 0x2f8a4e },
  // melodía
  { id: 'pluck', label: 'Pluck', category: 'melody', synth: 'pluck', emoji: '🪕', note: 'C4', color: 0x9b6bd0 },
  { id: 'lead', label: 'Lead', category: 'melody', synth: 'fm', emoji: '🎹', note: 'C4', color: 0x6f42ab },
  { id: 'keys', label: 'Teclas', category: 'melody', synth: 'pluck', emoji: '🎶', note: 'C4', color: 0x7f6bd0 },
  { id: 'bell', label: 'Campana', category: 'melody', synth: 'metal', emoji: '🔔', note: 'C5', color: 0x3fb0ac },
  // fx
  { id: 'zap', label: 'Zap', category: 'fx', synth: 'fm', emoji: '⚡', note: 'C6', color: 0xef476f },
  { id: 'riser', label: 'Riser', category: 'fx', synth: 'noise', emoji: '🌊', color: 0xffd166 },
  { id: 'drop', label: 'Drop', category: 'fx', synth: 'mono', emoji: '💧', recipe: 'drop', note: 'C5', color: 0x3fb0ac },
  // animales 🐾 (síntesis juguetona)
  { id: 'bird', label: 'Pájaro', category: 'animal', synth: 'fm', emoji: '🐦', recipe: 'chirp', note: 'C6', color: 0x7fd0ff },
  { id: 'cat', label: 'Gato', category: 'animal', synth: 'mono', emoji: '🐱', recipe: 'meow', note: 'E4', color: 0xef8a3c },
  { id: 'dog', label: 'Perro', category: 'animal', synth: 'mono', emoji: '🐶', recipe: 'bark', note: 'C3', color: 0xd0a06b },
  { id: 'frog', label: 'Rana', category: 'animal', synth: 'mono', emoji: '🐸', recipe: 'ribbit', note: 'C3', color: 0x6cba7d },
  // voz 🎤 (beatbox)
  { id: 'boom', label: 'Boom', category: 'voice', synth: 'membrane', emoji: '🗣️', note: 'C1', color: 0x9b6bd0 },
  { id: 'tss', label: 'Tss', category: 'voice', synth: 'noise', emoji: '🤫', color: 0x4a7fd0 },
  { id: 'pah', label: 'Pah', category: 'voice', synth: 'noise', emoji: '💥', color: 0xe2574c },
  { id: 'uh', label: 'Uh', category: 'voice', synth: 'fm', emoji: '🎤', recipe: 'vox', note: 'A3', color: 0xe86ea8 },
];

export type Category = {
  id: InstrumentCategory;
  label: string;
  emoji: string;
  color: number;
};

/** Palette shown at the bottom (tap a chip to set the selected track's instrument). */
export const CATEGORIES: readonly Category[] = [
  { id: 'drum', label: 'Batería', emoji: '🥁', color: 0xe2574c },
  { id: 'bass', label: 'Bajo', emoji: '🎸', color: 0x5bb974 },
  { id: 'melody', label: 'Melodía', emoji: '🎹', color: 0x9b6bd0 },
  { id: 'fx', label: 'FX', emoji: '✨', color: 0xef8a3c },
  { id: 'animal', label: 'Animales', emoji: '🐾', color: 0x3fb0ac },
  { id: 'voice', label: 'Voz', emoji: '🎤', color: 0x4a7fd0 },
];

export function instrumentById(id: string): Instrument | undefined {
  return LIBRARY.find((i) => i.id === id);
}

export function instrumentsInCategory(cat: InstrumentCategory): Instrument[] {
  return LIBRARY.filter((i) => i.category === cat);
}

// ---------------------------------------------------------------------------
// Expression wave (per-track LFO effect) — the draggable "wave" the user shapes.
// depth 0 = flat/off. rate = how stretched/compressed the wave is (LFO speed).
// ---------------------------------------------------------------------------
export type FxType = 'none' | 'vibrato' | 'tremolo' | 'wah';
export type TrackFx = { type: FxType; depth: number; rate: number }; // depth & rate in 0..1

export const FLAT_FX: TrackFx = { type: 'vibrato', depth: 0, rate: 0.4 };

export const FX_TARGETS: readonly { type: FxType; label: string; emoji: string }[] = [
  { type: 'vibrato', label: 'Vibrato', emoji: '🌊' },
  { type: 'tremolo', label: 'Trémolo', emoji: '📢' },
  { type: 'wah', label: 'Wah', emoji: '🚿' },
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function encodeFx(fx: TrackFx): string {
  return `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}`;
}
export function decodeFx(s: string | undefined): TrackFx {
  if (!s) return { ...FLAT_FX };
  const parts = s.split(':');
  const t = parts[0] ?? 'vibrato';
  const type: FxType = t === 'vibrato' || t === 'tremolo' || t === 'wah' || t === 'none' ? t : 'vibrato';
  return { type, depth: clamp01(Number(parts[1] ?? 0) / 100), rate: clamp01(Number(parts[2] ?? 40) / 100) };
}

// ---------------------------------------------------------------------------
// Jam state
// ---------------------------------------------------------------------------
export type JamMeta = {
  day: string; // YYYY-MM-DD
  key: string; // e.g. 'C'
  scale: string; // e.g. 'minor-pentatonic'
  bpm: number;
  bpmMin: number;
  bpmMax: number;
  t0: number; // epoch ms anchor of bar 0 (for future clock alignment)
  steps: number;
  tracks: number;
  version: number;
  instruments: string[]; // per-track instrument id ('' = empty slot)
};

// A placed beat. Each one carries its OWN expression wave (fx) + its placer (by).
export type Cell = { track: number; step: number; by: string; fx: TrackFx };

export type JamState = {
  meta: JamMeta;
  cells: Cell[];
};

// ---------------------------------------------------------------------------
// Actions (each costs 1 ficha) and realtime diffs
// ---------------------------------------------------------------------------
export type JamAction =
  | { kind: 'place'; track: number; step: number; fx: TrackFx }
  | { kind: 'remove'; track: number; step: number }
  | { kind: 'setInstrument'; track: number; instrument: string }
  | { kind: 'setCellFx'; track: number; step: number; fx: TrackFx } // change one beat's wave
  | { kind: 'nudgeTempo'; delta: number };

export type JamDiff =
  | { kind: 'place'; track: number; step: number; by: string; fx: TrackFx; version: number }
  | { kind: 'remove'; track: number; step: number; version: number }
  | { kind: 'setInstrument'; track: number; instrument: string; version: number }
  | { kind: 'cellFx'; track: number; step: number; fx: TrackFx; version: number }
  | { kind: 'tempo'; bpm: number; version: number }
  | { kind: 'presence'; count: number };

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------
export type JamInitResponse = {
  type: 'jamInit';
  postId: string;
  username: string;
  userId: string;
  state: JamState;
  energy: number;
  channel: string;
};

export type JamCommitResponse = {
  type: 'jamCommit';
  ok: boolean;
  energy: number;
  version: number;
  message?: string;
};
