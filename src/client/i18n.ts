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
  newFree: '(nuevo · gratis)',
  savedCost: '(guardado · 1 ficha)',
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
  guide: 'Cómo funciona',
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
  newFree: '(new · free)',
  savedCost: '(saved · 1 token)',
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
  guide: 'How it works',
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

// ---------------------------------------------------------------------------
// The in-app guide (Settings → "How it works").
// `icon` is a texture key WITHOUT the `ic_` prefix; the scene turns it into a data URL so the
// guide shows the very same crayon icons the buttons do. `k` is an optional inline chip.
// ---------------------------------------------------------------------------
export type GuideRow = { icon?: string; k?: string; v: string };
export type GuideSec = { h: string; rows: GuideRow[] };
export type Guide = { intro: string; secs: GuideSec[] };

const GUIDE_ES: Guide = {
  intro:
    'JamPad es un jam colaborativo. Cada día nace un post nuevo, con su propia clave y sus propios colores, y todo el mundo edita el MISMO loop de 8 pistas × 16 pasos. Ningún post se cierra: puedes volver cualquier día a cualquier canción y seguir editándola. Lo que guardas lo oyen los demás.',
  secs: [
    {
      h: 'El tablero',
      rows: [
        { v: 'Las filas son sonidos; las 16 columnas son los pasos del compás.' },
        { v: 'Toca un pad para poner o quitar un beat.' },
        { v: 'En los sonidos melódicos, la columna marca la nota (escala pentatónica del día).' },
        { icon: 'add', v: 'Abre el selector de sonidos: cada día se ofrecen 24 de los 98.' },
      ],
    },
    {
      h: 'Editar un beat (en pantalla completa)',
      rows: [
        { v: 'Toca un beat para seleccionarlo: abajo aparece su editor.' },
        { icon: 'fx_vibrato', v: 'Vibrato: la nota ondula. Al elegirlo se enciende la primera onda.' },
        { icon: 'fx_wah', v: 'Wah: un filtro que se abre y se cierra.' },
        { v: 'Botón de onda: cicla sin onda → suave → media → fuerte → rápida.' },
        { v: 'Disco: ▲▼ volumen · ◀▶ tono. En el centro se lee lo último que moviste.' },
        { icon: 'sub3', v: 'Redoble: el beat suena de 1 a 4 golpes rápidos dentro de su paso.' },
        { v: '↺ Toque: deja el beat plano. Mantenlo pulsado: vacía todo tu borrador.' },
      ],
    },
    {
      h: 'Fichas y guardar',
      rows: [
        { v: 'Tienes 4 fichas y vuelven cada 12 h.' },
        { v: 'Añadir un beat cuesta 1 ficha, y con ella lo dejas como quieras antes de guardar.' },
        { v: 'Una vez guardado: editarlo cuesta 1 ficha y borrarlo cuesta 1 ficha, sea tuyo o de otro.' },
        { v: 'TODOS los ajustes de un beat (onda, tono, redoble, volumen) cuentan como una sola ficha.' },
        { v: 'Elegir el sonido de una fila vacía es gratis: va incluido con su primer beat.' },
        { icon: 'save', v: 'GUARDAR envía tu borrador a todo el mundo. Arriba ves cuánto costará.' },
      ],
    },
    {
      h: 'Los demás botones',
      rows: [
        { k: '− BPM +', v: 'Cambia el tempo del jam (cuesta fichas).' },
        { icon: 'play', v: 'Reproduce o pausa el loop.' },
        { icon: 'fs', v: 'Pantalla completa. El editor de beats solo aparece ahí.' },
        { icon: 'rank', v: 'Ranking de la comunidad y tu perfil.' },
        { icon: 'gear', v: 'Estos ajustes.' },
      ],
    },
  ],
};

const GUIDE_EN: Guide = {
  intro:
    'JamPad is a collaborative jam. A new post is born every day, with its own key and its own colours, and everybody edits the SAME 8-track × 16-step loop. No post ever closes: come back any day, to any song, and keep editing it. Whatever you save, the others hear.',
  secs: [
    {
      h: 'The board',
      rows: [
        { v: 'Rows are sounds; the 16 columns are the steps of the bar.' },
        { v: 'Tap a pad to place or remove a beat.' },
        { v: "On melodic sounds the column sets the note (the day's pentatonic scale)." },
        { icon: 'add', v: 'Opens the sound picker: 24 of the 98 sounds are offered each day.' },
      ],
    },
    {
      h: 'Editing a beat (in fullscreen)',
      rows: [
        { v: 'Tap a beat to select it — its editor shows up below.' },
        { icon: 'fx_vibrato', v: 'Vibrato: the note wavers. Picking it turns the first wave on.' },
        { icon: 'fx_wah', v: 'Wah: a filter that opens and closes.' },
        { v: 'Wave button: cycles no wave → soft → medium → strong → fast.' },
        { v: 'Disc: ▲▼ volume · ◀▶ pitch. The hub reads out whichever you moved last.' },
        { icon: 'sub3', v: 'Ratchet: the beat fires as 1 to 4 rapid hits inside its step.' },
        { v: '↺ Tap: flatten the beat. Hold: clear your whole draft.' },
      ],
    },
    {
      h: 'Tokens and saving',
      rows: [
        { v: 'You get 4 tokens and they come back every 12 h.' },
        { v: 'Adding a beat costs 1 token, and that token also lets you shape it before you save.' },
        { v: 'Once saved: editing it costs 1 token and deleting it costs 1 token — yours or anyone’s.' },
        { v: 'ALL of a beat’s settings (wave, pitch, ratchet, volume) count as a single token.' },
        { v: "Picking an empty row's sound is free: it rides along with that row's first beat." },
        { icon: 'save', v: 'SAVE sends your draft to everyone. The button shows what it will cost.' },
      ],
    },
    {
      h: 'The other buttons',
      rows: [
        { k: '− BPM +', v: "Change the jam's tempo (it costs tokens)." },
        { icon: 'play', v: 'Play or pause the loop.' },
        { icon: 'fs', v: 'Fullscreen. The beat editor only shows up there.' },
        { icon: 'rank', v: "The community ranking and your profile." },
        { icon: 'gear', v: 'These settings.' },
      ],
    },
  ],
};

export const guide = (): Guide => (lang === 'en' ? GUIDE_EN : GUIDE_ES);
