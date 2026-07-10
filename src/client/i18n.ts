/**
 * Tiny i18n layer. The app shipped Spanish-only; Reddit is mostly English, so every
 * user-facing string goes through `t()` and the language is a user setting (persisted).
 * Keep the keys stable — the Settings overlay flips `lang` and the scene just re-renders.
 */
import { instrumentById, type Instrument } from '../shared/jam';

export type Lang = 'es' | 'en';

const LANG_KEY = 'resonance-lang';
let lang: Lang = 'es';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'es') lang = saved;
} catch {
  /* private mode → stay on the default */
}

export const getLang = (): Lang => lang;
export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* not persisted, still applied for this session */
  }
}

type Dict = Record<string, string>;

const ES: Dict = {
  save: 'GUARDAR',
  footer: 'nadie montó esto — lo hizo la comunidad',
  loading: 'cargando…',
  rankTitle: 'RANKING',
  rankLoadErr: 'no se pudo cargar el ranking',
  rankNobody: 'aún nadie 🙂',
  rankPlaced: 'más beats puestos',
  rankRemoved: 'más beats quitados',
  rankStreak: 'racha más larga',
  rankDays: 'días',
  rankTopSound: '🎛 sonido más usado por todos:',
  rankMePut: 'puestos',
  rankMeRemoved: 'quitados',
  rankMeStreak: 'racha',
  rankMeBest: 'mejor',
  rankMeFav: 'fav',
  fsErr: 'no se pudo abrir pantalla completa',
  tapBeatFirst: 'toca un beat primero',
  draftCleared: 'borrador vaciado',
  sent: '¡Enviado! 🎶',
  error: 'Error',
  offline: 'Sin conexión (guardado local)',
  noFichas: '¡Sin fichas! (vuelven cada 12 h)',
  menuPick: 'elige un sonido',
  menuRow: 'sonido para la fila',
  add: 'añadir',
  keyOf: 'clave de',
  minor: 'menor',
  playingLive: 'tocando en vivo',
  editIdle: 'EDITA EL BEAT — toca uno',
  editBeat: 'EDITA EL BEAT',
  beat: 'beat',
  yoursFree: '(tuyo · gratis)',
  othersCost: '(ajeno · 1 ficha)',
  tono: 'tono',
  vol: 'vol',
  onda: 'onda',
  wNone: 'sin onda',
  wSoft: 'suave',
  wMid: 'media',
  wStrong: 'fuerte',
  wFast: 'rápida',
  settings: 'AJUSTES',
  language: 'Idioma',
  spanish: 'Español',
  english: 'English',
  close: 'cerrar',
};

const EN: Dict = {
  save: 'SAVE',
  footer: 'nobody staged this — the community built it',
  loading: 'loading…',
  rankTitle: 'RANKING',
  rankLoadErr: "couldn't load the ranking",
  rankNobody: 'nobody yet 🙂',
  rankPlaced: 'most beats placed',
  rankRemoved: 'most beats removed',
  rankStreak: 'longest streak',
  rankDays: 'days',
  rankTopSound: "🎛 everyone's most used sound:",
  rankMePut: 'placed',
  rankMeRemoved: 'removed',
  rankMeStreak: 'streak',
  rankMeBest: 'best',
  rankMeFav: 'fav',
  fsErr: "couldn't open fullscreen",
  tapBeatFirst: 'tap a beat first',
  draftCleared: 'draft cleared',
  sent: 'Sent! 🎶',
  error: 'Error',
  offline: 'Offline (saved locally)',
  noFichas: 'No tokens! (they come back every 12 h)',
  menuPick: 'pick a sound',
  menuRow: 'sound for row',
  add: 'add',
  keyOf: 'key of',
  minor: 'minor',
  playingLive: 'playing live',
  editIdle: 'EDIT THE BEAT — tap one',
  editBeat: 'EDIT THE BEAT',
  beat: 'beat',
  yoursFree: '(yours · free)',
  othersCost: "(someone else's · 1 token)",
  tono: 'pitch',
  vol: 'vol',
  onda: 'wave',
  wNone: 'no wave',
  wSoft: 'soft',
  wMid: 'medium',
  wStrong: 'strong',
  wFast: 'fast',
  settings: 'SETTINGS',
  language: 'Language',
  spanish: 'Español',
  english: 'English',
  close: 'close',
};

