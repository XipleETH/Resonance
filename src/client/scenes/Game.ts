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
  LIBRARY,
  MAX_FICHAS,
  STEPS,
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

const KRAFT = '#cdb083';
const INK = 0x3a2f22;
const WAVE_FILL = 0xe7d6ac; // wave bar fill — FIXED (not themed) to keep the app's personality
const CRAYON = '"Gochi Hand", "Comic Sans MS", "Marker Felt", "Segoe Print", cursive';

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
const keyText: Record<string, string> = { C: 'DO', D: 'RE', E: 'MI', F: 'FA', G: 'SOL', A: 'LA', B: 'SI' };

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
  private waveG!: Phaser.GameObjects.Graphics;
  private waveZone!: Phaser.GameObjects.Zone;
  private resetImg!: Phaser.GameObjects.Image;
  private resetText!: Phaser.GameObjects.Text;
  private saveImg!: Phaser.GameObjects.Image;
  private saveIcon!: Phaser.GameObjects.Image;
  private saveText!: Phaser.GameObjects.Text;
  private rankImg!: Phaser.GameObjects.Image;
  private rankIcon!: Phaser.GameObjects.Image;
  private clockIcon!: Phaser.GameObjects.Image;
  private dateText!: Phaser.GameObjects.Text;
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
  private gridBox = { left: 0, top: 0, cellW: 10, rowH: 10 };
  private waveBox = { x: 0, y: 0, w: 10, h: 10 };
  private waveDrag: { sx: number; sy: number; d0: number; r0: number; cell: string } | null = null;
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
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'cb_card').setOrigin(0).setTint(this.theme.card);
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
    for (const tgt of FX_TARGETS) {
      const img = this.add.image(0, 0, 'cb_pill').setTint(0xf0e7d0).setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, 0, `ic_fx_${tgt.type}`);
      const txt = this.add.text(0, 0, tgt.label, { fontFamily: CRAYON, fontSize: '12px', color: '#4a3a22' }).setOrigin(0, 0.5);
      img.on('pointerdown', () => this.pickFxTarget(tgt.type));
      this.fxChips.push({ img, icon, txt, type: tgt.type });
    }
    this.waveG = this.add.graphics();
    this.waveZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.waveZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onBarDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onWaveMove(p));
    this.input.on('pointerup', () => {
      this.waveDrag = null;
    });
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
    this.saveText = this.add.text(0, 0, 'GUARDAR', { fontFamily: CRAYON, fontSize: '16px', color: '#fff9ec' }).setOrigin(0.5);
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
    this.clockIcon = this.add.image(0, 0, 'ic_clock');
    this.dateText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '11px', color: '#6b5636' }).setOrigin(1, 0.5);

    this.footer = this.add.text(0, 0, 'nadie montó esto — lo hizo la comunidad', { fontFamily: CRAYON, fontSize: '11px', color: '#8a7a58' }).setOrigin(0.5);
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
    this.waveDrag = null;
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
    this.setupRankingOverlay();
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
        <div class="rk-top"><span class="rk-title">RANKING</span><div class="rk-x" id="rk-close">✕</div></div>
        <div id="rk-body">cargando…</div>
      </div>`;
    document.body.appendChild(ov);
    this.rankOverlay = ov;
    const close = (): void => { ov.style.display = 'none'; };
    ov.querySelector('#rk-close')?.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); // click backdrop to close
  }

  private async openRanking(): Promise<void> {
    const ov = this.rankOverlay;
    if (!ov) return;
    ov.style.display = 'block';
    const body = ov.querySelector('#rk-body');
    if (body) body.textContent = 'cargando…';
    try {
      const [rk, pf] = await Promise.all([
        fetch('/api/jam/rankings').then((r) => r.json() as Promise<RankingsResponse>),
        fetch('/api/jam/profile').then((r) => r.json() as Promise<ProfileResponse>),
      ]);
      if (body) body.innerHTML = this.rankingHtml(rk, pf);
    } catch {
      if (body) body.textContent = 'no se pudo cargar el ranking';
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
      if (!rows.length) return `<div class="rk-sec">${title}</div><div class="rk-most">aún nadie 🙂</div>`;
      const items = rows
        .slice(0, 5)
        .map((e, i) => `<div class="rk-row"><span class="rk-rn">${i + 1}</span>${avatar(e.username, e.avatar)}<span class="rk-nm">${esc(e.username)}</span><span class="rk-vl">${e.value} ${unit}</span></div>`)
        .join('');
      return `<div class="rk-sec">${title}</div>${items}`;
    };
    const favLabel = pf.favInstrument ? (instrumentById(pf.favInstrument)?.label ?? pf.favInstrument) : '—';
    const topLabel = rk.topInstrument ? (instrumentById(rk.topInstrument.id)?.label ?? rk.topInstrument.id) : '—';
    const me = `
      <div class="rk-me">
        ${avatar(pf.username, pf.avatar, true)}
        <div class="rk-stats"><b>${esc(pf.username)}</b><br>
        ${pf.placed} puestos · ${pf.removed} quitados<br>
        racha ${pf.streak} (mejor ${pf.best}) · fav: ${esc(favLabel)}</div>
      </div>`;
    return (
      me +
      `<div class="rk-most">🎛 sonido más usado por todos: <b>${esc(topLabel)}</b></div>` +
      list('más beats puestos', rk.placed, '') +
      list('más beats quitados', rk.removed, '') +
      list('racha más larga', rk.streak, 'días')
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
      if (!woke && this.gate()) this.togglePlayPause();
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
      this.toast('no se pudo abrir pantalla completa', '#ffe0a0');
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
    let raw: string | null = null;
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
      m.txt.setText(inst ? inst.label : '');
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
  private cellOwner(k: string): string {
    return this.draftPlace.has(k) ? this.myUserId : (this.sharedCells.get(k)?.by ?? '');
  }
  private ownsCell(k: string): boolean {
    return this.myUserId !== '' && this.cellOwner(k) === this.myUserId;
  }
  private effCellFx(k: string): TrackFx {
    return this.draftCellFx.get(k) ?? this.sharedCells.get(k)?.fx ?? { ...FLAT_FX };
  }
  private fxKey(fx: TrackFx): string {
    return fx.depth <= 0 ? 'off' : `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}`;
  }

  private pendingCost(): number {
    // Choosing an instrument for an EMPTY row is free (it rides on the first beat's ficha);
    // changing a row that already had an instrument costs 1.
    let instrCost = 0;
    for (const [t] of this.draftInstr) if ((this.instruments[t] ?? '') !== '') instrCost += 1;
    let cost = this.draftPlace.size + instrCost + Math.ceil(Math.abs(this.draftTempo) / 2);
    cost += this.draftRemove.size; // removing a committed beat always costs a ficha (even yours)
    for (const [k, fx] of this.draftCellFx) {
      if (this.draftPlace.has(k)) continue; // fx rides on the place action (free)
      if (this.fxKey(fx) === this.fxKey(this.sharedCells.get(k)?.fx ?? { ...FLAT_FX })) continue;
      cost += this.ownsCell(k) ? 0 : 1;
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

  private onTrackLabel(t: number): void {
    if (!this.gate()) return;
    this.pendingPlaceCell = null; // opening the picker from the label = no bundled beat
    if (this.selectedTrack === t) this.showMenu(!this.instrMenuOpen);
    else {
      this.selectedTrack = t;
      if (this.instrMenuOpen) this.showMenu(false);
    }
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
    if (!k) return this.toast('toca un beat primero', '#ffe0a0');
    const cur = this.effCellFx(k);
    this.setDraftFx(k, { type, depth: cur.depth, rate: cur.rate });
  }

  // ---- wave drag ------------------------------------------------------------
  // The Reddit feed scrolls at the NATIVE layer, above the web view, so free dragging
  // inside the inline post is impossible (the gesture gets stolen mid-drag; every web
  // lever — touch-action, preventDefault, pointer capture — failed on device). So:
  // INLINE → touching the bar jumps straight to expanded mode, where the drag is fluid.
  // EXPANDED → the original free 2-axis drag (Y = strength, X = speed).
  private onBarDown(p: Phaser.Input.Pointer): void {
    if (!this.gate()) return;
    if (this.instrMenuOpen) return;
    const k = this.selectedCell;
    if (!k) return this.toast('toca un beat primero', '#ffe0a0');
    if (this.webMode() !== 'expanded') {
      // Unreachable in practice: inline, the DOM inlineCatcher sits over the canvas and
      // converts taps into expand (canvas taps can't produce the trusted click Devvit needs).
      this.toast('abre pantalla completa para editar la onda', '#ffe0a0');
      return;
    }
    const fx = this.effCellFx(k);
    this.waveDrag = { sx: p.x, sy: p.y, d0: fx.depth, r0: fx.rate, cell: k };
  }
  private onWaveMove(p: Phaser.Input.Pointer): void {
    const wd = this.waveDrag;
    if (!wd) return;
    const depth = Phaser.Math.Clamp(wd.d0 + (wd.sy - p.y) / (this.waveBox.h * 0.8), 0, 1);
    const rate = Phaser.Math.Clamp(wd.r0 + (p.x - wd.sx) / this.waveBox.w, 0, 1);
    const cur = this.effCellFx(wd.cell);
    this.setDraftFx(wd.cell, { type: cur.type === 'none' ? 'vibrato' : cur.type, depth, rate }, true);
  }

  /** Stage a wave change for a cell. Blocks if it would cost more than you have. */
  private setDraftFx(k: string, fx: TrackFx, quiet = false): void {
    if (!this.draftCellFx.has(k) && !this.draftPlace.has(k)) {
      const changed = this.fxKey(fx) !== this.fxKey(this.sharedCells.get(k)?.fx ?? { ...FLAT_FX });
      if (changed && !this.ownsCell(k) && this.pendingCost() + 1 > this.energy) {
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
    if (!k) return this.toast('toca un beat primero', '#ffe0a0');
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
    this.toast('borrador vaciado', '#ffe0a0');
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
        this.toast('¡Enviado! 🎶', '#b6ffb6');
      } else this.toast(data.message ?? 'Error', '#ffd1d1');
    } catch {
      this.toast('Sin conexión (guardado local)', '#ffe0a0');
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
    this.menuDim.setPosition(W / 2, H / 2).setSize(W, H);
    this.menuBackdrop.setPosition(W / 2, H / 2).setSize(W, H);
    const cols = 3;
    const rows = Math.ceil(this.menuChips.length / cols);
    const px = 22 * u;
    const pw = W - 44 * u;
    const chH = 36 * u;
    const ph = 56 * u + rows * (chH + 8 * u);
    const py = (H - ph) / 2;
    this.menuPanel.clear();
    this.menuPanel.fillStyle(0xf1e3bf, 0.98).fillRoundedRect(px, py, pw, ph, 18 * u);
    this.menuPanel.lineStyle(3 * u, INK, 0.85).strokeRoundedRect(px, py, pw, ph, 18 * u);
    const sel = this.selectedTrack;
    this.menuTitle.setText(sel >= 0 ? `sonido para la fila ${sel + 1}` : 'elige un sonido').setPosition(W / 2, py + 24 * u).setFontSize(14 * u);
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
      const cy = py + 48 * u + rowi * (chH + 8 * u) + chH / 2;
      const innerW = cw - 8 * u;
      m.img.setPosition(cx, cy).setDisplaySize(innerW, chH);
      const mIcSz = chH * 0.66;
      const mLeft = cx - innerW / 2 + 7 * u;
      m.icon.setPosition(mLeft + mIcSz / 2, cy).setDisplaySize(mIcSz, mIcSz);
      m.txt.setPosition(mLeft + mIcSz + 4 * u, cy).setFontSize(11 * u);
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
    this.drawWave();
    this.renderSave();
    this.renderFs();
    this.renderPlayPause();
    this.drawSelRing();
  }

  private renderSave(): void {
    const cost = this.pendingCost();
    this.saveText.setText(cost > 0 ? `GUARDAR (${cost})` : 'GUARDAR');
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

  private renderLabel(t: number): void {
    const label = this.labels[t];
    const icon = this.labelIcons[t];
    if (!label || !icon) return;
    const inst = instrumentById(this.effInstrument(t));
    const sel = this.selectedTrack === t;
    label.setText(inst ? inst.label : 'añadir');
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
    this.dayText.setText(`clave de ${keyText[m.key] ?? m.key} menor`); // top-left
    this.dateText.setText(m.day); // below the board, right
    this.presenceText.setText(`${Math.max(1, this.presence)} tocando en vivo`);
    this.layoutBpm();
  }

  private renderExpression(): void {
    const k = this.selectedCell;
    if (!k) {
      this.exprLabel.setText('ONDA — toca un beat');
    } else {
      const [t] = k.split('_').map(Number);
      const inst = instrumentById(this.effInstrument(t ?? 0));
      const free = this.ownsCell(k);
      this.exprLabel.setText(`ONDA · ${inst ? inst.label : 'beat'} ${free ? '(tuyo · gratis)' : '(ajeno · 1 ficha)'}`);
    }
    const active = k ? this.effCellFx(k) : null;
    for (const c of this.fxChips) c.img.setAlpha(active !== null && active.depth > 0 && c.type === active.type ? 1 : 0.5);
  }

  private drawWave(): void {
    const g = this.waveG;
    const b = this.waveBox;
    const u = this.u;
    g.clear();
    g.fillStyle(WAVE_FILL, 0.6).fillRoundedRect(b.x, b.y, b.w, b.h, 10 * u);
    g.lineStyle(2 * u, INK, 0.5).strokeRoundedRect(b.x, b.y, b.w, b.h, 10 * u);
    const yc = b.y + b.h / 2;
    g.lineStyle(1.5 * u, INK, 0.25);
    g.beginPath();
    g.moveTo(b.x + 8 * u, yc);
    g.lineTo(b.x + b.w - 8 * u, yc);
    g.strokePath();
    const k = this.selectedCell;
    if (!k) return;
    const fx = this.effCellFx(k);
    const [t] = k.split('_').map(Number);
    const color = instrumentById(this.effInstrument(t ?? 0))?.color ?? 0x3fb0ac;
    const amp = (b.h / 2 - 6 * u) * 0.92 * fx.depth;
    const cycles = 0.5 + fx.rate * 5.5;
    const x0 = b.x + 8 * u;
    const span = b.w - 16 * u;
    g.lineStyle(3.5 * u, color, 1);
    g.beginPath();
    const N = 64;
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
    this.toast('¡Sin fichas! (vuelven cada 12 h)', '#ffd1d1');
  }
  private toast(msg: string, color: string): void {
    this.toastText.setText(msg).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1500, duration: 700 });
  }

  // ---- layout -------------------------------------------------------------
  private layoutBpm(): void {
    const W = this.scale.width;
    const u = this.u;
    this.bpmText.setText(`${this.bpm + this.draftTempo} BPM`).setFontSize(15 * u).setOrigin(0.5);
    const cx = W - 84 * u;
    const y = 56 * u;
    this.bpmText.setPosition(cx, y);
    const half = this.bpmText.width / 2;
    this.tempoDown.setPosition(cx - half - 20 * u, y).setDisplaySize(34 * u, 30 * u);
    this.tempoDownT.setPosition(cx - half - 20 * u, y).setFontSize(22 * u);
    this.tempoUp.setPosition(cx + half + 20 * u, y).setDisplaySize(34 * u, 30 * u);
    this.tempoUpT.setPosition(cx + half + 20 * u, y).setFontSize(22 * u);
  }

  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const u = W / 410;
    this.u = u;
    this.cameras.resize(W, H);
    this.bg.setSize(W, H);

    const titleW = Math.min(168 * u, W * 0.46);
    this.title.setPosition(8 * u, 6 * u).setDisplaySize(titleW, (titleW * 170) / 660);
    this.dayText.setPosition(16 * u, 60 * u).setFontSize(13 * u);
    this.sizePill(this.dayChip, this.dayText, 12 * u, 0, 0.5);
    this.dayChip.setPosition(14 * u, 60 * u);
    const fsSz = 40 * u;
    const fsCx = W - 8 * u - fsSz / 2;
    this.fsImg.setPosition(fsCx, 24 * u).setDisplaySize(fsSz, 32 * u);
    this.fsIcon.setPosition(fsCx, 24 * u).setDisplaySize(24 * u, 24 * u);
    const presRight = fsCx - fsSz / 2 - 8 * u;
    this.presenceText.setPosition(presRight, 24 * u).setFontSize(13 * u);
    this.sizePill(this.presenceChip, this.presenceText, 12 * u, 1, 0.5);
    this.presenceChip.setPosition(presRight + 4 * u, 24 * u);
    this.layoutBpm();
    this.bgZone.setPosition(0, 0).setSize(W, H);

    const labelW = Phaser.Math.Clamp(W * 0.22, 70 * u, 130 * u);
    const left = labelW + 6 * u;
    const top = 92 * u;
    const gridH = H * 0.4;
    const cellW = (W - 10 * u - left) / STEPS;
    const rowH = gridH / TRACKS;
    this.gridBox = { left, top, cellW, rowH };

    this.panel.clear();
    this.panel.fillStyle(this.theme.panel, 0.55).fillRoundedRect(8 * u, top - 12 * u, W - 16 * u, gridH + 24 * u, 16 * u);
    this.panel.lineStyle(3 * u, INK, 0.7).strokeRoundedRect(8 * u, top - 12 * u, W - 16 * u, gridH + 24 * u, 16 * u);

    for (let t = 0; t < TRACKS; t++) {
      for (let s = 0; s < STEPS; s++) {
        this.cells[t]?.[s]
          ?.setPosition(left + s * cellW + cellW / 2, top + t * rowH + rowH / 2)
          .setDisplaySize(cellW - 3 * u, rowH - 6 * u);
      }
      const rowCy = top + t * rowH + rowH / 2;
      const licSz = Math.min(rowH * 0.72, 20 * u);
      this.labelIcons[t]?.setPosition(10 * u + licSz / 2, rowCy).setDisplaySize(licSz, licSz);
      this.labels[t]?.setPosition(10 * u + licSz + 4 * u, rowCy).setFontSize(Math.min(12 * u, rowH * 0.4));
    }
    this.playhead.setSize(cellW, rowH * TRACKS);
    this.onStepVisual(this.curStep);

    // expression (per-beat wave)
    const chipH = 28 * u;
    const exprTop = top + gridH + 30 * u;
    this.exprLabel.setPosition(14 * u, exprTop).setFontSize(12 * u);
    this.dateText.setPosition(W - 12 * u, top + gridH + 16 * u).setFontSize(11 * u);
    const fxY = exprTop + 22 * u + chipH / 2;
    const chipW = (W - 28 * u - 12 * u) / 3;
    for (let i = 0; i < this.fxChips.length; i++) {
      const c = this.fxChips[i];
      if (!c) continue;
      const cx = 14 * u + (i % 3) * (chipW + 6 * u) + chipW / 2;
      c.img.setPosition(cx, fxY).setDisplaySize(chipW, chipH);
      const fxIcSz = chipH * 0.72;
      const fxLeft = cx - chipW / 2 + 8 * u;
      c.icon.setPosition(fxLeft + fxIcSz / 2, fxY).setDisplaySize(fxIcSz, fxIcSz);
      c.txt.setPosition(fxLeft + fxIcSz + 4 * u, fxY).setFontSize(11 * u);
    }
    // wave bar + reset button beside it
    const rBtn = 40 * u;
    this.waveBox = { x: 14 * u, y: fxY + chipH / 2 + 8 * u, w: W - 28 * u - rBtn - 8 * u, h: 52 * u };
    this.waveZone.setPosition(this.waveBox.x + this.waveBox.w / 2, this.waveBox.y + this.waveBox.h / 2).setSize(this.waveBox.w, this.waveBox.h);
    const rx = this.waveBox.x + this.waveBox.w + 8 * u + rBtn / 2;
    const ry = this.waveBox.y + this.waveBox.h / 2;
    this.resetImg.setPosition(rx, ry).setDisplaySize(rBtn, this.waveBox.h);
    this.resetText.setPosition(rx, ry).setFontSize(20 * u);

    // bottom bar: fichas + 12h clock (left); play/pause, ranking, save (right)
    const by = H - 40 * u;
    const dotGap = 18 * u;
    for (let i = 0; i < this.fichaDots.length; i++) this.fichaDots[i]?.setPosition(14 * u + i * dotGap, by).setScale(u * 0.9);
    this.fichaText.setPosition(14 * u + MAX_FICHAS * dotGap + 2 * u, by).setFontSize(13 * u);
    const clkX = this.fichaText.x + this.fichaText.width + 12 * u;
    this.clockIcon.setPosition(clkX, by).setDisplaySize(16 * u, 16 * u);
    this.fichaSub.setPosition(clkX + 11 * u, by).setFontSize(12 * u);

    const pillH = 34 * u;
    const sq = 38 * u;
    const saveW = 116 * u;
    const saveCx = W - 10 * u - saveW / 2;
    this.saveImg.setPosition(saveCx, by).setDisplaySize(saveW, pillH);
    this.saveIcon.setPosition(saveCx - saveW / 2 + 17 * u, by).setDisplaySize(22 * u, 22 * u);
    this.saveText.setPosition(saveCx + 11 * u, by).setFontSize(13 * u);
    const rankCx = saveCx - saveW / 2 - 6 * u - sq / 2;
    this.rankImg.setPosition(rankCx, by).setDisplaySize(sq, pillH);
    this.rankIcon.setPosition(rankCx, by).setDisplaySize(24 * u, 24 * u);
    const ppBx = rankCx - sq / 2 - 6 * u - sq / 2;
    this.ppImg.setPosition(ppBx, by).setDisplaySize(sq, pillH);
    this.ppIcon.setPosition(ppBx, by).setDisplaySize(20 * u, 20 * u);

    this.footer.setPosition(W / 2, H - 12 * u).setFontSize(10 * u);
    this.toastText.setPosition(W / 2, top + gridH * 0.4).setFontSize(15 * u);

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
