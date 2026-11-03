import Phaser from 'phaser';
import { breachGame } from './breach';
import { BREACH_CONFIG as C } from './breachConfig';
import { stoneNoise } from './stoneNoise';

/** Сцена только отображает состояние; правила попытки находятся в PreInfinityGame. */
export class BreachScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private pickSprite!: Phaser.GameObjects.Image;
  private readonly noiseCache = new Map<string, number>();
  private previousPosition = { x: 0, y: 0, block: -1 };
  private previousBeam: { x: number; y: number } | null = null;
  private simulationTime = performance.now();
  private simulationDuration = 0.1;

  constructor() { super('BreachScene'); }

  preload(): void { this.load.svg('flint-pickaxe', `${import.meta.env.BASE_URL}assets/flint-pickaxe.svg`, { width: 64, height: 64 }); }

  create(): void {
    this.graphics = this.add.graphics();
    this.pickSprite = this.add.image(0, 0, 'flint-pickaxe').setOrigin(0.15, 0.85).setVisible(false);
    this.input.on('pointerdown', () => breachGame.click());
    this.resetInterpolation();
  }

  beforeSimulation(): void {
    const s = breachGame.state;
    this.previousPosition = { x: s.x, y: s.y, block: s.block };
    this.previousBeam = breachGame.weapons.beamPosition();
  }

  afterSimulation(dt: number): void {
    this.simulationDuration = Math.min(0.1, Math.max(0.001, dt));
    this.simulationTime = performance.now();
    if (this.previousPosition.block !== breachGame.state.block) this.resetInterpolation();
  }

  resetInterpolation(): void {
    this.beforeSimulation();
    this.simulationTime = performance.now();
  }

  update(): void {
    const s = breachGame.state;
    const g = this.graphics;
    const width = this.scale.width;
    const height = this.scale.height;
    const effect = breachGame.resetEffect;
    const visualOffset = s.paused ? 0 : Math.min(this.simulationDuration, Math.max(0, (performance.now() - this.simulationTime) / 1000));
    const alpha = visualOffset / this.simulationDuration;
    const visualX = this.previousPosition.block === s.block ? this.previousPosition.x + (s.x - this.previousPosition.x) * alpha : s.x;
    const visualY = this.previousPosition.block === s.block ? this.previousPosition.y + (s.y - this.previousPosition.y) * alpha : s.y;
    const size = effect?.size ?? s.size;
    const tile = Math.min((width - 70) / size, (height - 110) / (size + 1));
    const left = (width - tile * size) / 2;
    const top = (height - tile * size) / 2;
    const px = (x: number) => left + (x + 0.5) * tile;
    const py = (y: number) => top + (y + 0.5) * tile;

    g.clear();
    g.fillStyle(0x142736, 1);
    g.fillRect(left, top, tile * size, tile * size);
    const progress = effect ? Math.min(1, (effect.elapsed + visualOffset) / C.resetAnimationSeconds) : 0;
    const waveRadius = progress * size * 1.5;
    let stones = breachGame.currentStones();
    if (effect) {
      const old = new Map(effect.stones.map(stone => [`${stone.x}:${stone.y}`, stone]));
      stones = breachGame.currentStones().filter(stone => stone.x < size && stone.y < size).flatMap(stone => {
        const restored = Math.hypot(stone.x - effect.x, stone.y - effect.y) <= waveRadius;
        const visible = restored ? stone : old.get(`${stone.x}:${stone.y}`);
        return visible ? [visible] : [];
      });
    }
    for (const stone of stones) {
      const color = stone.kind === 'hard' ? 0x8d758e : stone.kind === 'elemental' ? 0x51a3a0 : 0x6e7b86;
      g.fillStyle(color, 1);
      g.fillRect(left + stone.x * tile, top + stone.y * tile, tile + 0.5, tile + 0.5);
      const noiseKey = `${stone.block}:${stone.x}:${stone.y}`;
      let noise = this.noiseCache.get(noiseKey);
      if (noise === undefined) {
        noise = stoneNoise(stone.x / 4.2, stone.y / 4.2, stone.block) + 0.35 * stoneNoise(stone.x / 1.8, stone.y / 1.8, stone.block + 91);
        this.noiseCache.set(noiseKey, noise);
      }
      g.fillStyle(noise >= 0 ? 0xf4e1ba : 0x172738, Math.min(0.3, Math.abs(noise) * 0.55));
      g.fillRect(left + stone.x * tile, top + stone.y * tile, tile + 0.5, tile + 0.5);
      // Пятна придают породе фактуру, не рисуя рамки отдельных клеток.
      const variation = (stone.x * 17 + stone.y * 31 + stone.block * 7) % 7;
      if (variation < 3) {
        g.fillStyle(variation === 0 ? 0xffffff : 0x17232b, 0.07);
        g.fillCircle(px(stone.x) + tile * 0.16, py(stone.y) - tile * 0.1, tile * 0.18);
      }
      if (stone.hp < stone.maxHp) {
        const stage = Math.min(5, Math.ceil((1 - Math.max(0, stone.hp / stone.maxHp)) * 5));
        const x = left + stone.x * tile, y = top + stone.y * tile;
        g.lineStyle(Math.max(1, tile * 0.055), 0x26323b, 0.9);
        g.lineBetween(x + tile * 0.46, y + tile * 0.22, x + tile * 0.53, y + tile * 0.5);
        if (stage >= 2) g.lineBetween(x + tile * 0.53, y + tile * 0.5, x + tile * 0.34, y + tile * 0.75);
        if (stage >= 3) g.lineBetween(x + tile * 0.53, y + tile * 0.5, x + tile * 0.78, y + tile * 0.65);
        if (stage >= 4) g.lineBetween(x + tile * 0.46, y + tile * 0.35, x + tile * 0.2, y + tile * 0.3);
        if (stage >= 5) {
          g.lineBetween(x + tile * 0.53, y + tile * 0.5, x + tile * 0.68, y + tile * 0.19);
          g.lineBetween(x + tile * 0.34, y + tile * 0.75, x + tile * 0.17, y + tile * 0.64);
        }
      }
    }

    if (s.target && !effect) {
      g.lineStyle(1, 0xf8cf82, 0.75);
      g.strokeCircle(px(s.target.x), py(s.target.y), tile * 0.38);
    }

    // Силуэт человека в тяжёлом механизированном снаряжении, вид сверху.
    const ease = 1 - (1 - progress) ** 3;
    const cx = px(effect ? effect.x + (s.x - effect.x) * ease : visualX);
    const cy = py(effect ? effect.y + (s.y - effect.y) * ease - Math.sin(progress * Math.PI) * 1.5 : visualY);
    const unit = Math.max(3, tile * 0.18);
    g.fillStyle(0x07121a, 0.55);
    g.fillEllipse(cx, cy + unit * 2, unit * 5.5, unit * 2);
    g.fillStyle(0x243943, 1);
    g.fillRect(cx - unit * 1.7, cy + unit * 0.6, unit * 1.2, unit * 2.4);
    g.fillRect(cx + unit * 0.5, cy + unit * 0.6, unit * 1.2, unit * 2.4);
    g.fillStyle(0x91a8a5, 1);
    g.fillRoundedRect(cx - unit * 2, cy - unit * 1.6, unit * 4, unit * 3.4, unit * 0.5);
    g.fillStyle(0x536c73, 1);
    g.fillRect(cx - unit * 3, cy - unit, unit, unit * 2.5);
    g.fillRect(cx + unit * 2, cy - unit, unit, unit * 2.5);
    g.fillStyle(0xe8c18a, 1);
    g.fillCircle(cx, cy - unit * 1.6, unit * 1.1);
    g.fillStyle(0x253c44, 1);
    g.fillRect(cx - unit * 0.8, cy - unit * 1.9, unit * 1.6, unit * 0.55);
    g.fillStyle(0xe9bd76, 1);
    g.fillRect(cx - unit * 0.7, cy + unit * 0.1, unit * 1.4, unit * 0.35);

    if (effect) {
      this.pickSprite.setVisible(false);
      g.lineStyle(Math.max(2, tile * 0.16), 0xc6e9ed, (1 - progress) * 0.75);
      g.strokeCircle(px(effect.x), py(effect.y), waveRadius * tile);
      g.fillStyle(0xf8efe0, Math.max(0, 0.18 * (1 - progress * 4)));
      g.fillRect(left, top, tile * size, tile * size);
    } else {
      breachGame.weapons.draw(g, s, tile, px, py, this.pickSprite, { x: visualX, y: visualY, alpha, previousBeam: this.previousBeam, offset: visualOffset });
      for (const shot of s.projectiles) {
        if (shot.block !== s.block) continue;
        const t = Math.max(0, Math.min(1, 1 - (shot.remaining - visualOffset) / shot.duration));
        const x = px(shot.fromX + (shot.x - shot.fromX) * t);
        const y = py(shot.fromY + (shot.y - shot.fromY) * t);
        g.fillStyle(0xf9d997, 0.95);
        g.fillCircle(x, y, Math.max(2, tile * 0.13));
        g.lineStyle(Math.max(1, tile * 0.06), 0xffce79, 0.5);
        g.lineBetween(x, y, px(shot.fromX + (shot.x - shot.fromX) * Math.max(0, t - 0.08)), py(shot.fromY + (shot.y - shot.fromY) * Math.max(0, t - 0.08)));
      }
    }

    if (s.boundary !== null && !effect) {
      const localProgress = s.boundary - s.block * s.size;
      const boundaryY = top + (s.size - localProgress) * tile;
      if (boundaryY >= top - 20 && boundaryY <= top + tile * (s.size + 1)) {
        g.fillStyle(0xe76f51, 0.24);
        g.fillRect(left - 8, top - 8, tile * s.size + 16, Math.max(0, boundaryY - top + 8));
        g.lineStyle(4, 0xff9b73, 1);
        g.beginPath(); g.moveTo(left - 8, boundaryY); g.lineTo(left + tile * s.size + 8, boundaryY); g.strokePath();
      }
    }
    if (s.tutorial === 'click') {
      g.lineStyle(3, 0xffd78c, 0.75 + 0.2 * Math.sin(this.time.now / 250));
      if (s.target) g.strokeCircle(px(s.target.x), py(s.target.y), tile * 0.34);
    }
  }
}
