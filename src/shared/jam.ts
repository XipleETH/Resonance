/**
 * Shared types + constants for the collaborative jam (JamPad).
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
export type InstrumentCategory = 'drum' | 'perc' | 'bass' | 'melody' | 'pad' | 'fx' | 'animal' | 'voice';
export type SynthKind = 'membrane' | 'noise' | 'metal' | 'mono' | 'fm' | 'am' | 'duo' | 'pluck' | 'synth';
export type OscType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type Instrument = {
  id: string;
  label: string;
  category: InstrumentCategory;
  synth: SynthKind;
  emoji?: string; // legacy; UI now uses a drawn icon (ic_<id>) instead
  recipe?: string; // special trigger recipe (pitch envelope) for animals/voice/fx
  note?: string; // base note for pitched instruments (client snaps to the day's scale)
  color: number; // crayon color for its pads
  // Optional per-sound voicing (data-driven so 98 sounds are just data, not code):
  osc?: OscType; // oscillator waveform
  vol?: number; // dB trim
  env?: [number, number, number, number]; // [attack, decay, sustain, release]
  filterHz?: number; // lowpass cutoff base
  filterQ?: number; // resonance
  noise?: 'white' | 'pink' | 'brown'; // for noise synth
  glide?: number; // portamento seconds (mono/duo/fm)
  octave?: number; // base octave override for pitched sounds
  pitched?: boolean; // force pitched/unpitched (else derived from category)
};

/** How many of the whole library are offered in the picker each day (3 cols x 8 rows). */
export const DAILY_POOL_SIZE = 24;

