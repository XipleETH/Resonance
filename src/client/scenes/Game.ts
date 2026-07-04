import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { connectRealtime, type Connection } from '@devvit/web/client';
import {
  onStep,
  setActive,
  setBpm,
  setFxs,
  setInstruments,
  setKey,
  start as startTransport,
} from '../audio/jamEngine';
import {
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
  type TrackFx,
} from '../../shared/jam';

const KRAFT = '#cdb083';
const PANEL_FILL = 0xe7d6ac;
const INK = 0x3a2f22;
const CRAYON = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", "Segoe Print", cursive';
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
  const cells: JamState['cells'] = []; // start clean — no notes
  const fx: TrackFx[] = [];
  for (let t = 0; t < TRACKS; t++) fx.push({ ...FLAT_FX });
  return {
    meta: {
      day: 'DÍA 1', key: 'C', scale: 'minor-pentatonic', bpm: 96, bpmMin: 76, bpmMax: 116,
      t0: 0, steps: STEPS, tracks: TRACKS, version: 1, instruments: ['kick', 'hat', 'bass', '', '', ''], fx,
    },
    cells,
  };
}

type WaveDrag = { sx: number; sy: number; d0: number; r0: number; track: number };

export class Game extends Scene {
  private state: JamState = defaultState();
  private sharedActive = new Set<string>();
  private instruments: string[] = [];
  private fx: TrackFx[] = [];
  private bpm = 96;

  private draftPlace = new Set<string>();
  private draftRemove = new Set<string>();
  private draftInstr = new Map<number, string>();
  private draftFx = new Map<number, TrackFx>();
  private draftTempo = 0;
  private selectedTrack = -1;
  private instrMenuOpen = false;

  private energy = MAX_FICHAS;
  private channel = '';
  private presence = 1;
  private conn: Connection | null = null;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  private bg!: Phaser.GameObjects.TileSprite;
  private panel!: Phaser.GameObjects.Graphics;
  private cells: Phaser.GameObjects.Image[][] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private fichaDots: Phaser.GameObjects.Arc[] = [];
  private fxChips: Array<{ img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text; type: FxType }> = [];
  private playhead!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
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
  private saveImg!: Phaser.GameObjects.Image;
  private saveText!: Phaser.GameObjects.Text;
  private footer!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  // instrument dropdown
  private menuDim!: Phaser.GameObjects.Rectangle;
  private menuBackdrop!: Phaser.GameObjects.Zone;
  private menuPanel!: Phaser.GameObjects.Graphics;
  private menuTitle!: Phaser.GameObjects.Text;
  private menuChips: Array<{ img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text; id: string }> = [];

