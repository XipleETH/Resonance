import { Scene } from 'phaser';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // No assets to preload — the game builds its textures procedurally. Go straight in
    // (no blue splash / loading bar).
    this.scene.start('Game');
  }
}
