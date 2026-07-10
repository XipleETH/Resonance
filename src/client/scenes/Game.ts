import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import {
  connectRealtime,
  exitExpandedMode,
  getWebViewMode,
  requestExpandedMode,
  type Connection,
} from '@devvit/web/client';
import {
  initAudio,
  isPlaying,
  onStep,
  resumeAudio,
  setActiveCells,
  setBpm,
  setInstruments,
  setKey,
  setPlaying,
} from '../audio/jamEngine';
import {
  DAILY_POOL_SIZE,
  FLAT_FX,
  FX_TARGETS,
  instrumentById,
  BVOL_MAX,
  BVOL_MIN,
  LIBRARY,
  MAX_FICHAS,
  PITCH_MAX,
  PITCH_MIN,
  STEPS,
  SUB_MAX,
  SUB_MIN,
  TRACKS,
  type FxType,
  type JamAction,
  type JamCommitResponse,
  type JamDiff,
  type JamInitResponse,
  type JamState,
  type ProfileResponse,
  type RankingsResponse,
  type TrackFx,
} from '../../shared/jam';
import { getLang, guide, instrLabel, noteName, setLang, t, type GuideRow, type Lang } from '../i18n';

const KRAFT = '#cdb083';
const INK = 0x3a2f22;
const WAVE_FILL = 0xe7d6ac; // wave button fill — FIXED (not themed) to keep the app's personality
const CRAYON = '"Gochi Hand", "Comic Sans MS", "Marker Felt", "Segoe Print", cursive';

// The wave used to be a 2-axis drag bar. Dragging is hostile on a phone (the feed steals the
// gesture) so it's now a BUTTON that cycles these presets — the waveform still draws inside it.
const WAVE_PRESETS: readonly { key: 'wNone' | 'wSoft' | 'wMid' | 'wStrong' | 'wFast'; depth: number; rate: number }[] = [
  { key: 'wNone', depth: 0, rate: 0.4 },
  { key: 'wSoft', depth: 0.35, rate: 0.3 },
  { key: 'wMid', depth: 0.6, rate: 0.5 },
  { key: 'wStrong', depth: 0.92, rate: 0.6 },
  { key: 'wFast', depth: 0.7, rate: 0.95 },
];
/** The wave an effect button turns on when the beat is still flat (index 1 = the softest). */
const FIRST_WAVE = 1;
/** Which preset a beat's wave is closest to (older beats came from the free drag). */
const waveIdx = (fx: TrackFx): number => {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < WAVE_PRESETS.length; i++) {
    const p = WAVE_PRESETS[i];
    if (!p) continue;
    const d = Math.abs(p.depth - fx.depth) * 2 + Math.abs(p.rate - fx.rate);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
};

// Per-day palette so every day looks different — but ONLY the "paper" surfaces (background
// + panel) shift. The wave bar, reset button, fx chips, note pads and main buttons keep
// fixed colors so the app keeps its personality. Soft/high-lightness so it reads crayon.
type Theme = { bg: string; card: number; panel: number };
function hslNum(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v: number): number => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
function themeFor(day: string): Theme {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  return {
    bg: hex(hslNum(hue, 0.3, 0.5)),
    card: hslNum(hue, 0.45, 0.82),
    panel: hslNum(hue, 0.36, 0.84),
  };
}
// The server's day key is UTC YYYY-MM-DD (todayStr). Match it so the client can paint the
// day's palette before the init fetch returns (avoids a flash of base colors on load).
const clientDay = (): string => new Date().toISOString().slice(0, 10);
const key = (t: number, s: number): string => `${t}_${s}`;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function grain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,45,25,0.08)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 3);
  }
}
function crayonShape(ctx: CanvasRenderingContext2D, w: number, h: number, pill: boolean): void {
  const inset = 7;
  const ww = w - inset * 2;
  const hh = h - inset * 2;
  const r = pill ? hh / 2 : Math.min(ww, hh) * 0.28;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, inset, inset, ww, hh, r);
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, inset, inset, ww, hh, r);
  ctx.clip();
  grain(ctx, w, h);
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2f261c';
  ctx.lineWidth = 5;
  roundRectPath(ctx, inset, inset, ww, hh, r);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3.5;
  roundRectPath(ctx, inset + 1.2, inset + 0.8, ww, hh, r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function cardboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = KRAFT;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,245,220,0.10)' : 'rgba(120,90,50,0.10)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.strokeStyle = 'rgba(120,90,50,0.10)';
  ctx.lineWidth = 1;
  for (let yy = 6; yy < h; yy += 12) {
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(w, yy);
    ctx.stroke();
  }
}
function lighten(color: number, amt: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c: number): number => Math.round(c + (255 - c) * amt);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

function defaultState(): JamState {
  return {
    meta: {
      day: 'DÍA 1', key: 'C', scale: 'minor-pentatonic', bpm: 96, bpmMin: 76, bpmMax: 116,
      t0: 0, steps: STEPS, tracks: TRACKS, version: 1, instruments: ['kick', 'hat', 'bass', '', '', '', '', ''],
      pool: LIBRARY.slice(0, DAILY_POOL_SIZE).map((i) => i.id),
    },
    cells: [],
  };
}

// What the user tapped inline, stashed to sessionStorage across the expand reload so the
// flow can continue once the (fresh) expanded page boots.
type PendingIntent =
  | { kind: 'cell'; t: number; s: number }
  | { kind: 'label'; t: number }
  | { kind: 'tempo'; delta: number }
  | { kind: 'expand' };
const PENDING_KEY = 'resonance-pending';

export class Game extends Scene {
  private state: JamState = defaultState();
  private sharedCells = new Map<string, { by: string; fx: TrackFx }>();
  private instruments: string[] = [];
  private bpm = 96;
  private myUserId = '';

  private draftPlace = new Set<string>();
  private draftRemove = new Set<string>();
  private draftInstr = new Map<number, string>();
  private draftCellFx = new Map<string, TrackFx>();
  private draftTempo = 0;
  private selectedTrack = -1;
  private selectedCell: string | null = null;
  // Beat tapped on an empty row: after the user picks an instrument it gets placed+selected,
  // so "first beat brings the instrument + the beat" for a single ficha.
  private pendingPlaceCell: string | null = null;
  private instrMenuOpen = false;
  private audioReady = false;

  private energy = MAX_FICHAS;
  private channel = '';
  private presence = 1;
  private conn: Connection | null = null;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private active = false; // "woken" — taps act; first touch only wakes (swallowed)
  private audioId = 'a' + Math.random().toString(36).slice(2);
  private audioChan: BroadcastChannel | null = null;
  private pauseHandler = (): void => this.goSleep();
  private visHandler = (): void => {
    if (document.hidden) this.goSleep();
  };

  private bg!: Phaser.GameObjects.TileSprite;
  private theme: Theme = themeFor(clientDay()); // today's palette up-front → no color flash
  private panel!: Phaser.GameObjects.Graphics;
  private selRing!: Phaser.GameObjects.Graphics;
  private cells: Phaser.GameObjects.Image[][] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private labelIcons: Phaser.GameObjects.Image[] = [];
  private fichaDots: Phaser.GameObjects.Arc[] = [];
  private fxChips: Array<{ img: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text; type: FxType }> = [];
  private playhead!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Image;
  private dayChip!: Phaser.GameObjects.Image;
  private dayText!: Phaser.GameObjects.Text;
  private presenceChip!: Phaser.GameObjects.Image;
  private presenceText!: Phaser.GameObjects.Text;
  private bpmText!: Phaser.GameObjects.Text;
  private tempoDown!: Phaser.GameObjects.Image;
  private tempoUp!: Phaser.GameObjects.Image;
  private tempoDownT!: Phaser.GameObjects.Text;
  private tempoUpT!: Phaser.GameObjects.Text;
  private fichaText!: Phaser.GameObjects.Text;
  private fichaSub!: Phaser.GameObjects.Text;
  private exprLabel!: Phaser.GameObjects.Text;
  // per-beat editor (expanded only), ONE row: [FX | onda] · [vol/tono disc] · [redoble] [reset]
  private edPanels!: Phaser.GameObjects.Graphics;
  private edPitchDnIc!: Phaser.GameObjects.Image;
  private edPitchUpIc!: Phaser.GameObjects.Image;
  private edPitchVal!: Phaser.GameObjects.Text;
  private edSub!: Phaser.GameObjects.Image;
  private edSubIc!: Phaser.GameObjects.Image;
  private edSubTx!: Phaser.GameObjects.Text;
  // The vol/tono pad is a rounded button (same crayon shape as the rest), split on its diagonals
  // into four zones: up/down = volumen, left/right = tono, hub = the readout. `padPill` is the
  // crayon background; `padG` draws the diagonal dividers + the pressed zone; `padHit` takes taps
  // and the zone is resolved geometrically from the tap's angle.
  private padPill!: Phaser.GameObjects.Image;
  private padG!: Phaser.GameObjects.Graphics;
  private padHit!: Phaser.GameObjects.Zone;
  private padCx = 0;
  private padCy = 0;
  private padR = 10; // half-size of the pad square
  private padRIn = 4; // hub radius (readout, inert to taps)
  private padPressed = -1; // zone index being pressed (0=right,1=down,2=left,3=up)
  private edVolUpIc!: Phaser.GameObjects.Image;
  private edVolDnIc!: Phaser.GameObjects.Image;
  private fxPill!: Phaser.GameObjects.Image; // one big button, split in 3 (vibrato|trémolo|wah)
  private fxDiv!: Phaser.GameObjects.Graphics; // its dividers + the active segment's highlight
  private wavePill!: Phaser.GameObjects.Image; // the wave BUTTON (tap = next preset)
  private waveG!: Phaser.GameObjects.Graphics; // the waveform drawn inside it
  private waveTx!: Phaser.GameObjects.Text; // its preset name
  private resetImg!: Phaser.GameObjects.Image;
  private resetText!: Phaser.GameObjects.Text;
  private saveImg!: Phaser.GameObjects.Image;
  private saveIcon!: Phaser.GameObjects.Image;
  private saveText!: Phaser.GameObjects.Text;
  private rankImg!: Phaser.GameObjects.Image;
  private rankIcon!: Phaser.GameObjects.Image;
  private clockIcon!: Phaser.GameObjects.Image;
  private dateText!: Phaser.GameObjects.Text;
  private setImg!: Phaser.GameObjects.Image;
  private setIcon!: Phaser.GameObjects.Image;
  private setBtn: HTMLButtonElement | null = null;
  private setOverlay: HTMLDivElement | null = null;
  private rankBtn: HTMLButtonElement | null = null;
  private rankOverlay: HTMLDivElement | null = null;
  private fsImg!: Phaser.GameObjects.Image;
  private fsIcon!: Phaser.GameObjects.Image;
  private ppImg!: Phaser.GameObjects.Image;
  private ppIcon!: Phaser.GameObjects.Image;
  private bgZone!: Phaser.GameObjects.Zone;
  private footer!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  private menuDim!: Phaser.GameObjects.Rectangle;
  private menuBackdrop!: Phaser.GameObjects.Zone;
  private menuPanel!: Phaser.GameObjects.Graphics;
  private menuTitle!: Phaser.GameObjects.Text;
  private menuChips: Array<{ img: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text; id: string }> = [];

