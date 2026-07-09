import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
// Phaser does NOT render at devicePixelRatio on its own (it only detects it), so on
// high-density phones the canvas is upscaled and looks blurry. Fix: make the backing
// buffer match device pixels (size = CSS px × DPR) and let FIT scale it to the viewport.
// The scene lays out proportionally (u = width/410) so it looks identical, just sharp.
// Floor at 2× so it also supersamples on desktop (where devicePixelRatio is usually 1 but
// the Devvit webview gets scaled up) — that's what was making the text/icons look blurry.
const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
// Responsive: fill whatever the web view gives us (feed card, fullscreen, desktop). The
// scene lays out proportionally (u = width/410) so it adapts to any size. Backing buffer =
// CSS px × DPR so it stays sharp on high-density screens; FIT scales it to the container.
const gameW = (): number => Math.round(window.innerWidth * dpr);
const gameH = (): number => Math.round(window.innerHeight * dpr);

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#cdb083',
  // Tone.js owns the single AudioContext; stop Phaser from creating its own.
  audio: { noAudio: true },
  // Don't let Phaser listen for touches on `window`. Inline, the DOM catcher sits over the
  // canvas; a DRAG produces no `click` (so it just scrolls) but its touchstart still bubbles
  // to window — and Phaser's window listener would process it against the grid, selecting a
  // beat without expanding. Canvas-only listeners keep taps→expand and drags→scroll clean.
  input: { windowEvents: false },
  render: { antialias: true, roundPixels: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: gameW(),
    height: gameH(),
  },
  scene: [Boot, MainGame, GameOver],
};

const StartGame = (parent: string) => {
  const game = new Game({ ...config, parent });
  // Re-render at device resolution when the viewport changes (rotation, resize).
  window.addEventListener('resize', () => game.scale.resize(gameW(), gameH()));
  return game;
};

// Wait for the bundled crayon font so Phaser's first text render uses it (Phaser measures
// text at create time and won't reflow later). Cap the wait so a font failure never hangs.
const withFont = async (): Promise<void> => {
  try {
    const load = document.fonts.load('16px "Gochi Hand"').then(() => document.fonts.ready);
    const cap = new Promise((r) => setTimeout(r, 1500));
    await Promise.race([load, cap]);
  } catch {
    /* fall back to the CSS stack */
  }
  StartGame('game-container');
};

document.addEventListener('DOMContentLoaded', () => void withFont());