  private curStep = 0;
  private u = 1;
  private gridBox = { left: 0, top: 0, cellW: 10, rowH: 10 };
  private waveBox = { x: 0, y: 0, w: 10, h: 10 };
  private waveDrag: WaveDrag | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    this.ensureTextures();
    this.cameras.main.setBackgroundColor(KRAFT);
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'cb_card').setOrigin(0);
    this.panel = this.add.graphics();

    this.title = this.add.text(0, 0, 'RESONANCE', { fontFamily: CRAYON, fontSize: '30px', color: '#e2574c' }).setAngle(-2);
    this.dayChip = this.add.image(0, 0, 'cb_pill').setTint(0xfbe7c2).setOrigin(0, 0.5);
    this.dayText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#8a6410' }).setOrigin(0, 0.5);
    this.presenceChip = this.add.image(0, 0, 'cb_pill').setTint(0xe7f6ea).setOrigin(1, 0.5);
    this.presenceText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#2f8a4e' }).setOrigin(1, 0.5);

    // BPM control (top-right): – 96 BPM +
    this.tempoDown = this.add.image(0, 0, 'cb_pill').setTint(0xffe08a).setInteractive({ useHandCursor: true });
    this.tempoDown.on('pointerdown', () => this.stageTempo(-1));
    this.tempoDownT = this.add.text(0, 0, '–', { fontFamily: CRAYON, fontSize: '22px', color: '#7a5310' }).setOrigin(0.5);
    this.bpmText = this.add.text(0, 0, '96 BPM', { fontFamily: CRAYON, fontSize: '15px', color: '#6a5320' }).setOrigin(0.5);
    this.tempoUp = this.add.image(0, 0, 'cb_pill').setTint(0xffe08a).setInteractive({ useHandCursor: true });
    this.tempoUp.on('pointerdown', () => this.stageTempo(+1));
    this.tempoUpT = this.add.text(0, 0, '+', { fontFamily: CRAYON, fontSize: '22px', color: '#7a5310' }).setOrigin(0.5);

    this.playhead = this.add.rectangle(0, 0, 10, 10, 0xfff3c9, 0.3);

    for (let t = 0; t < TRACKS; t++) {
      const row: Phaser.GameObjects.Image[] = [];
      for (let s = 0; s < STEPS; s++) {
        const img = this.add.image(0, 0, 'cb_pad').setAngle(Phaser.Math.Between(-3, 3)).setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.toggleCell(t, s));
        row.push(img);
      }
      this.cells.push(row);
      const label = this.add
        .text(0, 0, '', { fontFamily: CRAYON, fontSize: '13px', color: '#4a3a22' })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerdown', () => this.onTrackLabel(t));
      this.labels.push(label);
    }

    // fichas (bottom-left)
    for (let i = 0; i < MAX_FICHAS; i++) this.fichaDots.push(this.add.circle(0, 0, 8, 0x3fb0ac).setStrokeStyle(2.5, INK));
    this.fichaText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '14px', color: '#4a3a22' }).setOrigin(0, 0.5);
    this.fichaSub = this.add.text(0, 0, '↻ cada 12 h', { fontFamily: CRAYON, fontSize: '11px', color: '#a9691f' }).setOrigin(0, 0.5);

    // expression wave
    this.exprLabel = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '12px', color: '#7a6a4a' });
    for (const tgt of FX_TARGETS) {
      const img = this.add.image(0, 0, 'cb_pill').setTint(0xf0e7d0).setInteractive({ useHandCursor: true });
      const txt = this.add.text(0, 0, `${tgt.emoji} ${tgt.label}`, { fontFamily: CRAYON, fontSize: '12px', color: '#4a3a22' }).setOrigin(0.5);
      img.on('pointerdown', () => this.pickFxTarget(tgt.type));
      this.fxChips.push({ img, txt, type: tgt.type });
    }
    this.waveG = this.add.graphics();
    this.waveZone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.waveZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.startWaveDrag(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onWaveMove(p));
    this.input.on('pointerup', () => {
      this.waveDrag = null;
    });

    // save (bottom-right, small)
    this.saveImg = this.add.image(0, 0, 'cb_pill').setTint(0x3fb0ac).setInteractive({ useHandCursor: true });
    this.saveImg.on('pointerdown', () => void this.commit());
    this.saveText = this.add.text(0, 0, 'GUARDAR', { fontFamily: CRAYON, fontSize: '16px', color: '#fff9ec' }).setOrigin(0.5);

    this.footer = this.add.text(0, 0, 'nadie montó esto — lo hizo la comunidad ✏️', { fontFamily: CRAYON, fontSize: '11px', color: '#8a7a58' }).setOrigin(0.5);
    this.toastText = this.add.text(0, 0, '', { fontFamily: CRAYON, fontSize: '15px', color: '#ffd1d1' }).setOrigin(0.5).setAlpha(0);

    // instrument dropdown (overlay)
    this.menuDim = this.add.rectangle(0, 0, 10, 10, 0x201a12, 0.5).setOrigin(0.5).setDepth(50);
    this.menuBackdrop = this.add.zone(0, 0, 10, 10).setOrigin(0.5).setDepth(50).setInteractive();
    this.menuBackdrop.on('pointerdown', () => {
      this.showMenu(false);
      this.renderAll();
    });
    this.menuPanel = this.add.graphics().setDepth(51);
    this.menuTitle = this.add.text(0, 0, 'elige un sonido', { fontFamily: CRAYON, fontSize: '15px', color: '#4a3a22' }).setOrigin(0.5).setDepth(52);
    for (const inst of LIBRARY) {
      const img = this.add.image(0, 0, 'cb_pill').setTint(lighten(inst.color, 0.35)).setDepth(52);
      const txt = this.add.text(0, 0, `${inst.emoji} ${inst.label}`, { fontFamily: CRAYON, fontSize: '12px', color: '#3a2f22' }).setOrigin(0.5).setDepth(53);
      img.on('pointerdown', () => this.pickInstrument(inst.id));
      this.menuChips.push({ img, txt, id: inst.id });
    }
    this.showMenu(false);

    onStep((step) => this.onStepVisual(step));
    this.layout();
    this.scale.on('resize', () => this.layout());
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
      this.applyServerState(data.state);
      this.energy = data.energy;
      this.channel = data.channel;
      this.subscribe();
      this.startHeartbeat();
    } catch {
      this.applyServerState(this.state);
    }
    setKey(this.state.meta.key);
    this.refreshEngine();
    startTransport();
    this.renderAll();
  }

  private applyServerState(state: JamState): void {
    this.state = state;
    this.instruments = state.meta.instruments.slice(0, TRACKS);
    while (this.instruments.length < TRACKS) this.instruments.push('');
    this.fx = state.meta.fx.slice(0, TRACKS);
    while (this.fx.length < TRACKS) this.fx.push({ ...FLAT_FX });
    this.bpm = state.meta.bpm;
    this.sharedActive = new Set(state.cells.map((c) => key(c.track, c.step)));
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
    if (d.kind === 'place') this.sharedActive.add(key(d.track, d.step));
    else if (d.kind === 'remove') this.sharedActive.delete(key(d.track, d.step));
    else if (d.kind === 'setInstrument') {
      if (d.track >= 0 && d.track < TRACKS) this.instruments[d.track] = d.instrument;
    } else if (d.kind === 'fx') {
      if (d.track >= 0 && d.track < TRACKS) this.fx[d.track] = d.fx;
    } else if (d.kind === 'tempo') this.bpm = d.bpm;
    else if (d.kind === 'presence') this.presence = d.count;
    this.refreshEngine();
    this.renderAll();
  }

  // ---- editing ------------------------------------------------------------
  private effInstrument(t: number): string {
    return this.draftInstr.get(t) ?? this.instruments[t] ?? '';
  }
  private effFx(t: number): TrackFx {
    return this.draftFx.get(t) ?? this.fx[t] ?? { ...FLAT_FX };
  }
  private sharedFx(t: number): TrackFx {
    return this.fx[t] ?? { ...FLAT_FX };
  }
  private fxKey(fx: TrackFx): string {
    return fx.depth <= 0 ? 'off' : `${fx.type}:${Math.round(fx.depth * 100)}:${Math.round(fx.rate * 100)}`;
  }
  private fxChanges(): number {
    let n = 0;
    for (const [t, fx] of this.draftFx) if (this.fxKey(fx) !== this.fxKey(this.sharedFx(t))) n++;
    return n;
  }
  private tempoCost(): number {
    return Math.ceil(Math.abs(this.draftTempo) / 2); // 1 ficha per 2 BPM
  }
  private pendingCost(): number {
    return this.draftPlace.size + this.draftRemove.size + this.draftInstr.size + this.fxChanges() + this.tempoCost();
  }
  private canStageMore(): boolean {
    return this.pendingCost() < this.energy;
  }

  private toggleCell(t: number, s: number): void {
    if (this.instrMenuOpen) return;
    const k = key(t, s);
    if (this.draftPlace.has(k)) this.draftPlace.delete(k);
    else if (this.draftRemove.has(k)) this.draftRemove.delete(k);
    else if (this.sharedActive.has(k)) {
      if (!this.canStageMore()) return this.flashNoFichas();
      this.draftRemove.add(k);
    } else {
      if (this.effInstrument(t) === '') {
        this.selectedTrack = t;
        this.showMenu(true);
        this.renderAll();
        return;
      }
      if (!this.canStageMore()) return this.flashNoFichas();
      this.draftPlace.add(k);
    }
    this.refreshEngine();
    this.renderAll();
  }

  /** 1st tap selects the track; tapping the already-selected track opens the instrument menu. */
  private onTrackLabel(t: number): void {
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
    const alreadyStaged = this.draftInstr.has(t);
    if (!alreadyStaged && id !== this.instruments[t] && !this.canStageMore()) {
      this.flashNoFichas();
      return;
    }
    if (id === this.instruments[t]) this.draftInstr.delete(t);
    else this.draftInstr.set(t, id);
    this.showMenu(false);
    this.refreshEngine();
    this.renderAll();
  }

  private pickFxTarget(type: FxType): void {
    if (this.selectedTrack < 0) return this.toast('toca una pista primero 👆', '#ffe0a0');
    const t = this.selectedTrack;
    const cur = this.effFx(t);
    this.draftFx.set(t, { type, depth: cur.depth, rate: cur.rate });
    this.refreshEngine();
    this.renderAll();
  }

  private startWaveDrag(p: Phaser.Input.Pointer): void {
    if (this.instrMenuOpen) return;
    if (this.selectedTrack < 0) return this.toast('toca una pista primero 👆', '#ffe0a0');
    const fx = this.effFx(this.selectedTrack);
    this.waveDrag = { sx: p.x, sy: p.y, d0: fx.depth, r0: fx.rate, track: this.selectedTrack };
  }
  private onWaveMove(p: Phaser.Input.Pointer): void {
    const wd = this.waveDrag;
    if (!wd) return;
    const depth = Phaser.Math.Clamp(wd.d0 + (wd.sy - p.y) / (this.waveBox.h * 0.8), 0, 1);
    const rate = Phaser.Math.Clamp(wd.r0 + (p.x - wd.sx) / this.waveBox.w, 0, 1);
    const cur = this.effFx(wd.track);
    this.draftFx.set(wd.track, { type: cur.type === 'none' ? 'vibrato' : cur.type, depth, rate });
    this.refreshEngine();
    this.renderExpression();
    this.renderFichas();
    this.renderSave();
    this.drawWave();
  }

  private stageTempo(delta: number): void {
    const next = Phaser.Math.Clamp(this.bpm + this.draftTempo + delta, this.state.meta.bpmMin, this.state.meta.bpmMax);
    const nd = next - this.bpm;
    if (nd === this.draftTempo) return; // hit the range limit — nothing changed
    const others = this.draftPlace.size + this.draftRemove.size + this.draftInstr.size + this.fxChanges();
    if (others + Math.ceil(Math.abs(nd) / 2) > this.energy) return this.flashNoFichas();
    this.draftTempo = nd;
    this.refreshEngine();
    this.renderAll();
  }

  private refreshEngine(): void {
    const merged = new Set(this.sharedActive);
    for (const k of this.draftRemove) merged.delete(k);
    for (const k of this.draftPlace) merged.add(k);
    setActive(merged);
    const eff: string[] = [];
    const effFx: TrackFx[] = [];
    for (let t = 0; t < TRACKS; t++) {
      eff.push(this.effInstrument(t));
      effFx.push(this.effFx(t));
    }
    setInstruments(eff);
    setFxs(effFx);
    setBpm(this.bpm + this.draftTempo);
  }

  private async commit(): Promise<void> {
    const actions: JamAction[] = [];
    for (const k of this.draftPlace) {
      const [t, s] = k.split('_').map(Number);
      actions.push({ kind: 'place', track: t ?? 0, step: s ?? 0 });
    }
    for (const k of this.draftRemove) {
      const [t, s] = k.split('_').map(Number);
      actions.push({ kind: 'remove', track: t ?? 0, step: s ?? 0 });
    }
    for (const [t, id] of this.draftInstr) actions.push({ kind: 'setInstrument', track: t, instrument: id });
    for (const [t, fx] of this.draftFx) if (this.fxKey(fx) !== this.fxKey(this.sharedFx(t))) actions.push({ kind: 'setFx', track: t, fx });
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
    for (const k of this.draftPlace) this.sharedActive.add(k);
    for (const k of this.draftRemove) this.sharedActive.delete(k);
    for (const [t, id] of this.draftInstr) this.instruments[t] = id;
    for (const [t, fx] of this.draftFx) this.fx[t] = fx;
    this.bpm += this.draftTempo;
    this.energy = Math.max(0, this.energy - cost);
    this.draftPlace.clear();
    this.draftRemove.clear();
    this.draftInstr.clear();
    this.draftFx.clear();
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
      m.img.setVisible(open);
      m.txt.setVisible(open);
      if (open) m.img.setInteractive({ useHandCursor: true });
      else m.img.disableInteractive();
    }
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
    const chH = 38 * u;
    const ph = 58 * u + rows * (chH + 8 * u);
    const py = (H - ph) / 2;
    this.menuPanel.clear();
    this.menuPanel.fillStyle(0xf1e3bf, 0.98).fillRoundedRect(px, py, pw, ph, 18 * u);
    this.menuPanel.lineStyle(3 * u, INK, 0.85).strokeRoundedRect(px, py, pw, ph, 18 * u);
    const sel = this.selectedTrack;
    this.menuTitle.setText(sel >= 0 ? `elige un sonido para la pista ${sel + 1}` : 'elige un sonido').setPosition(W / 2, py + 24 * u).setFontSize(14 * u);
    const cw = (pw - 24 * u) / cols;
    for (let i = 0; i < this.menuChips.length; i++) {
      const m = this.menuChips[i];
      if (!m) continue;
      const col = i % cols;
      const rowi = Math.floor(i / cols);
      const cx = px + 12 * u + col * cw + cw / 2;
      const cy = py + 48 * u + rowi * (chH + 8 * u) + chH / 2;
      m.img.setPosition(cx, cy).setDisplaySize(cw - 8 * u, chH);
      m.txt.setPosition(cx, cy).setFontSize(12 * u);
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
  }

  private renderSave(): void {
    const cost = this.pendingCost();
    this.saveText.setText(cost > 0 ? `GUARDAR (${cost})` : 'GUARDAR');
    this.saveImg.setAlpha(cost > 0 ? 1 : 0.55);
  }

  private renderCell(t: number, s: number): void {
    const img = this.cells[t]?.[s];
    if (!img) return;
    const k = key(t, s);
    const shared = this.sharedActive.has(k);
    const dP = this.draftPlace.has(k);
    const dR = this.draftRemove.has(k);
    const color = this.trackColor(t);
    if (dP) img.setTint(lighten(color, 0.4)).setAlpha(1);
    else if (dR) img.setTint(color).setAlpha(0.35);
    else if (shared) img.setTint(color).setAlpha(1);
    else img.setTint(color).setAlpha(0.16);
  }

  private renderLabel(t: number): void {
    const label = this.labels[t];
    if (!label) return;
    const inst = instrumentById(this.effInstrument(t));
    const sel = this.selectedTrack === t;
    label.setText(inst ? `${inst.emoji} ${inst.label}` : '＋ añadir');
    label.setColor(sel ? '#e2574c' : inst ? '#4a3a22' : '#b9a888');
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
    this.dayText.setText(`✦ ${m.day} · clave ${keyText[m.key] ?? m.key} menor`);
    this.presenceText.setText(`● ${Math.max(1, this.presence)} tocando en vivo`);
    this.layoutBpm();
  }

  private renderExpression(): void {
    const sel = this.selectedTrack;
    const inst = sel >= 0 ? instrumentById(this.effInstrument(sel)) : undefined;
    this.exprLabel.setText(sel < 0 ? '🎚️ EXPRESIÓN — toca una pista' : `🎚️ EXPRESIÓN · ${inst ? inst.label : 'pista ' + (sel + 1)}`);
    const active = sel >= 0 ? this.effFx(sel) : null;
    for (const c of this.fxChips) c.img.setAlpha(active !== null && active.depth > 0 && c.type === active.type ? 1 : 0.5);
  }

  private drawWave(): void {
    const g = this.waveG;
    const b = this.waveBox;
    const u = this.u;
    g.clear();
    g.fillStyle(PANEL_FILL, 0.5).fillRoundedRect(b.x, b.y, b.w, b.h, 10 * u);
    g.lineStyle(2 * u, INK, 0.5).strokeRoundedRect(b.x, b.y, b.w, b.h, 10 * u);
    const yc = b.y + b.h / 2;
    g.lineStyle(1.5 * u, INK, 0.25);
    g.beginPath();
    g.moveTo(b.x + 8 * u, yc);
    g.lineTo(b.x + b.w - 8 * u, yc);
    g.strokePath();
    if (this.selectedTrack < 0) return;
    const fx = this.effFx(this.selectedTrack);
    const color = instrumentById(this.effInstrument(this.selectedTrack))?.color ?? 0x3fb0ac;
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

    this.title.setPosition(14 * u, 12 * u).setFontSize(30 * u);
    this.dayText.setPosition(16 * u, 60 * u).setFontSize(13 * u);
    this.sizePill(this.dayChip, this.dayText, 12 * u, 0, 0.5);
    this.dayChip.setPosition(14 * u, 60 * u);
    this.presenceText.setPosition(W - 16 * u, 24 * u).setFontSize(13 * u);
    this.sizePill(this.presenceChip, this.presenceText, 12 * u, 1, 0.5);
    this.presenceChip.setPosition(W - 12 * u, 24 * u);
    this.layoutBpm();

    const labelW = Phaser.Math.Clamp(W * 0.22, 70 * u, 130 * u);
    const left = labelW + 6 * u;
    const top = 96 * u;
    const gridH = H * 0.4;
    const cellW = (W - 10 * u - left) / STEPS;
    const rowH = gridH / TRACKS;
    this.gridBox = { left, top, cellW, rowH };

    this.panel.clear();
    this.panel.fillStyle(PANEL_FILL, 0.5).fillRoundedRect(8 * u, top - 12 * u, W - 16 * u, gridH + 24 * u, 16 * u);
    this.panel.lineStyle(3 * u, INK, 0.7).strokeRoundedRect(8 * u, top - 12 * u, W - 16 * u, gridH + 24 * u, 16 * u);

    for (let t = 0; t < TRACKS; t++) {
      for (let s = 0; s < STEPS; s++) {
        this.cells[t]?.[s]
          ?.setPosition(left + s * cellW + cellW / 2, top + t * rowH + rowH / 2)
          .setDisplaySize(cellW - 3 * u, rowH - 6 * u);
      }
      this.labels[t]?.setPosition(12 * u, top + t * rowH + rowH / 2).setFontSize(Math.min(14 * u, rowH * 0.42));
    }
    this.playhead.setSize(cellW, rowH * TRACKS);
    this.onStepVisual(this.curStep);

    // expression
    const chipH = 28 * u;
    const exprTop = top + gridH + 30 * u;
    this.exprLabel.setPosition(14 * u, exprTop).setFontSize(12 * u);
    const fxY = exprTop + 22 * u + chipH / 2;
    const chipW = (W - 28 * u - 12 * u) / 3;
    for (let i = 0; i < this.fxChips.length; i++) {
      const c = this.fxChips[i];
      if (!c) continue;
      const cx = 14 * u + (i % 3) * (chipW + 6 * u) + chipW / 2;
      c.img.setPosition(cx, fxY).setDisplaySize(chipW, chipH);
      c.txt.setPosition(cx, fxY).setFontSize(12 * u);
    }
    this.waveBox = { x: 14 * u, y: fxY + chipH / 2 + 8 * u, w: W - 28 * u, h: 52 * u };
    this.waveZone.setPosition(this.waveBox.x + this.waveBox.w / 2, this.waveBox.y + this.waveBox.h / 2).setSize(this.waveBox.w, this.waveBox.h);

    // bottom: fichas (left) + GUARDAR (right)
    const by = H - 40 * u;
    const dotGap = 22 * u;
    for (let i = 0; i < this.fichaDots.length; i++) this.fichaDots[i]?.setPosition(16 * u + i * dotGap, by).setScale(u);
    this.fichaText.setPosition(16 * u + MAX_FICHAS * dotGap + 4 * u, by).setFontSize(14 * u);
    this.fichaSub.setPosition(this.fichaText.x + this.fichaText.width + 10 * u, by).setFontSize(11 * u);

    const saveW = Math.min(190 * u, W * 0.44);
    const saveCx = W - 12 * u - saveW / 2;
    this.saveImg.setPosition(saveCx, by).setDisplaySize(saveW, 42 * u);
    this.saveText.setPosition(saveCx, by).setFontSize(16 * u);

    this.footer.setPosition(W / 2, H - 12 * u).setFontSize(11 * u);
    this.toastText.setPosition(W / 2, top + gridH * 0.4).setFontSize(15 * u);

    if (this.instrMenuOpen) this.layoutMenu();
    this.renderAll();
  }

  private sizePill(img: Phaser.GameObjects.Image, txt: Phaser.GameObjects.Text, padX: number, ox: number, oy: number): void {
    img.setDisplaySize(txt.width + padX * 2, txt.height + padX).setOrigin(ox, oy);
  }

  private shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.conn) void this.conn.disconnect();
  }
}