/** Deterministic per-day subset of the library (same for everyone that day). */
export function pickDailyPool(day: string, size: number = DAILY_POOL_SIZE): string[] {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = (): number => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
  const ids = LIBRARY.map((i) => i.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
  }
  return ids.slice(0, Math.min(size, ids.length));
}

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

  // ===== batch 1: percussion, bass, mallets & synths =====
  // percusión
  { id: 'rim', label: 'Aro', category: 'perc', synth: 'synth', osc: 'square', note: 'E5', pitched: false, env: [0.001, 0.05, 0, 0.05], vol: -16, color: 0xd0a06b },
  { id: 'cowbell', label: 'Cencerro', category: 'perc', synth: 'metal', pitched: false, vol: -24, color: 0xf2b705 },
  { id: 'conga', label: 'Conga', category: 'perc', synth: 'membrane', note: 'A2', pitched: false, env: [0.001, 0.22, 0, 0.15], color: 0xd0794a },
  { id: 'bongo', label: 'Bongó', category: 'perc', synth: 'membrane', note: 'E3', pitched: false, env: [0.001, 0.16, 0, 0.12], color: 0xc06a3a },
  { id: 'woodblock', label: 'Madera', category: 'perc', synth: 'synth', osc: 'square', note: 'C5', pitched: false, env: [0.001, 0.06, 0, 0.05], vol: -13, color: 0xc8935a },
  { id: 'shaker', label: 'Maraca', category: 'perc', synth: 'noise', noise: 'white', env: [0.001, 0.05, 0, 0.02], vol: -20, color: 0x8fd6a0 },
  { id: 'tamb', label: 'Pandereta', category: 'perc', synth: 'noise', noise: 'white', env: [0.001, 0.09, 0, 0.03], vol: -18, color: 0xf2b705 },
  { id: 'clave', label: 'Clave', category: 'perc', synth: 'synth', osc: 'square', note: 'A5', pitched: false, env: [0.001, 0.05, 0, 0.04], vol: -14, color: 0xc8935a },
  { id: 'ride', label: 'Ride', category: 'perc', synth: 'metal', pitched: false, vol: -26, color: 0xe0b23a },
  { id: 'crash', label: 'Crash', category: 'perc', synth: 'noise', noise: 'white', env: [0.001, 0.6, 0, 0.3], vol: -18, color: 0xf2c14e },
  // bajos
  { id: 'subsine', label: 'Sub seno', category: 'bass', synth: 'synth', osc: 'sine', octave: 1, note: 'C1', env: [0.005, 0.3, 0.4, 0.2], vol: -8, color: 0x2f8a4e },
  { id: 'reese', label: 'Reese', category: 'bass', synth: 'mono', osc: 'sawtooth', octave: 2, glide: 0.02, filterHz: 220, note: 'C2', color: 0x3b9a63 },
  { id: 'pluckbass', label: 'Bajo pluck', category: 'bass', synth: 'synth', osc: 'triangle', octave: 2, env: [0.002, 0.18, 0.05, 0.1], note: 'C2', color: 0x5bb974 },
  { id: 'growl', label: 'Gruñido', category: 'bass', synth: 'fm', octave: 2, glide: 0.01, note: 'C2', vol: -13, color: 0x1f6e44 },
  // mallets & teclados
  { id: 'marimba', label: 'Marimba', category: 'melody', synth: 'synth', osc: 'sine', env: [0.002, 0.28, 0, 0.2], note: 'C4', color: 0xc8935a },
  { id: 'xylo', label: 'Xilófono', category: 'melody', synth: 'synth', osc: 'triangle', octave: 5, env: [0.001, 0.18, 0, 0.12], note: 'C5', color: 0xef8a3c },
  { id: 'kalimba', label: 'Kalimba', category: 'melody', synth: 'synth', osc: 'sine', octave: 5, env: [0.002, 0.22, 0, 0.15], note: 'C5', color: 0xc8935a },
  { id: 'musicbox', label: 'Cajita', category: 'melody', synth: 'synth', osc: 'sine', octave: 6, env: [0.001, 0.4, 0, 0.25], note: 'C6', vol: -12, color: 0xe86ea8 },
  { id: 'organ', label: 'Órgano', category: 'pad', synth: 'synth', osc: 'square', env: [0.02, 0.1, 0.7, 0.2], note: 'C4', vol: -18, color: 0x6f42ab },
  { id: 'saw', label: 'Saw lead', category: 'melody', synth: 'mono', osc: 'sawtooth', glide: 0.01, filterHz: 900, note: 'C4', color: 0x6f42ab },
  { id: 'square', label: 'Chip', category: 'melody', synth: 'synth', osc: 'square', env: [0.003, 0.16, 0.1, 0.12], note: 'C4', vol: -16, color: 0x9b6bd0 },
  { id: 'padwarm', label: 'Pad', category: 'pad', synth: 'am', osc: 'sine', env: [0.15, 0.3, 0.7, 0.5], note: 'C4', vol: -16, color: 0x7f6bd0 },

  // ===== batch 2: animals, nature, fx & voice =====
  // animales
  { id: 'owl', label: 'Búho', category: 'animal', synth: 'fm', recipe: 'owl', color: 0x9b8bd0 },
  { id: 'duck', label: 'Pato', category: 'animal', synth: 'mono', osc: 'sawtooth', recipe: 'duck', color: 0xf2b705 },
  { id: 'cricket', label: 'Grillo', category: 'animal', synth: 'synth', osc: 'sine', recipe: 'cricket', vol: -16, color: 0x97c459 },
  { id: 'cow', label: 'Vaca', category: 'animal', synth: 'mono', osc: 'sawtooth', recipe: 'moo', color: 0xd0a06b },
  { id: 'sheep', label: 'Oveja', category: 'animal', synth: 'mono', osc: 'sawtooth', recipe: 'baa', color: 0xe7d6ac },
  { id: 'bee', label: 'Abeja', category: 'animal', synth: 'mono', osc: 'sawtooth', recipe: 'buzz', vol: -14, color: 0xf2c14e },
  { id: 'wolf', label: 'Lobo', category: 'animal', synth: 'fm', recipe: 'howl', color: 0x8a95a8 },
  { id: 'rooster', label: 'Gallo', category: 'animal', synth: 'mono', osc: 'sawtooth', recipe: 'crow', color: 0xe2574c },
  // naturaleza
  { id: 'rain', label: 'Lluvia', category: 'fx', synth: 'noise', noise: 'pink', env: [0.05, 0.4, 0, 0.2], vol: -20, color: 0x7fb0d0 },
  { id: 'wind', label: 'Viento', category: 'fx', synth: 'noise', noise: 'brown', env: [0.1, 0.5, 0, 0.3], vol: -18, color: 0xa8c0c8 },
  { id: 'thunder', label: 'Trueno', category: 'fx', synth: 'membrane', note: 'C1', pitched: false, env: [0.001, 0.7, 0, 0.4], vol: -4, color: 0x6b6f8a },
  { id: 'bubble', label: 'Burbuja', category: 'fx', synth: 'synth', osc: 'sine', recipe: 'bubble', color: 0x56b8ff },
  { id: 'drip', label: 'Gota', category: 'fx', synth: 'synth', osc: 'sine', recipe: 'drip', color: 0x3fb0ac },
  // fx
  { id: 'laser', label: 'Láser', category: 'fx', synth: 'fm', recipe: 'laser', color: 0xef476f },
  { id: 'coin', label: 'Moneda', category: 'fx', synth: 'synth', osc: 'square', recipe: 'coin', vol: -14, color: 0xf2b705 },
  { id: 'powerup', label: 'Power', category: 'fx', synth: 'synth', osc: 'square', recipe: 'powerup', vol: -15, color: 0x97c459 },
  { id: 'siren', label: 'Sirena', category: 'fx', synth: 'mono', osc: 'sawtooth', recipe: 'siren', color: 0xe2574c },
  { id: 'warp', label: 'Warp', category: 'fx', synth: 'fm', recipe: 'warp', color: 0x6f42ab },
  { id: 'glitch', label: 'Glitch', category: 'fx', synth: 'noise', noise: 'white', env: [0.001, 0.04, 0, 0.02], vol: -14, color: 0x4a7fd0 },
  { id: 'beep', label: 'Beep', category: 'fx', synth: 'synth', osc: 'sine', octave: 5, env: [0.002, 0.1, 0, 0.06], note: 'C5', vol: -13, color: 0x3fb0ac },
  { id: 'sparkle', label: 'Brillo', category: 'fx', synth: 'metal', pitched: false, vol: -24, color: 0xffd166 },
  // voz
  { id: 'yeah', label: 'Yeah', category: 'voice', synth: 'fm', recipe: 'vox', note: 'C4', color: 0xe86ea8 },
  { id: 'whistle', label: 'Silbido', category: 'voice', synth: 'synth', osc: 'sine', recipe: 'whistle', vol: -12, color: 0xffd166 },
  { id: 'hum', label: 'Hum', category: 'voice', synth: 'am', osc: 'sine', octave: 3, env: [0.05, 0.2, 0.6, 0.3], note: 'C3', vol: -15, color: 0xd48ab0 },

  // ===== batch 3: keys, leads, plucks, pads, more perc & voice =====
  { id: 'harp', label: 'Arpa', category: 'melody', synth: 'synth', osc: 'triangle', env: [0.003, 0.35, 0, 0.25], note: 'C4', color: 0x9b6bd0 },
  { id: 'flute', label: 'Flauta', category: 'melody', synth: 'synth', osc: 'sine', octave: 5, env: [0.04, 0.15, 0.6, 0.2], note: 'C5', vol: -14, color: 0x7fd0ff },
  { id: 'brass', label: 'Metales', category: 'melody', synth: 'fm', env: [0.02, 0.15, 0.6, 0.2], note: 'C4', vol: -14, color: 0xf2b705 },
  { id: 'strings', label: 'Cuerdas', category: 'pad', synth: 'am', osc: 'sawtooth', env: [0.1, 0.2, 0.7, 0.4], note: 'C4', vol: -17, color: 0xd06bd0 },
  { id: 'choir', label: 'Coro', category: 'pad', synth: 'am', osc: 'sine', env: [0.15, 0.2, 0.8, 0.5], note: 'C4', vol: -16, color: 0xe86ea8 },
  { id: 'glock', label: 'Glockenspiel', category: 'melody', synth: 'metal', octave: 6, note: 'C6', vol: -24, color: 0x5dcaa5 },
  { id: 'celesta', label: 'Celesta', category: 'melody', synth: 'synth', osc: 'sine', octave: 6, env: [0.002, 0.3, 0, 0.2], note: 'C6', vol: -13, color: 0xbfe3ff },
  { id: 'banjo', label: 'Banjo', category: 'melody', synth: 'synth', osc: 'square', env: [0.002, 0.15, 0, 0.1], note: 'C4', vol: -15, color: 0xc8935a },
  { id: 'sitar', label: 'Sitar', category: 'melody', synth: 'mono', osc: 'sawtooth', glide: 0.02, filterHz: 800, note: 'C4', color: 0xd0794a },
  { id: 'accordion', label: 'Acordeón', category: 'pad', synth: 'am', osc: 'square', env: [0.05, 0.1, 0.7, 0.2], note: 'C4', vol: -18, color: 0xef8a3c },
  { id: 'harmonica', label: 'Armónica', category: 'melody', synth: 'am', osc: 'sawtooth', env: [0.03, 0.1, 0.6, 0.2], note: 'C4', vol: -16, color: 0x5bb974 },
  { id: 'epiano', label: 'E-Piano', category: 'melody', synth: 'fm', env: [0.005, 0.25, 0.2, 0.2], note: 'C4', vol: -14, color: 0x6f42ab },
  { id: 'clav', label: 'Clavi', category: 'melody', synth: 'synth', osc: 'square', env: [0.002, 0.12, 0.05, 0.1], note: 'C4', vol: -15, color: 0x9b6bd0 },
  { id: 'bellpad', label: 'Campanas', category: 'pad', synth: 'am', osc: 'sine', octave: 5, env: [0.2, 0.3, 0.7, 0.6], note: 'C5', vol: -17, color: 0x3fb0ac },
  { id: 'pluckhi', label: 'Pluck alto', category: 'melody', synth: 'synth', osc: 'triangle', octave: 5, env: [0.003, 0.2, 0, 0.15], note: 'C5', color: 0x7f6bd0 },
  { id: 'lead2', label: 'Lead 2', category: 'melody', synth: 'mono', osc: 'square', octave: 5, glide: 0.01, filterHz: 1200, note: 'C5', color: 0xef476f },
  { id: 'supersaw', label: 'Super saw', category: 'melody', synth: 'mono', osc: 'sawtooth', glide: 0.01, filterHz: 1400, note: 'C4', vol: -13, color: 0x534ab7 },
  { id: 'arp', label: 'Arpegio', category: 'melody', synth: 'synth', osc: 'triangle', octave: 5, env: [0.002, 0.12, 0, 0.08], note: 'C5', vol: -14, color: 0x1d9e75 },
  { id: 'bass2', label: 'Bajo saw', category: 'bass', synth: 'mono', osc: 'sawtooth', octave: 2, filterHz: 300, note: 'C2', color: 0x3b9a63 },
  { id: 'bass3', label: 'Bajo FM', category: 'bass', synth: 'fm', octave: 2, note: 'C2', vol: -13, color: 0x2f8a4e },
  { id: 'wobble', label: 'Wobble', category: 'bass', synth: 'mono', osc: 'sawtooth', octave: 2, glide: 0.03, filterHz: 200, note: 'C2', color: 0x639922 },
  { id: 'kick2', label: 'Bombo 2', category: 'drum', synth: 'membrane', note: 'C1', env: [0.001, 0.28, 0, 0.15], color: 0xd85a30 },
  { id: 'snare2', label: 'Caja 2', category: 'drum', synth: 'noise', noise: 'pink', env: [0.001, 0.18, 0, 0], vol: -12, color: 0x378add },
  { id: 'hat2', label: 'Hat abierto', category: 'drum', synth: 'noise', noise: 'white', env: [0.001, 0.18, 0, 0.05], vol: -18, color: 0xef9f27 },
  { id: 'clap2', label: 'Clap 2', category: 'drum', synth: 'noise', noise: 'pink', env: [0.001, 0.12, 0, 0.03], vol: -13, color: 0xd85a30 },
  { id: 'block', label: 'Bloque', category: 'perc', synth: 'synth', osc: 'square', note: 'C6', pitched: false, env: [0.001, 0.05, 0, 0.04], vol: -13, color: 0xc8935a },
  { id: 'tri', label: 'Triángulo', category: 'perc', synth: 'metal', pitched: false, vol: -26, color: 0x5dcaa5 },
  { id: 'doo', label: 'Doo', category: 'voice', synth: 'synth', osc: 'sine', env: [0.01, 0.15, 0.1, 0.1], note: 'C4', vol: -13, color: 0xe86ea8 },
  { id: 'beatbox', label: 'Beatbox', category: 'voice', synth: 'membrane', note: 'C2', pitched: false, env: [0.001, 0.2, 0, 0.1], color: 0x9b6bd0 },
  { id: 'ooh', label: 'Ooh', category: 'voice', synth: 'am', osc: 'sine', env: [0.08, 0.2, 0.6, 0.3], note: 'C4', vol: -15, color: 0xd48ab0 },
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
// Player stats / rankings (Redis-backed, subreddit-wide, all-time)
// ---------------------------------------------------------------------------
export type RankEntry = { userId: string; username: string; avatar: string; value: number };
export type RankingsResponse = {
  placed: RankEntry[]; // most beats placed
  removed: RankEntry[]; // most beats removed
  streak: RankEntry[]; // longest current daily streak
  topInstrument: { id: string; count: number } | null; // community's most-used sound
};
export type ProfileResponse = {
  userId: string;
  username: string;
  avatar: string; // snoovatar URL ('' if none)
  placed: number;
  removed: number;
  commits: number;
  streak: number; // current daily streak
  best: number; // best streak ever
  favInstrument: string; // this player's most-placed instrument id ('' if none)
};