  private curStep = 0;
  private u = 1;
  // Height-aware scale. `u` alone (= W/410) blows up vertically on a wide-but-short
  // inline frame (the desktop feed card), so sizes + vertical rhythm use `s` instead.
  // On a tall/portrait frame (mobile, fullscreen) s ≈ u, so that layout is unchanged.
  private s = 1;
  private gridBox = { left: 0, top: 0, cellW: 10, rowH: 10 };
  private waveBox = { x: 0, y: 0, w: 10, h: 10 };
  private fxBox = { x: 0, y: 0, w: 10, h: 10 }; // the tri-segment FX button
  private padLong = false; // enough room inside the pad's hub to spell "tono"/"vol"?
  private padShow: 'pitch' | 'vol' = 'pitch'; // the hub reads out whichever axis you last moved
  // Devvit's requestExpandedMode/exitExpandedMode ONLY accept a trusted native `click`,
  // and Phaser preventDefaults touchstart on the canvas which suppresses the synthetic
  // click on mobile — so canvas taps can never trigger them. fsBtn is a real DOM button
  // over the ⛶ pill; inlineCatcher is a full-canvas DOM button that (inline only) turns
  // any tap into "stash what you tapped + go fullscreen", so the app is used expanded.
  private fsBtn: HTMLButtonElement | null = null;
  private inlineCatcher: HTMLButtonElement | null = null;
  private wokeByPointer = false;
  private audioInitting = false;
  private readonly syncOnScroll = (): void => this.syncDomButtons();
  // Real DOM gesture on the canvas (expanded mode): unlock audio, and resume a context
  // that a no-gesture autoplay attempt may have left suspended.
  private readonly unlockAudio = (): void => {
    this.ensureAudio();
    void resumeAudio();
  };
  private resetTimer: Phaser.Time.TimerEvent | undefined = undefined;
  private resetHeld = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.ensureTextures();
    // Paint TODAY's palette immediately (no flash of base colors). The init fetch later
    // confirms it via meta.day — same day → no change; an old post → corrects then.
    this.cameras.main.setBackgroundColor(this.theme.bg);
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'cb_card').setOrigin(0).setTint(this.theme.card).setDepth(-10);
    // Full-surface catcher (behind everything): any tap on the post wakes it.
    this.bgZone = this.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    this.bgZone.on('pointerdown', () => this.gate());
    this.panel = this.add.graphics();
    this.selRing = this.add.graphics();

    this.title = this.add.image(0, 0, 'ic_title').setOrigin(0, 0); // wordmark: letters made of notes
    this.dayChip = this.add.image(0, 0, 'cb_pill').setTint(0xfbe7c2).setOrigin(0, 0.5);
    this.dayText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#8a6410' }).setOrigin(0, 0.5);
    this.presenceChip = this.add.image(0, 0, 'cb_pill').setTint(0xe7f6ea).setOrigin(1, 0.5);
    this.presenceText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#2f8a4e' }).setOrigin(1, 0.5);

    this.tempoDown = this.add.image(0, 0, 'cb_pill').setTint(0xffe08a).setInteractive({ useHandCursor: true });
    this.tempoDown.on('pointerdown', () => {
      if (this.gate()) this.stageTempo(-1);
    });
    this.tempoDownT = this.add.text(0, 0, '–', { fontFamily: CRAYON, fontSize: '22px', color: '#7a5310' }).setOrigin(0.5);
    this.bpmText = this.add.text(0, 0, '96 BPM', { fontFamily: CRAYON, fontSize: '15px', color: '#6a5320' }).setOrigin(0.5);
    this.tempoUp = this.add.image(0, 0, 'cb_pill').setTint(0xffe08a).setInteractive({ useHandCursor: true });
    this.tempoUp.on('pointerdown', () => {
      if (this.gate()) this.stageTempo(+1);
    });
    this.tempoUpT = this.add.text(0, 0, '+', { fontFamily: CRAYON, fontSize: '22px', color: '#7a5310' }).setOrigin(0.5);

    this.playhead = this.add.rectangle(0, 0, 10, 10, 0xfff3c9, 0.3);

    for (let t = 0; t < TRACKS; t++) {
      const row: Phaser.GameObjects.Image[] = [];
      for (let s = 0; s < STEPS; s++) {
        const img = this.add.image(0, 0, 'cb_pad').setAngle(Phaser.Math.Between(-3, 3)).setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.tapCell(t, s));
        row.push(img);
      }
      this.cells.push(row);
      const licon = this.add.image(0, 0, 'ic_add').setInteractive({ useHandCursor: true });
      licon.on('pointerdown', () => this.onTrackLabel(t));
      this.labelIcons.push(licon);
      const label = this.add
        .text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#4a3a22' })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerdown', () => this.onTrackLabel(t));
      this.labels.push(label);
    }

    for (let i = 0; i < MAX_FICHAS; i++) this.fichaDots.push(this.add.circle(0, 0, 8, 0x3fb0ac).setStrokeStyle(2.5, INK));
    this.fichaText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '14px', color: '#4a3a22' }).setOrigin(0, 0.5);
    this.fichaSub = this.add.text(0, 0, '12h', { fontFamily: CRAYON, fontSize: '12px', color: '#a9691f' }).setOrigin(0, 0.5);

    this.exprLabel = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '12px', color: '#7a6a4a' });

    // ONE big FX button split in three. `fxPill` is the shared background, `fxDiv` draws the two
    // dividers + a highlight behind the active third; each chip's `img` is just an invisible
    // hit-area over its third (its icon/label ride on top and get the press dip).
    this.fxPill = this.add.image(0, 0, 'cb_pill').setTint(0xf0e7d0).setDepth(-0.6);
    this.fxDiv = this.add.graphics().setDepth(-0.5);
    for (const tgt of FX_TARGETS) {
      // NOT setAlpha(0): in Phaser 4 a fully transparent object is dropped from input hit-testing
      // (alpha 0 clears the render flag → willRender() false → hitTest skips it, and Phaser 4
      // removed Phaser 3's `alwaysEnabled` escape hatch). A hair above zero stays invisible AND
      // tappable — fxPill/fxDiv draw the actual button under it.
      const img = this.add.image(0, 0, 'cb_pill').setAlpha(0.001).setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, 0, `ic_fx_${tgt.type}`);
      const txt = this.add.text(0, 0, tgt.label, { fontFamily: CRAYON, fontSize: '12px', color: '#4a3a22' }).setOrigin(0, 0.5);
      img.on('pointerdown', () => this.pickFxTarget(tgt.type));
      this.fxChips.push({ img, icon, txt, type: tgt.type });
    }

    // Per-beat editor (expanded only) — ONE row. edPanels draws the row's panel + the disc's
    // frame; it's created after the controls, so it needs a depth or it would tint them.
    this.edPanels = this.add.graphics().setDepth(-1);
    this.edSub = this.add.image(0, 0, 'cb_pill').setTint(0xf0e7d0).setInteractive({ useHandCursor: true });
    this.edSubIc = this.add.image(0, 0, 'ic_sub1');
    this.edSubTx = this.add.text(0, 0, 'redoble', { fontFamily: CRAYON, fontSize: '12px', color: '#4a3a22' }).setOrigin(0, 0.5);
    this.edSub.on('pointerdown', () => this.cycleSub());

    // The vol/tono DISC. The four wedges ARE the buttons: `padG` draws the ring (split on the
    // diagonals) under the icons, and one square zone takes the taps — `onPadDown` resolves which
    // wedge from the tap's angle + radius, so the hub stays inert for the readout.
    this.padPill = this.add.image(0, 0, 'cb_pill').setTint(0xf0e7d0).setDepth(-0.6);
    this.padG = this.add.graphics().setDepth(-0.5);
    this.padHit = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.padHit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPadDown(p));
    this.edVolUpIc = this.add.image(0, 0, 'ic_vol_up');
    this.edVolDnIc = this.add.image(0, 0, 'ic_vol_dn');
    // Tono lives on the horizontal axis, so its arrows are turned 90° to point ◀ (lower) and
    // ▶ (higher); the colours keep their meaning (green = more, red = less).
    this.edPitchDnIc = this.add.image(0, 0, 'ic_pitch_dn').setAngle(90);
    this.edPitchUpIc = this.add.image(0, 0, 'ic_pitch_up').setAngle(90);
    this.edPitchVal = this.add.text(0, 0, 'tono 0', { fontFamily: CRAYON, fontSize: '12px', color: '#4a3a22' }).setOrigin(0.5);

    // Wave BUTTON: tap cycles the presets. Pill first, then the waveform on top, then the name.
    this.wavePill = this.add.image(0, 0, 'cb_pill').setTint(WAVE_FILL).setInteractive({ useHandCursor: true });
    this.wavePill.on('pointerdown', () => this.cycleWave());
    this.waveG = this.add.graphics();
    this.waveTx = this.add.text(0, 0, 'onda', { fontFamily: CRAYON, fontSize: '12px', color: '#6a5636' }).setOrigin(0, 0.5);
    // Same-origin webviews coordinate over a BroadcastChannel so only ONE post plays:
    // when another post claims audio, this one goes to sleep (pauses + needs re-waking).
    try {
      this.audioChan = new BroadcastChannel('resonance-audio');
      this.audioChan.onmessage = (ev: MessageEvent) => {
        const d = ev.data as { t?: string } | null;
        if (d && d.t && d.t !== this.audioId) this.goSleep();
      };
    } catch {
      this.audioChan = null;
    }
    window.addEventListener('blur', this.pauseHandler);
    window.addEventListener('pagehide', this.pauseHandler);
    document.addEventListener('freeze', this.pauseHandler);
    document.addEventListener('visibilitychange', this.visHandler);

    // RESET: tap = reset selected beat's wave; hold = clear the whole draft.
    this.resetImg = this.add.image(0, 0, 'cb_pill').setTint(0xf1b0a0).setInteractive({ useHandCursor: true });
    this.resetText = this.add.text(0, 0, '↺', { fontFamily: CRAYON, fontSize: '20px', color: '#7a3520' }).setOrigin(0.5);
    this.resetImg.on('pointerdown', () => {
      if (!this.gate()) return;
      this.resetHeld = false;
      this.resetTimer = this.time.delayedCall(550, () => {
        this.resetHeld = true;
        this.clearDraft();
      });
    });
    this.resetImg.on('pointerup', () => {
      if (!this.resetTimer) return;
      this.resetTimer.remove();
      this.resetTimer = undefined;
      if (!this.resetHeld) this.resetSelectedWave();
    });
    this.resetImg.on('pointerout', () => {
      this.resetTimer?.remove();
      this.resetTimer = undefined;
    });

    this.saveImg = this.add.image(0, 0, 'cb_pill').setTint(0x3fb0ac).setInteractive({ useHandCursor: true });
    this.saveImg.on('pointerdown', () => {
      if (this.gate()) void this.commit();
    });
    this.saveText = this.add.text(0, 0, t('save'), { fontFamily: CRAYON, fontSize: '16px', color: '#fff9ec' }).setOrigin(0.5);
    this.saveIcon = this.add.image(0, 0, 'ic_save');
    this.fsImg = this.add.image(0, 0, 'cb_pill').setTint(0xf2c14e);
    this.fsIcon = this.add.image(0, 0, 'ic_fs');
    this.ppImg = this.add.image(0, 0, 'cb_pill').setTint(0x8fd6a0).setInteractive({ useHandCursor: true });
    this.ppImg.on('pointerdown', () => {
      if (this.gate()) this.togglePlayPause();
    });
    this.ppIcon = this.add.image(0, 0, 'ic_play');
    this.rankImg = this.add.image(0, 0, 'cb_pill').setTint(0xe8cf9a);
    this.rankIcon = this.add.image(0, 0, 'ic_rank');
    this.setImg = this.add.image(0, 0, 'cb_pill').setTint(0xd9c9a4);
    this.setIcon = this.add.image(0, 0, 'ic_gear');
    this.clockIcon = this.add.image(0, 0, 'ic_clock');
    this.dateText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '11px', color: '#6b5636' }).setOrigin(1, 0.5);

    this.footer = this.add.text(0, 0, t('footer'), { fontFamily: CRAYON, fontSize: '11px', color: '#8a7a58' }).setOrigin(0.5);
    this.toastText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '15px', color: '#ffd1d1' }).setOrigin(0.5).setAlpha(0);

    this.menuDim = this.add.rectangle(0, 0, 10, 10, 0x201a12, 0.5).setOrigin(0.5).setDepth(50);
    this.menuBackdrop = this.add.zone(0, 0, 10, 10).setOrigin(0.5).setDepth(50).setInteractive();
    this.menuBackdrop.on('pointerdown', () => {
      this.pendingPlaceCell = null; // dismissed the picker without choosing → no bundled beat
      this.showMenu(false);
      this.renderAll();
    });
    this.menuPanel = this.add.graphics().setDepth(51);
    this.menuTitle = this.add.text(0, 0, 'elige un sonido', { fontFamily: CRAYON, fontSize: '15px', color: '#4a3a22' }).setOrigin(0.5).setDepth(52);
    // Fixed 24 slots (3x8); each day's pool fills them (assignPool). Slots keep their
    // objects and just swap the id/icon/label, so the library can grow to any size.
    for (let i = 0; i < DAILY_POOL_SIZE; i++) {
      const img = this.add.image(0, 0, 'cb_pill').setDepth(52);
      const icon = this.add.image(0, 0, 'ic_add').setDepth(53);
      const txt = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '12px', color: '#3a2f22' }).setOrigin(0, 0.5).setDepth(53);
      const slot = { img, icon, txt, id: '' };
      img.on('pointerdown', () => {
        if (slot.id) this.pickInstrument(slot.id);
      });
      this.menuChips.push(slot);
    }
    this.assignPool();
    this.showMenu(false);

    // Tactile "press" feedback on every button (they were flat before): a quick dip + a
    // springy Back.out return so they feel like real, raised keys. Pass each button's face
    // (icon/label) so the whole thing dips together.
    this.addPress(this.tempoDown, this.tempoDownT);
    this.addPress(this.tempoUp, this.tempoUpT);
    this.addPress(this.saveImg, this.saveIcon, this.saveText);
    this.addPress(this.ppImg, this.ppIcon);
    this.addPress(this.resetImg, this.resetText);
    this.addPress(this.edSub, this.edSubIc, this.edSubTx);
    this.addPress(this.wavePill, this.waveTx);
    // the disc's wedges get their feedback from onPadDown (icon dip + wedge highlight)
    for (const c of this.fxChips) this.addPress(c.img, c.icon, c.txt);
    for (const li of this.labelIcons) this.addPress(li);
    for (const row of this.cells) for (const cell of row) this.addPress(cell);
    for (const m of this.menuChips) this.addPress(m.img, m.icon, m.txt);
    // fs + rank are DOM-overlay buttons; their pills dip from the DOM pointerdown (setupDomButtons).
    this.fsImg.setData('face', [this.fsIcon]);
    this.rankImg.setData('face', [this.rankIcon]);
    this.setImg.setData('face', [this.setIcon]);

    onStep((step) => this.onStepVisual(step));
    this.setupDomButtons();
    this.layout();
    this.scale.on('resize', () => this.layout());
    // Keep the DOM buttons pinned to their canvas spots as the feed scrolls / viewport changes.
    window.addEventListener('scroll', this.syncOnScroll, { passive: true });
    window.addEventListener('resize', this.syncOnScroll);
    // In expanded mode the canvas receives taps directly. A DOM listener (not Phaser's,
    // which dispatches in the game loop, outside the gesture) guarantees the audio unlock
    // / context-resume runs inside the user gesture.
    this.game.canvas.addEventListener('pointerdown', this.unlockAudio);
    this.events.once('shutdown', () => this.shutdown());
    void this.boot();
  }

  private ensureTextures(): void {
    const add = (k: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void => {
      if (this.textures.exists(k)) return;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      draw(ctx);
      this.textures.addCanvas(k, cv);
    };
    add('cb_card', 168, 168, (c) => cardboard(c, 168, 168));
    add('cb_pad', 132, 112, (c) => crayonShape(c, 132, 112, false));
    add('cb_pill', 380, 120, (c) => crayonShape(c, 380, 120, true));
  }

  // ---- networking ---------------------------------------------------------
  private async boot(): Promise<void> {
    try {
      const res = await fetch('/api/jam/init');
      if (!res.ok) throw new Error(`init ${res.status}`);
      const data = (await res.json()) as JamInitResponse;
      this.myUserId = data.userId;
      this.applyServerState(data.state);
      this.energy = data.energy;
      this.channel = data.channel;
      this.subscribe();
      this.startHeartbeat();
    } catch {
      this.applyServerState(this.state);
    }
    if (this.audioReady) {
      setKey(this.state.meta.key);
      this.refreshEngine();
    }
    this.renderAll();
    this.replayPendingIntent(); // continue the flow if we just arrived via an inline-tap expand
    // In fullscreen the user already committed to interacting, so start audio on load. The
    // browser may still require a gesture — unlockAudio (canvas pointerdown) is the fallback.
    if (this.webMode() === 'expanded') {
      this.active = true;
      this.ensureAudio();
    }
  }

  /**
   * Unlock + start audio. Marks audioReady only AFTER initAudio resolves, so if the
   * browser blocks a no-gesture attempt (initAudio's Tone.start() stays pending until a
   * gesture), the first real touch's resumeAudio() un-suspends the context and the same
   * pending init completes — no double init (audioInitting guards that).
   */
  private ensureAudio(): void {
    if (this.audioReady || this.audioInitting) return;
    this.audioInitting = true;
    void initAudio()
      .then(() => {
        this.audioReady = true;
        setKey(this.state.meta.key);
        this.refreshEngine();
        this.claimAudio();
      })
      .catch((e) => console.error('audio init failed:', e))
      .finally(() => {
        this.audioInitting = false;
      });
  }

  /** Claim playback for this post and tell all other posts to pause. */
  private claimAudio(): void {
    try {
      this.audioChan?.postMessage({ t: this.audioId });
    } catch {
      /* ignore */
    }
    if (this.audioReady) setPlaying(true);
    this.renderPlayPause();
  }

  /** First touch on a sleeping post only WAKES it (returns false → swallow the action). */
  private gate(): boolean {
    if (this.active) return true;
    this.activate();
    return false;
  }
  private activate(): void {
    this.active = true;
    this.ensureAudio();
    this.claimAudio();
    this.renderAll();
  }
  private goSleep(): void {
    this.active = false;
    if (this.audioReady) setPlaying(false);
    this.renderPlayPause();
  }
  private togglePlayPause(): void {
    if (isPlaying()) setPlaying(false);
    else this.claimAudio();
    this.renderPlayPause();
  }
  private renderPlayPause(): void {
    this.ppIcon.setTexture(isPlaying() ? 'ic_pause' : 'ic_play');
  }

  private webMode(): string {
    // Dev-only override so the expanded layout can be previewed outside Devvit.
    try {
      const q = new URLSearchParams(location.search).get('mode');
      if (q === 'expanded' || q === 'inline') return q;
    } catch {
      /* no location */
    }
    try {
      return getWebViewMode();
    } catch {
      return 'inline';
    }
  }
  private toggleFullscreen(ev: MouseEvent): void {
    try {
      if (this.webMode() === 'expanded') exitExpandedMode(ev);
      else requestExpandedMode(ev, 'game');
    } catch {
      /* already in the requested mode */
    }
  }

  /**
   * Invisible DOM buttons over the ⛶ pill (always) and the wave bar (inline only).
   * Devvit's expand/exit APIs reject anything that isn't a trusted native `click`, and
   * taps on the Phaser canvas never produce one (Phaser preventDefaults touchstart), so
   * these are the only reliable way to switch modes from a touch.
   */
  private setupDomButtons(): void {
    const make = (): HTMLButtonElement => {
      const b = document.createElement('button');
      const s = b.style;
      s.position = 'fixed';
      s.zIndex = '10';
      s.background = 'transparent';
      s.border = 'none';
      s.padding = '0';
      s.margin = '0';
      s.cursor = 'pointer';
      s.display = 'none';
      s.setProperty('-webkit-tap-highlight-color', 'transparent');
      document.body.appendChild(b);
      return b;
    };
    this.fsBtn = make();
    this.fsBtn.addEventListener('click', (ev: MouseEvent) => {
      if (!this.gate()) return;
      if (this.instrMenuOpen) return;
      this.toggleFullscreen(ev);
    });
    this.fsBtn.addEventListener('pointerdown', () => this.pressFx(this.fsImg)); // DOM overlay → animate its pill
    // Full-canvas catcher (inline only). Being a real DOM button it yields the trusted
    // click Devvit needs. Play/pause is handled inline here; everything else stashes what
    // was tapped and expands, so the flow resumes on the (reloaded) expanded page.
    this.inlineCatcher = make();
    this.inlineCatcher.style.zIndex = '9'; // below fsBtn (10) so the ⛶ pill keeps its taps
    this.inlineCatcher.addEventListener('click', (ev: MouseEvent) => this.onInlineTap(ev));
    // pointerdown fires at the START of ANY touch — including a swipe/scroll, which never
    // produces a `click`. Use it to wake + start audio "when the finger passes over the
    // post" (the autoplay feel), WITHOUT expanding (expand stays on tap/click only).
    this.inlineCatcher.addEventListener('pointerdown', () => {
      this.wokeByPointer = !this.active;
      if (this.wokeByPointer) this.activate();
    });
    // Ranking button (DOM so it clicks reliably inline or expanded), sits over the rank pill.
    this.rankBtn = make();
    this.rankBtn.addEventListener('click', () => void this.openRanking());
    this.rankBtn.addEventListener('pointerdown', () => this.pressFx(this.rankImg));
    // Settings (DOM too, so it clicks reliably inline where the catcher covers the canvas).
    this.setBtn = make();
    this.setBtn.addEventListener('click', () => this.openSettings());
    this.setBtn.addEventListener('pointerdown', () => this.pressFx(this.setImg));
    this.setupRankingOverlay();
    this.setupSettingsOverlay();
  }

  /** Build the ranking/profile modal once (DOM — avatars, lists, crayon styling). */
  private setupRankingOverlay(): void {
    if (this.rankOverlay) return;
    const ov = document.createElement('div');
    ov.id = 'rk-ov';
    ov.style.display = 'none';
    ov.innerHTML = `
      <style>
        #rk-ov{position:fixed;inset:0;z-index:20;background:rgba(32,26,18,.55);
          font-family:'Gochi Hand','Comic Sans MS',cursive;overflow:auto;
          -webkit-tap-highlight-color:transparent}
        #rk-ov .rk-card{max-width:520px;margin:5vh auto;background:#e7d6ac;border:3px solid #3a2f22;
          border-radius:18px;padding:14px 16px 20px;color:#3a2f22}
        #rk-ov .rk-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        #rk-ov .rk-title{font-size:26px;color:#e2574c;transform:rotate(-2deg)}
        #rk-ov .rk-x{font-size:22px;background:#f1b0a0;border:2px solid #3a2f22;border-radius:50%;
          width:34px;height:34px;line-height:30px;text-align:center;cursor:pointer}
        #rk-ov .rk-me{display:flex;align-items:center;gap:10px;background:#f1e3bf;border:2px solid #3a2f22;
          border-radius:14px;padding:8px 10px;margin-bottom:10px}
        #rk-ov .rk-me .rk-stats{font-size:15px;line-height:1.35}
        #rk-ov .rk-most{font-size:15px;margin:2px 2px 10px;color:#6b5636}
        #rk-ov .rk-sec{font-size:17px;color:#4a3a22;margin:10px 2px 4px}
        #rk-ov .rk-row{display:flex;align-items:center;gap:9px;padding:4px 6px;border-bottom:1.5px dashed #c9b487;font-size:16px}
        #rk-ov .rk-rn{width:20px;text-align:center;color:#8a7a58}
        #rk-ov .rk-nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #rk-ov .rk-vl{font-weight:bold;color:#e2574c}
        #rk-ov .rk-avw{position:relative;width:30px;height:30px;flex:0 0 30px}
        #rk-ov .rk-av,#rk-ov .rk-fb{position:absolute;inset:0;width:30px;height:30px;border-radius:50%;
          border:2px solid #3a2f22;box-sizing:border-box}
        #rk-ov .rk-fb{display:flex;align-items:center;justify-content:center;color:#fff9ec;font-size:15px}
        #rk-ov .rk-me .rk-avw{width:52px;height:52px;flex:0 0 52px}
        #rk-ov .rk-me .rk-av,#rk-ov .rk-me .rk-fb{width:52px;height:52px;font-size:22px}
      </style>
      <div class="rk-card">
        <div class="rk-top"><span class="rk-title" id="rk-title">RANKING</span><div class="rk-x" id="rk-close">✕</div></div>
        <div id="rk-body">cargando…</div>
      </div>`;
    document.body.appendChild(ov);
    this.rankOverlay = ov;
    const close = (): void => { ov.style.display = 'none'; };
    ov.querySelector('#rk-close')?.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); // click backdrop to close
  }

  /**
   * Settings: the language switch + the in-app guide. Flipping the language re-labels everything
   * in place — `layout()` re-runs so the pills resize around their new text — and repaints this.
   */
  private setupSettingsOverlay(): void {
    if (this.setOverlay) return;
    const ov = document.createElement('div');
    ov.id = 'st-ov';
    ov.style.display = 'none';
    ov.innerHTML = `
      <style>
        #st-ov{position:fixed;inset:0;z-index:21;background:rgba(32,26,18,.55);
          font-family:'Gochi Hand','Comic Sans MS',cursive;overflow:auto;
          -webkit-tap-highlight-color:transparent}
        #st-ov .st-card{max-width:460px;margin:6vh auto;background:#e7d6ac;border:3px solid #3a2f22;
          border-radius:18px;padding:14px 16px 20px;color:#3a2f22}
        /* the guide is long — keep the title + ✕ reachable while it scrolls */
        #st-ov .st-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
          position:sticky;top:-2px;background:#e7d6ac;padding:6px 0 4px;z-index:1}
        #st-ov .st-title{font-size:26px;color:#e2574c;transform:rotate(-2deg)}
        #st-ov .st-x{font-size:22px;background:#f1b0a0;border:2px solid #3a2f22;border-radius:50%;
          width:34px;height:34px;line-height:30px;text-align:center;cursor:pointer}
        #st-ov .st-sec{font-size:18px;color:#4a3a22;margin:6px 2px 8px}
        #st-ov .st-langs{display:flex;gap:10px}
        #st-ov .st-lang{flex:1;font-family:inherit;font-size:19px;padding:10px 6px;cursor:pointer;
          background:#f1e3bf;border:2.5px solid #3a2f22;border-radius:14px;color:#3a2f22}
        #st-ov .st-lang.on{background:#8fd6a0}
        #st-ov .st-rule{border:none;border-top:2px dashed #c9b487;margin:16px 0 10px}
        #st-ov .st-intro{font-size:16px;line-height:1.4;background:#f1e3bf;border:2px solid #3a2f22;
          border-radius:14px;padding:9px 11px;margin-bottom:6px}
        #st-ov .st-h{font-size:19px;color:#e2574c;margin:14px 2px 6px;transform:rotate(-.6deg)}
        #st-ov .st-row{display:flex;align-items:flex-start;gap:9px;padding:4px 2px;font-size:15.5px;
          line-height:1.35;border-bottom:1.5px dashed #d6c49a}
        #st-ov .st-row:last-child{border-bottom:none}
        #st-ov .st-ic{flex:0 0 26px;width:26px;height:26px;margin-top:1px}
        #st-ov .st-bul{flex:0 0 26px;text-align:center;color:#8a7a58}
        #st-ov .st-k{flex:0 0 auto;background:#f1e3bf;border:2px solid #3a2f22;border-radius:9px;
          padding:0 6px;margin-top:1px;white-space:nowrap}
      </style>
      <div class="st-card">
        <div class="st-top"><span class="st-title" id="st-title"></span><div class="st-x" id="st-close">✕</div></div>
        <div class="st-sec" id="st-langlabel"></div>
        <div class="st-langs">
          <button class="st-lang" id="st-es" type="button">Español</button>
          <button class="st-lang" id="st-en" type="button">English</button>
        </div>
        <hr class="st-rule">
        <div class="st-sec" id="st-guidelabel"></div>
        <div id="st-guide"></div>
      </div>`;
    document.body.appendChild(ov);
    this.setOverlay = ov;
    const close = (): void => {
      ov.style.display = 'none';
    };
    ov.querySelector('#st-close')?.addEventListener('click', close);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close();
    });
    const pick = (l: Lang): void => {
      if (getLang() === l) return;
      setLang(l);
      this.applyLang();
      this.paintSettings();
    };
    ov.querySelector('#st-es')?.addEventListener('click', () => pick('es'));
    ov.querySelector('#st-en')?.addEventListener('click', () => pick('en'));
  }

  /** A crayon icon as a data URL, so the DOM guide shows the very same art as the buttons. */
  private iconUrl(name: string): string {
    try {
      const src = this.textures.get(`ic_${name}`)?.getSourceImage();
      if (src instanceof HTMLCanvasElement) return src.toDataURL();
    } catch {
      /* texture missing → fall back to a bullet */
    }
    return '';
  }

  private paintSettings(): void {
    const ov = this.setOverlay;
    if (!ov) return;
    const set = (id: string, txt: string): void => {
      const el = ov.querySelector(id);
      if (el) el.textContent = txt;
    };
    set('#st-title', t('settings'));
    set('#st-langlabel', t('language'));
    set('#st-guidelabel', t('guide'));
    ov.querySelector('#st-es')?.classList.toggle('on', getLang() === 'es');
    ov.querySelector('#st-en')?.classList.toggle('on', getLang() === 'en');

    const esc = (x: string): string => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
    const g = guide();
    const rowHtml = (r: GuideRow): string => {
      const url = r.icon ? this.iconUrl(r.icon) : '';
      const lead = url ? `<img class="st-ic" src="${url}" alt="">` : r.k ? `<span class="st-k">${esc(r.k)}</span>` : `<span class="st-bul">•</span>`;
      return `<div class="st-row">${lead}<span>${esc(r.v)}</span></div>`;
    };
    const body =
      `<div class="st-intro">${esc(g.intro)}</div>` +
      g.secs.map((sec) => `<div class="st-h">${esc(sec.h)}</div>${sec.rows.map(rowHtml).join('')}`).join('');
    const host = ov.querySelector('#st-guide');
    if (host) host.innerHTML = body;
  }

  private openSettings(): void {
    if (!this.setOverlay) return;
    this.paintSettings();
    this.setOverlay.style.display = 'block';
  }

  /** Re-label everything after a language change (pill widths depend on their text). */
  private applyLang(): void {
    this.footer.setText(t('footer'));
    this.layout(); // re-measures the pills, then renderAll() re-writes every string
  }

  private async openRanking(): Promise<void> {
    const ov = this.rankOverlay;
    if (!ov) return;
    ov.style.display = 'block';
    const ttl = ov.querySelector('#rk-title');
    if (ttl) ttl.textContent = t('rankTitle');
    const body = ov.querySelector('#rk-body');
    if (body) body.textContent = t('loading');
    try {
      const [rk, pf] = await Promise.all([
        fetch('/api/jam/rankings').then((r) => r.json() as Promise<RankingsResponse>),
        fetch('/api/jam/profile').then((r) => r.json() as Promise<ProfileResponse>),
      ]);
      if (body) body.innerHTML = this.rankingHtml(rk, pf);
    } catch {
      if (body) body.textContent = t('rankLoadErr');
    }
  }

  private rankingHtml(rk: RankingsResponse, pf: ProfileResponse): string {
    const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
    const avColors = ['#e2574c', '#3fb0ac', '#f2b705', '#9b6bd0', '#5bb974', '#4a7fd0'];
    const avatar = (name: string, url: string, big = false): string => {
      const init = esc((name[0] ?? '?').toUpperCase());
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      const col = avColors[h % avColors.length];
      const img = url ? `<img class="rk-av" src="${esc(url)}" alt="" onerror="this.style.display='none'">` : '';
      return `<span class="rk-avw${big ? ' rk-me' : ''}"><span class="rk-fb" style="background:${col}">${init}</span>${img}</span>`;
    };
    const list = (title: string, rows: RankingsResponse['placed'], unit: string): string => {
      if (!rows.length) return `<div class="rk-sec">${title}</div><div class="rk-most">${t('rankNobody')}</div>`;
      const items = rows
        .slice(0, 5)
        .map((e, i) => `<div class="rk-row"><span class="rk-rn">${i + 1}</span>${avatar(e.username, e.avatar)}<span class="rk-nm">${esc(e.username)}</span><span class="rk-vl">${e.value} ${unit}</span></div>`)
        .join('');
      return `<div class="rk-sec">${title}</div>${items}`;
    };
    const favLabel = pf.favInstrument ? (instrLabel(instrumentById(pf.favInstrument)) || pf.favInstrument) : '—';
    const topLabel = rk.topInstrument ? (instrLabel(instrumentById(rk.topInstrument.id)) || rk.topInstrument.id) : '—';
    const me = `
      <div class="rk-me">
        ${avatar(pf.username, pf.avatar, true)}
        <div class="rk-stats"><b>${esc(pf.username)}</b><br>
        ${pf.placed} ${t('rankMePut')} · ${pf.removed} ${t('rankMeRemoved')}<br>
        ${t('rankMeStreak')} ${pf.streak} (${t('rankMeBest')} ${pf.best}) · ${t('rankMeFav')}: ${esc(favLabel)}</div>
      </div>`;
    return (
      me +
      `<div class="rk-most">${t('rankTopSound')} <b>${esc(topLabel)}</b></div>` +
      list(t('rankPlaced'), rk.placed, '') +
      list(t('rankRemoved'), rk.removed, '') +
      list(t('rankStreak'), rk.streak, t('rankDays'))
    );
  }

  private onInlineTap(ev: MouseEvent): void {
    if (this.webMode() === 'expanded') return; // catcher is hidden expanded; safety
    const woke = this.wokeByPointer; // did THIS gesture's pointerdown just wake (and start) the post?
    this.wokeByPointer = false;
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const gx = (ev.clientX - rect.left) * (this.scale.width / rect.width);
    const gy = (ev.clientY - rect.top) * (this.scale.height / rect.height);
    // Play/pause stays inline so people can listen in the feed without expanding. If this
    // gesture just woke+started the post, don't immediately toggle it back to pause.
    if (this.ppImg.getBounds().contains(gx, gy)) {
      if (!woke && this.gate()) {
        this.pressFx(this.ppImg);
        this.togglePlayPause();
      }
      return;
    }
    if (!this.active) {
      this.activate(); // safety: pointerdown normally already woke it
      return;
    }
    // First interaction just woke + started audio (matters on desktop, where a mouse can't
    // "swipe"): let it play INLINE and don't expand yet — the next click expands.
    if (woke) return;
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(this.hitTestIntent(gx, gy)));
    } catch {
      /* private mode / storage disabled → just expand */
    }
    try {
      requestExpandedMode(ev, 'game');
    } catch {
      this.toast(t('fsErr'), '#ffe0a0');
    }
  }

  /** Which control the inline tap landed on (game coords), for replay after expanding. */
  private hitTestIntent(gx: number, gy: number): PendingIntent {
    if (this.tempoDown.getBounds().contains(gx, gy)) return { kind: 'tempo', delta: -1 };
    if (this.tempoUp.getBounds().contains(gx, gy)) return { kind: 'tempo', delta: 1 };
    const { left, top, cellW, rowH } = this.gridBox;
    const inRows = gy >= top && gy < top + rowH * TRACKS;
    if (inRows && gx >= left && gx < left + cellW * STEPS) {
      const s = Phaser.Math.Clamp(Math.floor((gx - left) / cellW), 0, STEPS - 1);
      const t = Phaser.Math.Clamp(Math.floor((gy - top) / rowH), 0, TRACKS - 1);
      return { kind: 'cell', t, s };
    }
    if (inRows && gx < left) {
      return { kind: 'label', t: Phaser.Math.Clamp(Math.floor((gy - top) / rowH), 0, TRACKS - 1) };
    }
    return { kind: 'expand' };
  }

  /** After the expand reload, resume whatever the user tapped inline. */
  private replayPendingIntent(): void {
    let raw: string | null;
    try {
      raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) sessionStorage.removeItem(PENDING_KEY); // clear-on-read: never double-apply
    } catch {
      return;
    }
    if (!raw || this.webMode() !== 'expanded') return;
    let intent: PendingIntent;
    try {
      intent = JSON.parse(raw) as PendingIntent;
    } catch {
      return;
    }
    this.active = true; // arrived by a deliberate expand → treat as awake (audio unlocks on first tap)
    switch (intent.kind) {
      case 'cell':
        this.tapCell(intent.t, intent.s);
        break;
      case 'label':
        this.selectedTrack = intent.t;
        this.showMenu(true); // tapping an instrument name → open its picker, ready to choose
        this.renderAll();
        break;
      case 'tempo':
        this.stageTempo(intent.delta);
        break;
      case 'expand':
        this.renderAll();
        break;
    }
  }

  /** Align the DOM buttons with their canvas counterparts (game coords → CSS px). */
  private syncDomButtons(): void {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sx = rect.width / this.scale.width;
    const sy = rect.height / this.scale.height;
    const put = (el: HTMLButtonElement | null, x: number, y: number, w: number, h: number, show: boolean): void => {
      if (!el) return;
      el.style.left = `${rect.left + x * sx}px`;
      el.style.top = `${rect.top + y * sy}px`;
      el.style.width = `${w * sx}px`;
      el.style.height = `${h * sy}px`;
      el.style.display = show ? 'block' : 'none';
    };
    const fb = this.fsImg.getBounds();
    put(this.fsBtn, fb.x, fb.y, fb.width, fb.height, !this.instrMenuOpen);
    const rb = this.rankImg.getBounds();
    put(this.rankBtn, rb.x, rb.y, rb.width, rb.height, !this.instrMenuOpen);
    const sb = this.setImg.getBounds();
    put(this.setBtn, sb.x, sb.y, sb.width, sb.height, !this.instrMenuOpen);
    // Inline: the catcher covers the whole canvas so any tap can expand. Expanded: hidden,
    // so the canvas is interacted with directly (wave drag, etc.).
    put(this.inlineCatcher, 0, 0, this.scale.width, this.scale.height, this.webMode() !== 'expanded' && !this.instrMenuOpen);
  }

  private applyServerState(state: JamState): void {
    this.state = state;
    this.instruments = state.meta.instruments.slice(0, TRACKS);
    while (this.instruments.length < TRACKS) this.instruments.push('');
    this.bpm = state.meta.bpm;
    this.sharedCells.clear();
    for (const c of state.cells) this.sharedCells.set(key(c.track, c.step), { by: c.by, fx: c.fx });
    this.assignPool();
    this.applyTheme();
  }

  /** Recolor the paper surfaces for this day (bg, panel, wave slider, slider button). */
  private applyTheme(): void {
    this.theme = themeFor(this.state.meta.day); // per-DAY palette, frozen per post (meta.day is set at creation)
    this.cameras.main.setBackgroundColor(this.theme.bg);
    this.bg.setTint(this.theme.card);
    // NOTE: wave bar + reset button + fx chips keep FIXED colors (personality), not themed.
    this.layout(); // redraw panel with the new palette
  }

  /** Fill the 24 menu slots from the day's pool of pickable sounds. */
  private assignPool(): void {
    const pool = this.state.meta.pool ?? [];
    for (let i = 0; i < this.menuChips.length; i++) {
      const m = this.menuChips[i];
      if (!m) continue;
      const id = pool[i] ?? '';
      m.id = id;
      const inst = instrumentById(id);
      m.icon.setTexture(inst ? `ic_${id}` : 'ic_add');
      m.txt.setText(inst ? instrLabel(inst) : '');
      m.img.setTint(lighten(inst?.color ?? 0x999999, 0.35));
    }
  }

  private subscribe(): void {
    if (!this.channel) return;
    try {
      this.conn = connectRealtime<JamDiff>({ channel: this.channel, onMessage: (m) => this.applyDiff(m) });
    } catch {
      this.conn = null;
    }
  }

  private startHeartbeat(): void {
    const beat = async (): Promise<void> => {
      try {
        const res = await fetch('/api/jam/heartbeat', { method: 'POST' });
        const data = (await res.json()) as { count: number };
        this.presence = data.count;
        this.renderHeader();
      } catch {
        /* ignore */
      }
    };
    void beat();
    this.heartbeatTimer = setInterval(() => void beat(), 10_000);
  }

  private applyDiff(d: JamDiff): void {
    if (d.kind === 'place') this.sharedCells.set(key(d.track, d.step), { by: d.by, fx: d.fx });
    else if (d.kind === 'remove') this.sharedCells.delete(key(d.track, d.step));
    else if (d.kind === 'cellFx') {
      const c = this.sharedCells.get(key(d.track, d.step));
      if (c) this.sharedCells.set(key(d.track, d.step), { by: c.by, fx: d.fx });
    } else if (d.kind === 'setInstrument') {
      if (d.track >= 0 && d.track < TRACKS) this.instruments[d.track] = d.instrument;
    } else if (d.kind === 'tempo') this.bpm = d.bpm;
    else if (d.kind === 'presence') this.presence = d.count;
    this.refreshEngine();
    this.renderAll();
  }

  // ---- cell/ownership helpers --------------------------------------------
  private effInstrument(t: number): string {
    return this.draftInstr.get(t) ?? this.instruments[t] ?? '';
  }
  private cellActive(k: string): boolean {
    return this.draftPlace.has(k) || (this.sharedCells.has(k) && !this.draftRemove.has(k));
  }
  private effCellFx(k: string): TrackFx {
    return this.draftCellFx.get(k) ?? this.sharedCells.get(k)?.fx ?? { ...FLAT_FX };
  }
  private fxKey(fx: TrackFx): string {
    // Identity of a beat's whole expression, so ANY change (wave, pitch, ratchet, duration,
    // volume) registers as an edit for cost + commit — miss a field here and a change to it is
    // silently dropped at save time. Wave folds to 'off' when depth is 0.
    const wave = fx.depth <= 0 ? 'off' : `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}`;
    return `${wave}|p${Math.round(fx.pitch)}|s${Math.round(fx.sub)}|d${Math.round(fx.dur * 100)}|v${Math.round(fx.vol)}`;
  }

  private pendingCost(): number {
    // Choosing an instrument for an EMPTY row is free (it rides on the first beat's ficha);
    // changing a row that already had an instrument costs 1.
    let instrCost = 0;
    for (const [t] of this.draftInstr) if ((this.instruments[t] ?? '') !== '') instrCost += 1;
    let cost = this.draftPlace.size + instrCost + Math.ceil(Math.abs(this.draftTempo) / 2);
    cost += this.draftRemove.size; // removing a saved beat always costs a ficha (even your own)
    for (const [k, fx] of this.draftCellFx) {
      if (this.draftPlace.has(k)) continue; // shaping the beat you're placing rides along, free
      if (this.fxKey(fx) === this.fxKey(this.sharedCells.get(k)?.fx ?? { ...FLAT_FX })) continue;
      cost += 1; // editing a SAVED beat costs a ficha, whoever placed it
    }
    return cost;
  }

  // ---- editing ------------------------------------------------------------
  private tapCell(t: number, s: number): void {
    if (!this.gate()) return;
    if (this.instrMenuOpen) return;
    const k = key(t, s);
    if (this.draftRemove.has(k)) {
      this.draftRemove.delete(k); // cancel a pending removal
      this.selectedCell = k;
    } else if (!this.cellActive(k)) {
      if (this.effInstrument(t) === '') {
        this.selectedTrack = t;
        this.pendingPlaceCell = k; // place + select this beat once an instrument is chosen
        this.showMenu(true);
        this.renderAll();
        return;
      }
      if (this.pendingCost() + 1 > this.energy) return this.flashNoFichas();
      this.draftPlace.add(k);
      this.selectedCell = k; // auto-select the new beat to shape its wave
    } else if (this.selectedCell === k) {
      // second tap on the selected beat → remove it
      if (this.draftPlace.has(k)) {
        this.draftPlace.delete(k);
        this.draftCellFx.delete(k);
        this.selectedCell = null;
      } else {
        if (this.pendingCost() + 1 > this.energy) return this.flashNoFichas();
        this.draftRemove.add(k);
      }
    } else {
      this.selectedCell = k; // select it (to edit its wave)
    }
    this.refreshEngine();
    this.renderAll();
  }

  private onTrackLabel(tr: number): void {
    if (!this.gate()) return;
    this.pendingPlaceCell = null; // opening the picker from the label = no bundled beat
    // One tap opens the picker. It used to just SELECT the row, so you had to tap the "+" twice.
    // Tapping the row whose picker is already open closes it again.
    const closing = this.selectedTrack === tr && this.instrMenuOpen;
    this.selectedTrack = tr;
    this.showMenu(!closing);
    this.renderAll();
  }

  private pickInstrument(id: string): void {
    const t = this.selectedTrack;
    if (t < 0) return;
    const place = this.pendingPlaceCell; // the beat to bundle-place (from tapping an empty row)
    this.pendingPlaceCell = null;

    // Stage the instrument (toggle off if re-picking the current one). Remember the prior
    // draft so we can roll back if the whole thing can't be afforded.
    const hadDraft = this.draftInstr.has(t);
    const prevDraft = this.draftInstr.get(t);
    if (id === this.instruments[t]) this.draftInstr.delete(t);
    else this.draftInstr.set(t, id);

    // Bundle: place + select the beat the user originally tapped on this (empty) row.
    const placedNow = !!place && !this.cellActive(place) && !this.draftPlace.has(place);
    if (place && placedNow) {
      this.draftPlace.add(place);
      this.selectedCell = place;
    }

    // Cost is computed by pendingCost (instrument-from-empty is free), so a first beat on a
    // fresh row is exactly 1 ficha. Roll back if it doesn't fit.
    if (this.pendingCost() > this.energy) {
      if (place && placedNow) {
        this.draftPlace.delete(place);
        this.selectedCell = null;
      }
      if (hadDraft) this.draftInstr.set(t, prevDraft as string);
      else this.draftInstr.delete(t);
      this.flashNoFichas();
      return;
    }
    this.showMenu(false);
    this.refreshEngine();
    this.renderAll();
  }

  private pickFxTarget(type: FxType): void {
    if (!this.gate()) return;
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    const cur = this.effCellFx(k);
    // On a flat beat, picking an effect did nothing (depth 0 = no wave, so nothing was heard
    // and nothing lit up). Turn the first wave on for them.
    const w = WAVE_PRESETS[FIRST_WAVE];
    const wave = cur.depth > 0 || !w ? { depth: cur.depth, rate: cur.rate } : { depth: w.depth, rate: w.rate };
    this.setDraftFx(k, { ...cur, ...wave, type });
  }

  // ---- per-beat pitch / ratchet (redoble) ---------------------------------
  private nudgePitch(delta: number): void {
    if (!this.gate()) return;
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    const cur = this.effCellFx(k);
    const pitch = Phaser.Math.Clamp(cur.pitch + delta, PITCH_MIN, PITCH_MAX);
    this.padShow = 'pitch'; // the hub now reads out tono (even if we hit the clamp)
    if (pitch === cur.pitch) return this.renderBeatEdit();
    this.setDraftFx(k, { ...cur, pitch });
  }
  private cycleSub(): void {
    if (!this.gate()) return;
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    const cur = this.effCellFx(k);
    const sub = cur.sub >= SUB_MAX ? SUB_MIN : cur.sub + 1;
    this.setDraftFx(k, { ...cur, sub });
  }
  /**
   * The pad's four zones are resolved geometrically: reject the central hub (the readout), then
   * map the tap's angle to a zone split on the diagonals.
   *   0 = ▶ tono+   1 = ▼ vol−   2 = ◀ tono−   3 = ▲ vol+
   */
  private onPadDown(p: Phaser.Input.Pointer): void {
    if (this.instrMenuOpen) return;
    const dx = p.worldX - this.padCx;
    const dy = p.worldY - this.padCy;
    if (Math.hypot(dx, dy) < this.padRIn) return; // hub = readout, inert
    const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const q = deg >= 315 || deg < 45 ? 0 : deg < 135 ? 1 : deg < 225 ? 2 : 3;
    this.padPressed = q;
    this.time.delayedCall(170, () => {
      this.padPressed = -1;
      this.drawPad();
    });
    this.pressFx([this.edPitchUpIc, this.edVolDnIc, this.edPitchDnIc, this.edVolUpIc][q]);
    if (q === 0) this.nudgePitch(1);
    else if (q === 1) this.nudgeVol(-1);
    else if (q === 2) this.nudgePitch(-1);
    else this.nudgeVol(1);
    this.drawPad();
  }

  /** The pad's diagonal dividers over the crayon pill, + a triangle behind the pressed zone. */
  private drawPad(): void {
    const g = this.padG;
    g.clear();
    if (!g.visible) return;
    const { padCx: cx, padCy: cy, padR: R } = this;
    const r = R * 0.9; // keep triangles/lines inside the pill's rounded corners
    const c = [
      new Phaser.Math.Vector2(cx + r, cy - r), // TR
      new Phaser.Math.Vector2(cx + r, cy + r), // BR
      new Phaser.Math.Vector2(cx - r, cy + r), // BL
      new Phaser.Math.Vector2(cx - r, cy - r), // TL
    ];
    // zone q spans two adjacent corners: right=TR..BR, down=BR..BL, left=BL..TL, up=TL..TR
    const pairs = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];
    if (this.padPressed >= 0) {
      const [a = 0, b = 1] = pairs[this.padPressed] ?? [0, 1];
      const tri = [new Phaser.Math.Vector2(cx, cy), c[a] ?? c[0], c[b] ?? c[0]] as Phaser.Math.Vector2[];
      g.fillStyle(0xffe6a7, 0.95).fillPoints(tri, true);
    }
    g.lineStyle(2 * this.s, INK, 0.32);
    for (const p of c) {
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(p.x, p.y);
      g.strokePath();
    }
  }

  private nudgeVol(delta: number): void {
    if (!this.gate()) return;
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    const cur = this.effCellFx(k);
    const vol = Phaser.Math.Clamp(cur.vol + delta, BVOL_MIN, BVOL_MAX);
    this.padShow = 'vol'; // the hub now reads out volumen (even if we hit the clamp)
    if (vol === cur.vol) return this.renderBeatEdit();
    this.setDraftFx(k, { ...cur, vol });
  }
  private renderBeatEdit(): void {
    const k = this.selectedCell;
    const fx = k ? this.effCellFx(k) : null;
    const a = fx ? 1 : 0.4;
    for (const o of [
      this.edPitchDnIc,
      this.edPitchUpIc,
      this.edPitchVal,
      this.edSub,
      this.edSubIc,
      this.edSubTx,
      this.edVolUpIc,
      this.edVolDnIc,
      this.padPill,
      this.padG,
      this.wavePill,
      this.waveTx,
      this.waveG,
      this.fxPill,
      this.fxDiv,
    ])
      o.setAlpha(a);
    this.drawPad();
    // The hub shows ONE value: whichever axis was moved last (tono ◀▶ or volumen ▲▼).
    const n = this.padShow === 'vol' ? (fx ? fx.vol : 0) : fx ? fx.pitch : 0;
    const nStr = n > 0 ? `+${n}` : `${n}`;
    const word = this.padShow === 'vol' ? t('vol') : t('tono');
    this.edPitchVal.setText(this.padLong ? `${word} ${nStr}` : `${word[0]}${nStr}`);
    this.edSubIc.setTexture(`ic_sub${fx ? fx.sub : 1}`);
    this.edSubTx.setText(`×${fx ? fx.sub : 1}`);
    const wk = fx ? WAVE_PRESETS[waveIdx(fx)]?.key : undefined;
    this.waveTx.setText(wk ? t(wk) : t('onda'));
  }

  // ---- tactile button feedback --------------------------------------------
  /**
   * A quick press dip + springy return, so a flat pill reads as a real pressable key. The
   * pill and its face (icon/label) dip together so the whole button moves, not just the base.
   */
  private pressFx(img?: Phaser.GameObjects.Image): void {
    if (!img || img.getData('pressing')) return;
    img.setData('pressing', true);
    const parts = [img, ...((img.getData('face') as Phaser.GameObjects.GameObject[] | undefined) ?? [])];
    for (const p of parts) {
      const t = p as unknown as { scaleX: number; scaleY: number; setScale: (x: number, y: number) => void };
      const sx = t.scaleX;
      const sy = t.scaleY;
      t.setScale(sx * 0.9, sy * 0.85); // dip in on press
      this.tweens.add({ targets: p, scaleX: sx, scaleY: sy, duration: 170, ease: 'Back.out' });
    }
    this.time.delayedCall(190, () => img.setData('pressing', false));
  }
  /** Wire tactile feedback; `face` are the icon/label objects that should dip with the pill. */
  private addPress(img: Phaser.GameObjects.Image, ...face: Phaser.GameObjects.GameObject[]): void {
    if (face.length) img.setData('face', face);
    img.on('pointerdown', () => this.pressFx(img));
  }

  // ---- wave button ----------------------------------------------------------
  // The wave was a free 2-axis drag bar, but dragging is hostile on a phone (the Reddit feed
  // scrolls at the NATIVE layer above the web view and steals the gesture mid-drag). It's now
  // a plain BUTTON: each tap moves the selected beat to the next preset.
  private cycleWave(): void {
    if (!this.gate()) return;
    if (this.instrMenuOpen) return;
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    const cur = this.effCellFx(k);
    const next = WAVE_PRESETS[(waveIdx(cur) + 1) % WAVE_PRESETS.length];
    if (!next) return;
    this.setDraftFx(k, { ...cur, type: cur.type === 'none' ? 'vibrato' : cur.type, depth: next.depth, rate: next.rate });
  }

  /** Stage a wave change for a cell. Blocks if it would cost more than you have. */
  private setDraftFx(k: string, fx: TrackFx, quiet = false): void {
    // Shaping a beat you're placing is free; touching a SAVED one costs a ficha, yours or not.
    if (!this.draftCellFx.has(k) && !this.draftPlace.has(k)) {
      const changed = this.fxKey(fx) !== this.fxKey(this.sharedCells.get(k)?.fx ?? { ...FLAT_FX });
      if (changed && this.pendingCost() + 1 > this.energy) {
        if (!quiet) this.flashNoFichas();
        return;
      }
    }
    this.draftCellFx.set(k, fx);
    this.refreshEngine();
    if (quiet) {
      this.renderExpression();
      this.renderFichas();
      this.renderSave();
      this.drawWave();
    } else this.renderAll();
  }

  private stageTempo(delta: number): void {
    const next = Phaser.Math.Clamp(this.bpm + this.draftTempo + delta, this.state.meta.bpmMin, this.state.meta.bpmMax);
    const nd = next - this.bpm;
    if (nd === this.draftTempo) return;
    const others = this.pendingCost() - Math.ceil(Math.abs(this.draftTempo) / 2);
    if (others + Math.ceil(Math.abs(nd) / 2) > this.energy) return this.flashNoFichas();
    this.draftTempo = nd;
    this.refreshEngine();
    this.renderAll();
  }

  private resetSelectedWave(): void {
    const k = this.selectedCell;
    if (!k) return this.toast(t('tapBeatFirst'), '#ffe0a0');
    this.setDraftFx(k, { ...FLAT_FX });
  }
  private clearDraft(): void {
    this.draftPlace.clear();
    this.draftRemove.clear();
    this.draftInstr.clear();
    this.draftCellFx.clear();
    this.draftTempo = 0;
    this.refreshEngine();
    this.renderAll();
    this.toast(t('draftCleared'), '#ffe0a0');
  }

  private refreshEngine(): void {
    if (!this.audioReady) return;
    const merged = new Map<string, TrackFx>();
    for (const [k, c] of this.sharedCells) if (!this.draftRemove.has(k)) merged.set(k, this.draftCellFx.get(k) ?? c.fx);
    for (const k of this.draftPlace) merged.set(k, this.effCellFx(k));
    setActiveCells(merged);
    const eff: string[] = [];
    for (let t = 0; t < TRACKS; t++) eff.push(this.effInstrument(t));
    setInstruments(eff);
    setBpm(this.bpm + this.draftTempo);
  }

  private async commit(): Promise<void> {
    const actions: JamAction[] = [];
    for (const k of this.draftPlace) {
      const [t, s] = k.split('_').map(Number);
      actions.push({ kind: 'place', track: t ?? 0, step: s ?? 0, fx: this.effCellFx(k) });
    }
    for (const k of this.draftRemove) {
      const [t, s] = k.split('_').map(Number);
      actions.push({ kind: 'remove', track: t ?? 0, step: s ?? 0 });
    }
    for (const [k, fx] of this.draftCellFx) {
      if (this.draftPlace.has(k)) continue;
      if (this.fxKey(fx) === this.fxKey(this.sharedCells.get(k)?.fx ?? { ...FLAT_FX })) continue;
      const [t, s] = k.split('_').map(Number);
      actions.push({ kind: 'setCellFx', track: t ?? 0, step: s ?? 0, fx });
    }
    for (const [t, id] of this.draftInstr) actions.push({ kind: 'setInstrument', track: t, instrument: id });
    if (this.draftTempo !== 0) actions.push({ kind: 'nudgeTempo', delta: this.draftTempo });
    if (actions.length === 0) return;
    if (this.pendingCost() > this.energy) return this.flashNoFichas();

    this.foldDraftLocally();
    try {
      const res = await fetch('/api/jam/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      const data = (await res.json()) as JamCommitResponse;
      if (data.ok) {
        this.energy = data.energy;
        this.toast(t('sent'), '#b6ffb6');
      } else this.toast(data.message ?? t('error'), '#ffd1d1');
    } catch {
      this.toast(t('offline'), '#ffe0a0');
    }
    this.refreshEngine();
    this.renderAll();
  }

  private foldDraftLocally(): void {
    const cost = this.pendingCost();
    for (const k of this.draftPlace) this.sharedCells.set(k, { by: this.myUserId, fx: this.effCellFx(k) });
    for (const k of this.draftRemove) this.sharedCells.delete(k);
    for (const [k, fx] of this.draftCellFx) {
      const c = this.sharedCells.get(k);
      if (c && !this.draftPlace.has(k)) this.sharedCells.set(k, { by: c.by, fx });
    }
    for (const [t, id] of this.draftInstr) this.instruments[t] = id;
    this.bpm += this.draftTempo;
    this.energy = Math.max(0, this.energy - cost);
    this.draftPlace.clear();
    this.draftRemove.clear();
    this.draftInstr.clear();
    this.draftCellFx.clear();
    this.draftTempo = 0;
  }

  // ---- instrument dropdown ------------------------------------------------
  private showMenu(open: boolean): void {
    this.instrMenuOpen = open;
    this.menuDim.setVisible(open);
    this.menuPanel.setVisible(open);
    this.menuTitle.setVisible(open);
    if (open) this.menuBackdrop.setInteractive();
    else this.menuBackdrop.disableInteractive();
    for (const m of this.menuChips) {
      const show = open && !!m.id; // empty slots (pool < 24) stay hidden
      m.img.setVisible(show);
      m.icon.setVisible(show);
      m.txt.setVisible(show);
      if (show) m.img.setInteractive({ useHandCursor: true });
      else m.img.disableInteractive();
    }
    this.syncDomButtons();
    if (open) this.layoutMenu();
  }

  private layoutMenu(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const u = this.u;
    const s = this.s;
    this.menuDim.setPosition(W / 2, H / 2).setSize(W, H);
    this.menuBackdrop.setPosition(W / 2, H / 2).setSize(W, H);
    const cols = 3;
    const rows = Math.ceil(this.menuChips.length / cols);
    const px = 22 * u;
    const pw = W - 44 * u;
    // The picker is where the sound NAMES live now, so give the chips + type room to breathe.
    const chH = 46 * s;
    const ph = 62 * s + rows * (chH + 8 * s);
    const py = (H - ph) / 2;
    this.menuPanel.clear();
    this.menuPanel.fillStyle(0xf1e3bf, 0.98).fillRoundedRect(px, py, pw, ph, 18 * s);
    this.menuPanel.lineStyle(3 * s, INK, 0.85).strokeRoundedRect(px, py, pw, ph, 18 * s);
    const sel = this.selectedTrack;
    this.menuTitle.setText(sel >= 0 ? `${t('menuRow')} ${sel + 1}` : t('menuPick')).setPosition(W / 2, py + 26 * s).setFontSize(16 * s);
    const cw = (pw - 24 * u) / cols;
    const curId = sel >= 0 ? this.effInstrument(sel) : '';
    for (let i = 0; i < this.menuChips.length; i++) {
      const m = this.menuChips[i];
      if (!m) continue;
      const inst = instrumentById(m.id);
      m.img.setTint(m.id === curId ? 0xffe6a7 : lighten(inst?.color ?? 0x999999, 0.35));
      const col = i % cols;
      const rowi = Math.floor(i / cols);
      const cx = px + 12 * u + col * cw + cw / 2;
      const cy = py + 54 * s + rowi * (chH + 8 * s) + chH / 2;
      const innerW = cw - 8 * u;
      m.img.setPosition(cx, cy).setDisplaySize(innerW, chH);
      const mIcSz = chH * 0.7;
      const mLeft = cx - innerW / 2 + 6 * u;
      m.icon.setPosition(mLeft + mIcSz / 2, cy).setDisplaySize(mIcSz, mIcSz);
      m.txt.setPosition(mLeft + mIcSz + 4 * u, cy).setFontSize(14 * s);
    }
  }

  // ---- rendering ----------------------------------------------------------
  private trackColor(t: number): number {
    return instrumentById(this.effInstrument(t))?.color ?? 0x9a8a6a;
  }

  private renderAll(): void {
    for (let t = 0; t < TRACKS; t++) {
      for (let s = 0; s < STEPS; s++) this.renderCell(t, s);
      this.renderLabel(t);
    }
    this.renderFichas();
    this.renderHeader();
    this.renderExpression();
    this.renderBeatEdit();
    this.drawWave();
    this.renderSave();
    this.renderFs();
    this.renderPlayPause();
    this.drawSelRing();
  }

  private renderSave(): void {
    const cost = this.pendingCost();
    this.saveText.setText(cost > 0 ? `${t('save')} (${cost})` : t('save'));
    this.saveImg.setAlpha(cost > 0 ? 1 : 0.55);
  }

  private renderFs(): void {
    this.fsIcon.setTexture(this.webMode() === 'expanded' ? 'ic_exit' : 'ic_fs');
  }

  private renderCell(t: number, s: number): void {
    const img = this.cells[t]?.[s];
    if (!img) return;
    const k = key(t, s);
    const color = this.trackColor(t);
    if (this.draftPlace.has(k)) img.setTint(lighten(color, 0.4)).setAlpha(1);
    else if (this.draftRemove.has(k)) img.setTint(color).setAlpha(0.3);
    else if (this.sharedCells.has(k)) img.setTint(color).setAlpha(1);
    else img.setTint(color).setAlpha(0.16);
  }

  private renderLabel(tr: number): void {
    const label = this.labels[tr];
    const icon = this.labelIcons[tr];
    if (!label || !icon) return;
    const inst = instrumentById(this.effInstrument(tr));
    const sel = this.selectedTrack === tr;
    // The name is hidden in the board (the icon carries it); it shows in the sound picker.
    label.setText(inst ? instrLabel(inst) : t('add'));
    label.setColor(sel ? '#e2574c' : inst ? '#4a3a22' : '#b9a888');
    icon.setTexture(inst ? `ic_${inst.id}` : 'ic_add').setAlpha(inst ? 1 : 0.5);
  }

  private renderFichas(): void {
    const avail = Math.max(0, this.energy - this.pendingCost());
    for (let i = 0; i < this.fichaDots.length; i++) {
      const dot = this.fichaDots[i];
      if (!dot) continue;
      if (i < avail) dot.setFillStyle(0x3fb0ac).setAlpha(1);
      else if (i < this.energy) dot.setFillStyle(0xffd166).setAlpha(1);
      else dot.setFillStyle(0xcdb083).setAlpha(0.4);
    }
    this.fichaText.setText(`${avail}/${MAX_FICHAS}`);
  }

  private renderHeader(): void {
    const m = this.state.meta;
    this.dayText.setText(`${t('keyOf')} ${noteName(m.key)} ${t('minor')}`); // top-left
    this.dateText.setText(m.day); // below the board, right
    this.presenceText.setText(`${Math.max(1, this.presence)} ${t('playingLive')}`);
    this.layoutBpm();
  }

  private renderExpression(): void {
    const k = this.selectedCell;
    if (!k) {
      this.exprLabel.setText(t('editIdle'));
    } else {
      const [tr] = k.split('_').map(Number);
      const inst = instrumentById(this.effInstrument(tr ?? 0));
      // Free while it's still the beat you're placing; once saved, any edit costs a ficha.
      const free = this.draftPlace.has(k);
      this.exprLabel.setText(`${t('editBeat')} · ${inst ? instrLabel(inst) : t('beat')} ${free ? t('newFree') : t('savedCost')}`);
    }
    const active = k ? this.effCellFx(k) : null;
    const onType = active && active.depth > 0 ? active.type : null;
    for (const c of this.fxChips) {
      const lit = onType === c.type;
      const a = active ? (lit ? 1 : 0.45) : 0.35;
      c.icon.setAlpha(a);
      c.txt.setAlpha(a);
    }
    this.drawFxDiv(onType);
  }

  /** The segmented FX button's dividers + a highlight behind the active segment. */
  private drawFxDiv(onType: FxType | null): void {
    const g = this.fxDiv;
    const b = this.fxBox;
    const s = this.s;
    const n = this.fxChips.length;
    g.clear();
    if (!this.fxPill.visible || n === 0) return;
    const segW = b.w / n;
    if (onType) {
      const i = this.fxChips.findIndex((c) => c.type === onType);
      // -1 when the beat carries a retired effect (e.g. tremolo) — just draw no highlight.
      if (i >= 0) g.fillStyle(0xffe6a7, 0.9).fillRoundedRect(b.x + i * segW + 2 * s, b.y + 3 * s, segW - 4 * s, b.h - 6 * s, 8 * s);
    }
    g.lineStyle(2 * s, INK, 0.35);
    for (let i = 1; i < n; i++) {
      g.beginPath();
      g.moveTo(b.x + i * segW, b.y + 6 * s);
      g.lineTo(b.x + i * segW, b.y + b.h - 6 * s);
      g.strokePath();
    }
  }

  /** Draw the current preset's waveform INSIDE the wave button (right of its name). */
  private drawWave(): void {
    const g = this.waveG;
    const b = this.waveBox;
    const u = this.u;
    g.clear();
    if (!g.visible) return; // hidden inline
    // the pill image is the background; the graphics only draws the wave itself
    const yc = b.y + b.h / 2;
    const x0 = this.waveTx.visible ? b.x + 10 * u + this.waveTx.width + 8 * u : b.x + 10 * u;
    const span = b.x + b.w - 10 * u - x0;
    if (span <= 4) return;
    g.lineStyle(1.5 * u, INK, 0.25);
    g.beginPath();
    g.moveTo(x0, yc);
    g.lineTo(x0 + span, yc);
    g.strokePath();
    const k = this.selectedCell;
    if (!k) return;
    const fx = this.effCellFx(k);
    const [t] = k.split('_').map(Number);
    const color = instrumentById(this.effInstrument(t ?? 0))?.color ?? 0x3fb0ac;
    const amp = (b.h / 2 - 8 * u) * 0.92 * fx.depth;
    if (amp <= 0) return; // "sin onda" → just the flat line
    const cycles = 0.5 + fx.rate * 5.5;
    g.lineStyle(3.5 * u, color, 1);
    g.beginPath();
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const x = x0 + (span * i) / N;
      const y = yc - Math.sin((i / N) * cycles * Math.PI * 2) * amp;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  }

  private drawSelRing(): void {
    const g = this.selRing;
    g.clear();
    const k = this.selectedCell;
    if (!k || !this.cellActive(k)) return;
    const [t, s] = k.split('_').map(Number);
    if (t === undefined || s === undefined) return;
    const { left, top, cellW, rowH } = this.gridBox;
    const cx = left + s * cellW + cellW / 2;
    const cy = top + t * rowH + rowH / 2;
    const w = cellW - 1 * this.u;
    const h = rowH - 3 * this.u;
    g.lineStyle(3 * this.u, 0xffffff, 0.95).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6 * this.u);
  }

  private onStepVisual(step: number): void {
    this.curStep = step;
    const { left, top, cellW, rowH } = this.gridBox;
    this.playhead.setPosition(left + step * cellW + cellW / 2, top + (rowH * TRACKS) / 2);
  }

  private flashNoFichas(): void {
    this.toast(t('noFichas'), '#ffd1d1');
  }
  private toast(msg: string, color: string): void {
    this.toastText.setText(msg).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1500, duration: 700 });
  }

  // ---- layout -------------------------------------------------------------
  private layoutBpm(): void {
    const W = this.scale.width;
    const u = this.u;
    const s = this.s;
    this.bpmText.setText(`${this.bpm + this.draftTempo} BPM`).setFontSize(15 * s).setOrigin(0.5);
    const y = 56 * s;
    const half = this.bpmText.width / 2;
    // Play sits at the right end of this row (it used to live in the bottom bar); the
    // [-] BPM [+] group is right-aligned just left of it.
    const ppW = 40 * s;
    const ppCx = W - 12 * u - ppW / 2;
    this.ppImg.setPosition(ppCx, y).setDisplaySize(ppW, 32 * s);
    this.ppIcon.setPosition(ppCx, y).setDisplaySize(20 * s, 20 * s);
    const cx = ppCx - ppW / 2 - 8 * u - 37 * s - half; // 37s clears the [+] button's half + gap
    this.bpmText.setPosition(cx, y);
    this.tempoDown.setPosition(cx - half - 20 * s, y).setDisplaySize(34 * s, 30 * s);
    this.tempoDownT.setPosition(cx - half - 20 * s, y).setFontSize(22 * s);
    this.tempoUp.setPosition(cx + half + 20 * s, y).setDisplaySize(34 * s, 30 * s);
    this.tempoUpT.setPosition(cx + half + 20 * s, y).setFontSize(22 * s);
  }

  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const u = W / 410;
    this.u = u;
    // Height-aware scale: on a wide-but-short inline frame (desktop feed card) plain `u`
    // overflows vertically; `s` caps growth to the available height. The divisor is tuned
    // so short frames still get comfortably-sized chrome (title / buttons / BPM); portrait ≈ u.
    const s = Math.min(u, H / 560);
    this.s = s;
    // Inline (in the feed) = compact preview: no FX chips, taller pads, controls low.
    // Expanded (fullscreen, any device) = the complete studio, like the Android app.
    const compact = this.webMode() !== 'expanded';
    this.cameras.resize(W, H);
    this.bg.setSize(W, H);

    // ---- top band ----
    const titleW = Math.min(168 * s, W * 0.46);
    this.title.setPosition(8 * u, 6 * s).setDisplaySize(titleW, (titleW * 170) / 660);
    this.dayText.setPosition(16 * u, 60 * s).setFontSize(13 * s);
    this.sizePill(this.dayChip, this.dayText, 12 * s, 0, 0.5);
    this.dayChip.setPosition(14 * u, 60 * s);
    const fsSz = 40 * s;
    const fsCx = W - 8 * u - fsSz / 2;
    this.fsImg.setPosition(fsCx, 24 * s).setDisplaySize(fsSz, 32 * s);
    this.fsIcon.setPosition(fsCx, 24 * s).setDisplaySize(24 * s, 24 * s);
    const presRight = fsCx - fsSz / 2 - 8 * u;
    this.presenceText.setPosition(presRight, 24 * s).setFontSize(13 * s);
    this.sizePill(this.presenceChip, this.presenceText, 12 * s, 1, 0.5);
    this.presenceChip.setPosition(presRight + 4 * u, 24 * s);
    this.layoutBpm();
    this.bgZone.setPosition(0, 0).setSize(W, H);

    // ---- bottom controls are anchored to the bottom edge; the grid then FILLS the
    // space above them, so there's never an empty gap regardless of frame height
    // (tall fullscreen or short feed card). ----
    const by = H - 40 * s; // fichas / play / rank / save row (center y)
    const pillH = 34 * s;
    const edRowH = 58 * s; // the ONE editor row — the flat bars keep this height
    const rowY = by - pillH / 2 - 12 * s - edRowH / 2;
    const exprTop = rowY - edRowH / 2 - 16 * s; // label above the row

    // ---- grid: fills from the top band down to just above the expression block
    // (or, when compact, straight down to the bottom bar — no wave/FX inline). ----
    const top = 88 * s;
    const gridAnchor = compact ? by - pillH / 2 : exprTop;
    const gridH = Math.max(gridAnchor - 16 * s - top, 120 * s);
    const rowH = gridH / TRACKS;
    // The board shows ONLY the sound's icon, as big as a beat pad — the name lives in the
    // picker. That also frees a chunk of width for the grid itself.
    const licSz = Math.min(rowH * 0.92, 42 * s);
    const labelW = licSz + 12 * u;
    const left = labelW + 6 * u;
    // The panel's right edge is at W-8u; leave the last pad breathing room instead of letting it
    // touch the frame.
    const cellW = (W - 22 * u - left) / STEPS;
    this.gridBox = { left, top, cellW, rowH };

    this.panel.clear();
    this.panel.fillStyle(this.theme.panel, 0.55).fillRoundedRect(8 * u, top - 12 * s, W - 16 * u, gridH + 24 * s, 16 * s);
    this.panel.lineStyle(3 * s, INK, 0.7).strokeRoundedRect(8 * u, top - 12 * s, W - 16 * u, gridH + 24 * s, 16 * s);

    for (let t = 0; t < TRACKS; t++) {
      for (let sc = 0; sc < STEPS; sc++) {
        this.cells[t]?.[sc]
          ?.setPosition(left + sc * cellW + cellW / 2, top + t * rowH + rowH / 2)
          .setDisplaySize(cellW - 3 * u, rowH - 6 * s);
      }
      const rowCy = top + t * rowH + rowH / 2;
      this.labelIcons[t]?.setPosition(6 * u + licSz / 2, rowCy).setDisplaySize(licSz, licSz);
      this.labels[t]?.setVisible(false); // names only in the picker now
    }
    this.playhead.setSize(cellW, rowH * TRACKS);
    this.onStepVisual(this.curStep);

    // ---- beat editor (expanded only): ONE row, left→right ----
    //   wave options            centre pad              right
    //   [vib|tré|wah] [onda] · [▲vol▼ / ◀tono▶] · [redoble] [↺]
    // Widths are FRACTIONS of the row so the whole thing fits any frame, from a phone to a
    // wide desktop modal; labels appear only where their slot is wide enough for them.
    this.exprLabel.setVisible(!compact).setPosition(14 * u, exprTop).setFontSize(12 * s);
    this.dateText.setPosition(W - 12 * u, top + gridH + 14 * s).setFontSize(11 * s);

    const rowL = 14 * u;
    const rowR = W - 14 * u;
    const gap = 6 * u;
    const barH = edRowH * 0.82; // the flat buttons (FX / onda / redoble / reset)

    // The pad is a rounded button (same crayon shape as the rest) pinned to the EXACT centre of
    // the row; the wave options fill the space to its left, redoble + reset the space to its right.
    const rowMid = (rowL + rowR) / 2;
    const padSz = edRowH; // a rounded square, a touch taller than the flat bars
    this.padCx = rowMid;
    this.padCy = rowY;
    this.padR = padSz / 2;
    this.padRIn = this.padR * 0.42; // the hub, left free for the readout
    const padW = padSz + 4 * s;
    const leftW = rowMid - padW / 2 - gap - rowL;
    const rightL = rowMid + padW / 2 + gap;
    const rightW = rowR - rightL;

    // the row's panel (the pad's own crayon pill draws itself, so no circle frame here)
    this.edPanels.clear().setVisible(!compact);
    if (!compact) {
      const pT = rowY - barH / 2 - 3 * s;
      const pH = barH + 6 * s;
      this.edPanels.fillStyle(this.theme.panel, 0.4).lineStyle(2 * s, INK, 0.28);
      this.edPanels.fillRoundedRect(rowL - 3 * u, pT, rowR - rowL + 6 * u, pH, 10 * s);
      this.edPanels.strokeRoundedRect(rowL - 3 * u, pT, rowR - rowL + 6 * u, pH, 10 * s);
    }

    // ---- left: the wave options (effect type, then preset) ----
    let x = rowL;
    const nFx = Math.max(1, this.fxChips.length);
    const wFx = leftW * 0.56;
    const wWave = leftW - wFx - gap;
    this.fxBox = { x, y: rowY - barH / 2, w: wFx, h: barH };
    this.fxPill.setVisible(!compact).setPosition(x + wFx / 2, rowY).setDisplaySize(wFx, barH);
    this.fxDiv.setVisible(!compact);
    const segW = wFx / nFx;
    const showChipTxt = segW > 78 * s;
    for (let i = 0; i < this.fxChips.length; i++) {
      const c = this.fxChips[i];
      if (!c) continue;
      c.img.setVisible(!compact);
      c.icon.setVisible(!compact);
      c.txt.setVisible(!compact && showChipTxt);
      const cx = x + i * segW + segW / 2;
      c.img.setPosition(cx, rowY).setDisplaySize(segW, barH); // invisible hit-area
      const fxIcSz = edRowH * 0.4;
      if (showChipTxt) {
        const fxLeft = cx - segW / 2 + 9 * u;
        c.icon.setPosition(fxLeft + fxIcSz / 2, rowY).setDisplaySize(fxIcSz, fxIcSz);
        c.txt.setPosition(fxLeft + fxIcSz + 4 * u, rowY).setFontSize(10 * s);
      } else {
        c.icon.setPosition(cx, rowY).setDisplaySize(fxIcSz, fxIcSz);
      }
    }
    x += wFx + gap;

    const waveName = wWave > 118 * s;
    this.waveBox = { x, y: rowY - barH / 2, w: wWave, h: barH };
    this.wavePill.setVisible(!compact).setPosition(x + wWave / 2, rowY).setDisplaySize(wWave, barH);
    this.waveTx.setVisible(!compact && waveName).setPosition(x + 10 * u, rowY).setFontSize(11 * s);
    this.waveG.setVisible(!compact);

    // ---- centre: the vol/tono pad. ▲/▼ = volumen, ◀/▶ = tono around a hub that reads out
    // whichever of the two you moved last. ----
    const off = this.padR * 0.6; // how far the icons sit from the hub
    const padIc = this.padR * 0.5;
    const hub = this.padRIn * 2;
    this.padLong = hub > 56 * s;
    this.padPill.setVisible(!compact).setPosition(rowMid, rowY).setDisplaySize(padSz, padSz);
    this.padG.setVisible(!compact);
    this.padHit.setPosition(rowMid, rowY).setSize(padSz, padSz);
    if (this.padHit.input) this.padHit.input.enabled = !compact;
    this.edVolUpIc.setVisible(!compact).setPosition(rowMid, rowY - off).setDisplaySize(padIc, padIc);
    this.edVolDnIc.setVisible(!compact).setPosition(rowMid, rowY + off).setDisplaySize(padIc, padIc);
    this.edPitchDnIc.setVisible(!compact).setPosition(rowMid - off, rowY).setDisplaySize(padIc, padIc);
    this.edPitchUpIc.setVisible(!compact).setPosition(rowMid + off, rowY).setDisplaySize(padIc, padIc);
    this.edPitchVal.setVisible(!compact).setPosition(rowMid, rowY).setFontSize(Math.min(11 * s, hub * 0.5));

    // ---- right: redoble + reset, centred in what's left ----
    const wSub = Math.min(rightW * 0.55, 100 * s);
    const wRst = Math.min(rightW * 0.4, 52 * s);
    let rx = rightL + (rightW - (wSub + gap + wRst)) / 2;
    const subTxt = wSub > 74 * s;
    this.edSub.setVisible(!compact).setPosition(rx + wSub / 2, rowY).setDisplaySize(wSub, barH);
    const subIcSz = edRowH * 0.5;
    this.edSubIc.setVisible(!compact).setPosition(subTxt ? rx + wSub * 0.36 : rx + wSub / 2, rowY).setDisplaySize(subIcSz, subIcSz);
    this.edSubTx.setVisible(!compact && subTxt).setPosition(rx + wSub * 0.62, rowY).setFontSize(11 * s);
    rx += wSub + gap;

    // reset: tap = flatten this beat's expression, hold = clear the whole draft
    this.resetImg.setVisible(!compact).setPosition(rx + wRst / 2, rowY).setDisplaySize(wRst, barH);
    this.resetText.setVisible(!compact).setPosition(rx + wRst / 2, rowY).setFontSize(Math.min(20 * s, wRst * 0.5));

    // ---- bottom bar: fichas + clock (left); play/pause, ranking, save (right) ----
    const dotGap = 18 * u;
    for (let i = 0; i < this.fichaDots.length; i++) this.fichaDots[i]?.setPosition(14 * u + i * dotGap, by).setScale(s * 0.9);
    this.fichaText.setPosition(14 * u + MAX_FICHAS * dotGap + 2 * u, by).setFontSize(13 * s);
    const clkX = this.fichaText.x + this.fichaText.width + 12 * u;
    this.clockIcon.setPosition(clkX, by).setDisplaySize(16 * s, 16 * s);
    this.fichaSub.setPosition(clkX + 11 * u, by).setFontSize(12 * s);

    const sq = 38 * s;
    const saveW = 116 * s;
    const saveCx = W - 10 * u - saveW / 2;
    this.saveImg.setPosition(saveCx, by).setDisplaySize(saveW, pillH);
    this.saveIcon.setPosition(saveCx - saveW / 2 + 17 * s, by).setDisplaySize(22 * s, 22 * s);
    this.saveText.setPosition(saveCx + 11 * s, by).setFontSize(13 * s);
    const rankCx = saveCx - saveW / 2 - 6 * u - sq / 2;
    this.rankImg.setPosition(rankCx, by).setDisplaySize(sq, pillH);
    this.rankIcon.setPosition(rankCx, by).setDisplaySize(24 * s, 24 * s);
    // play/pause moved up beside the BPM; settings takes its place down here
    const setCx = rankCx - sq / 2 - 6 * u - sq / 2;
    this.setImg.setPosition(setCx, by).setDisplaySize(sq, pillH);
    this.setIcon.setPosition(setCx, by).setDisplaySize(22 * s, 22 * s);

    this.footer.setVisible(!compact).setPosition(W / 2, H - 12 * s).setFontSize(10 * s);
    this.toastText.setPosition(W / 2, top + gridH * 0.4).setFontSize(15 * s);

    if (this.instrMenuOpen) this.layoutMenu();
    this.syncDomButtons();
    this.renderAll();
  }

  private sizePill(img: Phaser.GameObjects.Image, txt: Phaser.GameObjects.Text, padX: number, ox: number, oy: number): void {
    img.setDisplaySize(txt.width + padX * 2, txt.height + padX).setOrigin(ox, oy);
  }

  private shutdown(): void {
    this.fsBtn?.remove();
    this.fsBtn = null;
    this.inlineCatcher?.remove();
    this.inlineCatcher = null;
    this.rankBtn?.remove();
    this.rankBtn = null;
    this.setBtn?.remove();
    this.setBtn = null;
    this.setOverlay?.remove();
    this.setOverlay = null;
    this.rankOverlay?.remove();
    this.rankOverlay = null;
    this.game.canvas.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('scroll', this.syncOnScroll);
    window.removeEventListener('resize', this.syncOnScroll);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.conn) void this.conn.disconnect();
    window.removeEventListener('blur', this.pauseHandler);
    window.removeEventListener('pagehide', this.pauseHandler);
    document.removeEventListener('freeze', this.pauseHandler);
    document.removeEventListener('visibilitychange', this.visHandler);
    try {
      this.audioChan?.close();
    } catch {
      /* ignore */
    }
  }
}
