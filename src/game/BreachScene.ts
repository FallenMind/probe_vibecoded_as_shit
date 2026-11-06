import Phaser from 'phaser';
import { breachGame } from './breach';
import { BREACH_CONFIG as C } from './breachConfig';
import { stoneNoise } from './stoneNoise';

const STONE_PALETTES = [
  { stone: 0x6e7b86, hard: 0x8d758e, elemental: 0x51a3a0 },
  { stone: 0x716f8d, hard: 0x9b7796, elemental: 0x65a7cc },
  { stone: 0x697d70, hard: 0x8e8a63, elemental: 0x83b179 },
  { stone: 0x81706c, hard: 0xa28567, elemental: 0xd38b62 },
  { stone: 0x617d84, hard: 0x718c9d, elemental: 0x78c7d1 },
  { stone: 0x777084, hard: 0x9a7899, elemental: 0xc094d5 },
  { stone: 0x77796b, hard: 0x9c9069, elemental: 0xc3b36e },
  { stone: 0x66777d, hard: 0x7e9392, elemental: 0x8ac9b5 },
  { stone: 0x766b68, hard: 0x9a7771, elemental: 0xd58c83 },
  { stone: 0x687083, hard: 0x8086a3, elemental: 0xa5b9ea },
];

function stonePaletteIndex(block: number): number {
  if (block === C.blockCount - 1) return 9;
  const wave = block + 1;
  const boss = wave % C.bossEveryBlocks === 0 && wave < C.blockCount;
  return (Math.floor(block / C.bossEveryBlocks) * 2 + Number(boss)) % STONE_PALETTES.length;
}