// ---------------------------------------------------------------------------
// Expression wave (per-track LFO effect) — the draggable "wave" the user shapes.
// depth 0 = flat/off. rate = how stretched/compressed the wave is (LFO speed).
// ---------------------------------------------------------------------------
export type FxType = 'none' | 'vibrato' | 'tremolo' | 'wah';
// Per-beat expression. `type/depth/rate` = the wave (LFO). `pitch` shifts the beat up/down
// the day's scale in scale-degrees (negative = down / "backwards"). `sub` = how many rapid
// hits the beat fires within its step (1..4 → ♩ ♪♪ ♪³ ♬, a ratchet/roll). `dur` = note length
// 0..1 (staccato → legato). `vol` = per-beat loudness in BVOL_DB steps (0 = as-is).
// All bundle into one beat edit (one ficha), never charged apart.
export type TrackFx = { type: FxType; depth: number; rate: number; pitch: number; sub: number; dur: number; vol: number };

export const PITCH_MIN = -7;
export const PITCH_MAX = 7;
export const SUB_MIN = 1;
export const SUB_MAX = 4;
export const BVOL_MIN = -4; // -12 dB
export const BVOL_MAX = 2; // +6 dB
export const BVOL_DB = 3; // dB per step

export const FLAT_FX: TrackFx = { type: 'vibrato', depth: 0, rate: 0.4, pitch: 0, sub: 1, dur: 0.5, vol: 0 };

