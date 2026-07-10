import { Boot } from './scenes/Boot';
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
// Read the CONTAINER (not window): the Devvit expanded modal — especially "Mobile" mode on a
// desktop browser — doesn't always match window.inner*, and window `resize` doesn't fire when
// the modal settles from its initial size to its final (tall) size. Sizing to the container +
// a ResizeObserver keeps the game aspect == the modal aspect, so FIT fills it (no black bars).
const host = (): HTMLElement | null => document.getElementById('game-container');
const cssW = (): number => Math.max(1, host()?.clientWidth || window.innerWidth || 1);
const cssH = (): number => Math.max(1, host()?.clientHeight || window.innerHeight || 1);
const gameW = (): number => Math.round(cssW() * dpr);
const gameH = (): number => Math.round(cssH() * dpr);

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
    // NONE: we drive the size ourselves. FIT's dynamic-resize display calc goes stale in the
    // Devvit modal (backing updates but the CSS keeps the old aspect → black letterbox bars),
    // so instead we set the backing to container×DPR and force the canvas CSS to fill the
    // container. Backing aspect == container aspect, so the fill is uniform (no distortion) + sharp.
    mode: Phaser.Scale.NONE,
    width: gameW(),
    height: gameH(),
  },
  scene: [Boot, MainGame],
};

const StartGame = (parent: string) => {
  const game = new Game({ ...config, parent });
  const fillCss = (): void => {
    const cv = game.canvas;
    if (!cv) return;
    cv.style.width = cssW() + 'px'; // stretch the (correct-aspect) backing to fill the container
    cv.style.height = cssH() + 'px';
    cv.style.margin = '0';
  };
  const doResize = (): void => {
    game.scale.resize(gameW(), gameH()); // backing = container × DPR
    fillCss();
  };
  fillCss();
  // window `resize` alone misses the Devvit modal settling into its final size, so also watch
  // the container element directly + poll each frame (cheap: only resizes when the size changes).
  window.addEventListener('resize', doResize);
  window.addEventListener('orientationchange', doResize);
  const c = host();
  if (c && typeof ResizeObserver !== 'undefined') new ResizeObserver(doResize).observe(c);
  let lastW = gameW();
  let lastH = gameH();
  const tick = (): void => {
    const w = gameW();
    const h = gameH();
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      doResize();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return game;
};

// Don't boot Phaser into a 0-size canvas (it skips create() → black screen); wait for the
// container to have a real size first (with a cap so a stuck layout never hangs the boot).
const waitForSize = (): Promise<void> =>
  new Promise((resolve) => {
    let tries = 0;
    const check = (): void => {
      const c = host();
      if ((c && c.clientWidth > 0 && c.clientHeight > 0) || tries++ > 90) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });

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
  await waitForSize();
  StartGame('game-container');
};

document.addEventListener('DOMContentLoaded', () => void withFont());