/** Сцена только отображает состояние; правила попытки находятся в PreInfinityGame. */
export class BreachScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private pickSprite!: Phaser.GameObjects.Image;
  private spearSprite!: Phaser.GameObjects.Image;
  private readonly noiseCache = new Map<string, number>();
  private previousPosition = { x: 0, y: 0, block: -1 };
  private previousBeam: { x: number; y: number } | null = null;
  private simulationTime = performance.now();
  private simulationDuration = 0.1;

  constructor() { super('BreachScene'); }

  preload(): void {
    this.load.svg('metal-pickaxe', `${import.meta.env.BASE_URL}assets/metal-pickaxe.svg`, { width: 64, height: 64 });
    this.load.svg('metal-spear', `${import.meta.env.BASE_URL}assets/metal-spear.svg`, { width: 64, height: 64 });
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.pickSprite = this.add.image(0, 0, 'metal-pickaxe').setOrigin(0.15, 0.85).setVisible(false);
    this.spearSprite = this.add.image(0, 0, 'metal-spear').setOrigin(0.2, 0.5).setVisible(false);
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
    let visualX = this.previousPosition.block === s.block ? this.previousPosition.x + (s.x - this.previousPosition.x) * alpha : s.x;
    let visualY = this.previousPosition.block === s.block ? this.previousPosition.y + (s.y - this.previousPosition.y) * alpha : s.y;
    const spearActor = breachGame.weapons.spearDashActorPosition(visualOffset);
    if (spearActor && !effect) { visualX = spearActor.x; visualY = spearActor.y; }
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
      const palette = STONE_PALETTES[stonePaletteIndex(s.block)];
      const color = stone.kind === 'hard' ? palette.hard : stone.kind === 'elemental' ? palette.elemental : palette.stone;
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
      if ((stone.damageFlash ?? 0) > 0) {
        g.fillStyle(stone.damageFlashColor ?? 0xe7c37c, Math.min(0.2, (stone.damageFlash ?? 0) * 0.2));
        g.fillRect(left + stone.x * tile, top + stone.y * tile, tile + 0.5, tile + 0.5);
      }
      if (stone.burning) {
        const flicker = 0.5 + 0.5 * Math.sin(this.time.now / 75 + stone.x * 1.7 + stone.y * 2.3);
        g.fillStyle(0xff762e, 0.12 + flicker * 0.08);
        g.fillCircle(px(stone.x), py(stone.y), tile * (0.28 + flicker * 0.08));
        g.fillStyle(0xffd078, 0.35 + flicker * 0.25);
        g.fillCircle(px(stone.x) + Math.sin(this.time.now / 90 + stone.y) * tile * 0.08, py(stone.y) - tile * 0.12, tile * 0.09);
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

    const compressor = breachGame.compressorEffect;
    if (compressor) {
      const progress = Math.max(0, Math.min(1, (compressor.elapsed + visualOffset) / C.compressorAnimationSeconds));
      const intensity = Math.sin(progress * Math.PI);
      const centerX = px(compressor.x), centerY = py(compressor.y);
      g.fillStyle(0xb890ff, 0.035 * intensity);
      g.fillRect(left, top, tile * size, tile * size);
      g.lineStyle(Math.max(2, tile * 0.11), 0xc2a0ff, 0.52 * (1 - progress));
      g.strokeCircle(centerX, centerY, tile * (0.35 + progress * size * 0.52));
      g.fillStyle(0xe8d9ff, 0.14 * intensity);
      g.fillCircle(centerX, centerY, tile * (0.2 + intensity * 0.55));
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
      breachGame.weapons.draw(g, s, tile, px, py, this.pickSprite, this.spearSprite, { x: visualX, y: visualY, alpha, previousBeam: this.previousBeam, offset: visualOffset });
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
    if (!s.challengeArena && s.block === C.blockCount - 1 && (s.endChargeRemaining > 0 || breachGame.finalWallEffect)) {
      const charge = breachGame.finalWallEffect
        ? 1
        : 1 - s.endChargeRemaining / C.finalChargeSeconds;
      const pulse = 0.7 + 0.3 * Math.sin(this.time.now / 95);
      const wallY = top + tile * 0.42;
      g.fillStyle(0xf5fbff, 0.16 + charge * 0.3);
      g.fillRect(left - 8, wallY - tile * 0.12, tile * size + 16, tile * 0.28);
      g.lineStyle(Math.max(3, tile * 0.18), 0xf5fbff, 0.9 * pulse);
      g.beginPath(); g.moveTo(left - 8, wallY); g.lineTo(left + tile * size + 8, wallY); g.strokePath();
      g.lineStyle(Math.max(2, tile * 0.1), 0x8fdcff, 0.5 + charge * 0.3);
      g.beginPath(); g.moveTo(left, wallY - tile * 0.12); g.lineTo(left + tile * size, wallY - tile * 0.12); g.strokePath();
      g.lineStyle(Math.max(2, tile * 0.08), 0xc09bff, 0.4 + charge * 0.35);
      g.beginPath(); g.moveTo(left, wallY + tile * 0.12); g.lineTo(left + tile * size, wallY + tile * 0.12); g.strokePath();
      for (let i = 0; i < 14; i++) {
        const phase = this.time.now / 300 + i * 2.13;
        const x = left + ((i * 0.173 + (this.time.now / 9000) % 1) % 1) * tile * size;
        const y = wallY - tile * (0.2 + Math.abs(Math.sin(phase)) * 0.7);
        g.fillStyle(i % 2 ? 0xc7aaff : 0xc4efff, 0.35 + 0.45 * pulse);
        g.fillCircle(x, y, Math.max(1.5, tile * 0.055));
      }
      if (breachGame.finalWallEffect) {
        const impact = Math.max(0, 1 - breachGame.finalWallEffect.elapsed / 0.65);
        g.lineStyle(Math.max(2, tile * 0.09), 0xdbeeff, impact * 0.8);
        for (let i = 0; i < 9; i++) {
          const x = left + (i + 0.5) * tile * size / 9;
          g.lineBetween(x, wallY, x + Math.sin(i * 7) * tile * 0.22, wallY + tile * (0.4 + (i % 3) * 0.25));
        }
      }
    }
    if (s.tutorial === 'click') {
      g.lineStyle(3, 0xffd78c, 0.75 + 0.2 * Math.sin(this.time.now / 250));
      if (s.target) g.strokeCircle(px(s.target.x), py(s.target.y), tile * 0.34);
    }

    const challengeTransition = breachGame.challengeTransition;
    if (challengeTransition) {
      const transitionProgress = Math.min(1, (challengeTransition.elapsed + visualOffset) / C.challengeTransitionSeconds);
      const pulse = Math.sin(transitionProgress * Math.PI);
      const color = challengeTransition.type === 'result'
        ? challengeTransition.success ? 0xe8bf78 : 0xef775f
        : 0x8de0d2;
      const veil = challengeTransition.type === 'enter'
        ? 0.78 * (1 - transitionProgress)
        : challengeTransition.type === 'exit' ? 0.78 * transitionProgress : 0.12 + pulse * 0.16;
      g.fillStyle(0x07131b, veil);
      g.fillRect(left, top, tile * size, tile * size);
      g.lineStyle(Math.max(2, tile * 0.09), color, 0.8 * (1 - transitionProgress * 0.35));
      g.strokeCircle(left + tile * size / 2, top + tile * size / 2, tile * (0.15 + transitionProgress * size * 0.72));
      g.fillStyle(color, 0.08 + pulse * 0.12);
      g.fillCircle(left + tile * size / 2, top + tile * size / 2, tile * (size * 0.18 + pulse * size * 0.12));
    }
  }
}