// The pickable effects. `tremolo` stays in FxType (and in the engine) so beats saved before it
// was retired still decode and play — it's just no longer offered in the UI.
export const FX_TARGETS: readonly { type: FxType; label: string; emoji: string }[] = [
  { type: 'vibrato', label: 'Vibrato', emoji: '🌊' },
  { type: 'wah', label: 'Wah', emoji: '🚿' },
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const clampInt = (n: number, lo: number, hi: number): number => {
  const r = Math.round(n);
  return r < lo ? lo : r > hi ? hi : r;
};

export function encodeFx(fx: TrackFx): string {
  // type:depth:rate:pitch:sub:dur:vol — everything after `rate` is optional on read, so beats
  // saved by an older version decode to the defaults instead of breaking.
  return `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}:${Math.round(fx.pitch)}:${Math.round(fx.sub)}:${Math.round(fx.dur * 100)}:${Math.round(fx.vol)}`;
}
export function decodeFx(s: string | undefined): TrackFx {
  if (!s) return { ...FLAT_FX };
  const parts = s.split(':');
  const t = parts[0] ?? 'vibrato';
  const type: FxType = t === 'vibrato' || t === 'tremolo' || t === 'wah' || t === 'none' ? t : 'vibrato';
  return {
    type,
    depth: clamp01(Number(parts[1] ?? 0) / 100),
    rate: clamp01(Number(parts[2] ?? 40) / 100),
    pitch: parts[3] === undefined ? 0 : clampInt(Number(parts[3]), PITCH_MIN, PITCH_MAX),
    sub: parts[4] === undefined ? 1 : clampInt(Number(parts[4]), SUB_MIN, SUB_MAX),
    dur: parts[5] === undefined ? 0.5 : clamp01(Number(parts[5]) / 100),
    vol: parts[6] === undefined ? 0 : clampInt(Number(parts[6]), BVOL_MIN, BVOL_MAX),
  };
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
  pool: string[]; // the day's pickable sounds (subset of LIBRARY shown in the menu)
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
