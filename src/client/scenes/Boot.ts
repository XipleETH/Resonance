import { Scene } from 'phaser';
import { loadIcons } from '../icons';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    // Rasterize the hand-drawn crayon icons into textures, then go straight into the game
    // (no blue splash / loading bar — the rest of the textures + grid are built procedurally).
    await loadIcons(this);
    this.scene.start('Game');
  }
}