export function t(key: keyof typeof ES & string): string {
  const d = lang === 'en' ? EN : ES;
  return d[key] ?? ES[key] ?? key;
}

/** The day's root note. Spanish uses solfège (DO RE MI…), English uses letters (C D E…). */
const NOTE_ES: Record<string, string> = { C: 'DO', D: 'RE', E: 'MI', F: 'FA', G: 'SOL', A: 'LA', B: 'SI' };
export const noteName = (k: string): string => (lang === 'en' ? k : (NOTE_ES[k] ?? k));

/** English names for the sound library (the Instrument.label field is Spanish). */
const INSTR_EN: Record<string, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hi-hat',
  clap: 'Clap',
  tom: 'Tom',
  bass: 'Bass',
  sub: 'Sub 808',
  pluck: 'Pluck',
  lead: 'Lead',
  keys: 'Keys',
  bell: 'Bell',
  zap: 'Zap',
  riser: 'Riser',
  drop: 'Drop',
  bird: 'Bird',
  cat: 'Cat',
  dog: 'Dog',
  frog: 'Frog',
  boom: 'Boom',
  tss: 'Tss',
  pah: 'Pah',
  uh: 'Uh',
  rim: 'Rim',
  cowbell: 'Cowbell',
  conga: 'Conga',
  bongo: 'Bongo',
  woodblock: 'Woodblock',
  shaker: 'Shaker',
  tamb: 'Tambourine',
  clave: 'Clave',
  ride: 'Ride',
  crash: 'Crash',
  subsine: 'Sub sine',
  reese: 'Reese',
  pluckbass: 'Pluck bass',
  growl: 'Growl',
  marimba: 'Marimba',
  xylo: 'Xylophone',
  kalimba: 'Kalimba',
  musicbox: 'Music box',
  organ: 'Organ',
  saw: 'Saw lead',
  square: 'Chip',
  padwarm: 'Pad',
  owl: 'Owl',
  duck: 'Duck',
  cricket: 'Cricket',
  cow: 'Cow',
  sheep: 'Sheep',
  bee: 'Bee',
  wolf: 'Wolf',
  rooster: 'Rooster',
  rain: 'Rain',
  wind: 'Wind',
  thunder: 'Thunder',
  bubble: 'Bubble',
  drip: 'Drip',
  laser: 'Laser',
  coin: 'Coin',
  powerup: 'Power-up',
  siren: 'Siren',
  warp: 'Warp',
  glitch: 'Glitch',
  beep: 'Beep',
  sparkle: 'Sparkle',
  yeah: 'Yeah',
  whistle: 'Whistle',
  hum: 'Hum',
  harp: 'Harp',
  flute: 'Flute',
  brass: 'Brass',
  strings: 'Strings',
  choir: 'Choir',
  glock: 'Glockenspiel',
  celesta: 'Celesta',
  banjo: 'Banjo',
  sitar: 'Sitar',
  accordion: 'Accordion',
  harmonica: 'Harmonica',
  epiano: 'E-Piano',
  clav: 'Clav',
  bellpad: 'Bell pad',
  pluckhi: 'High pluck',
  lead2: 'Lead 2',
  supersaw: 'Super saw',
  arp: 'Arpeggio',
  bass2: 'Saw bass',
  bass3: 'FM bass',
  wobble: 'Wobble',
  kick2: 'Kick 2',
  snare2: 'Snare 2',
  hat2: 'Open hat',
  clap2: 'Clap 2',
  block: 'Block',
  tri: 'Triangle',
  doo: 'Doo',
  beatbox: 'Beatbox',
  ooh: 'Ooh',
};

/** A sound's name in the current language (falls back to the Spanish label). */
export function instrLabel(inst: Instrument | undefined): string {
  if (!inst) return '';
  return lang === 'en' ? (INSTR_EN[inst.id] ?? inst.label) : inst.label;
}
export const instrLabelById = (id: string): string => instrLabel(instrumentById(id));
