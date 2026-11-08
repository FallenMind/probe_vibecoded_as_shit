export type BreachStoneKind = 'stone' | 'hard' | 'elemental';
export interface BreachWorldConfig {
  blockCount: number; bossEveryBlocks: number; bossStoneHpMultiplier: number; postBossHpMultiplier: number; postBossCompensationBlocks: number;
  ordinaryStoneHp: number; hardStoneHp: number; elementalStoneHp: number; stoneHpLinearPerTwoBlocks: number; stoneHpPercentPerTwoBlocks: number;
  elementalBossWave: number; baseOreReward: Readonly<Record<BreachStoneKind, number>>;
  oreRewardLinearPerTwoBlocks: number; oreRewardPercentPerTwoBlocks: number;
  mineralNoiseScale: number; mineralNoiseOffsetX: number; mineralNoiseOffsetY: number; hardMineralSeed: number; elementalMineralSeed: number;
  hardMineralThreshold: number; bossHardNoiseThreshold: number; elementalMineralThreshold: number; elementalBossNoiseThreshold: number;
  elementalMineralRampStartThreshold: number; elementalMineralStartBlock: number; elementalMineralNormalBlock: number; hardMineralStartBlock: number;
}
export interface GeneratedStone { block: number; x: number; y: number; hp: number; maxHp: number; kind: BreachStoneKind; neighbors: number }
export type StoneNoise = (x: number, y: number, seed: number) => number;

/** Настраиваемые правила генерации и наград текущего режима прорыва. */
export class BreachWorldRules {
  constructor(private readonly config: BreachWorldConfig, private readonly noise: StoneNoise) {}

  isBoss(block: number): boolean {
    return (block + 1) % this.config.bossEveryBlocks === 0 && block + 1 < this.config.blockCount;
  }
  private baseHealth(kind: BreachStoneKind): number {
    return kind === 'hard' ? this.config.hardStoneHp : kind === 'elemental' ? this.config.elementalStoneHp : this.config.ordinaryStoneHp;
  }
  challengeHealth(kind: BreachStoneKind, block: number): number {
    let hp = this.baseHealth(kind);
    for (let i = 0; i < Math.floor(block / 2); i++) hp += this.config.stoneHpLinearPerTwoBlocks + hp * this.config.stoneHpPercentPerTwoBlocks;
    return hp;
  }
  stoneHealth(kind: BreachStoneKind, block: number, applyBossScale = true): number {
    const c = this.config, boss = this.isBoss(block);
    const steps = boss && !applyBossScale ? 0 : Math.floor(block / 2);
    let hp = this.baseHealth(kind);
    for (let i = 0; i < steps; i++) hp += c.stoneHpLinearPerTwoBlocks + hp * c.stoneHpPercentPerTwoBlocks;
    if (block >= c.bossEveryBlocks && block < c.blockCount - 1 && block % c.bossEveryBlocks < c.postBossCompensationBlocks) hp *= c.postBossHpMultiplier;
    if (boss && applyBossScale) hp *= c.bossStoneHpMultiplier;
    return hp;
  }
  oreReward(kind: BreachStoneKind, block: number): number {
    let reward = this.config.baseOreReward[kind];
    for (let i = 0; i < Math.floor(block / 2); i++) reward += this.config.oreRewardLinearPerTwoBlocks + reward * this.config.oreRewardPercentPerTwoBlocks;
    return Math.floor(reward);
  }
  stoneKind(block: number, x: number, y: number, size: number, options: { tutorial: boolean; bosses: boolean }): BreachStoneKind {
    const c = this.config;
    if (options.tutorial && block === 2) return 'hard';
    const worldY = block * size + size - 1 - y;
    const nx = (x + c.mineralNoiseOffsetX) / c.mineralNoiseScale, ny = (worldY + c.mineralNoiseOffsetY) / c.mineralNoiseScale;
    const ramp = Math.min(1, Math.max(0, (block - c.elementalMineralStartBlock) / (c.elementalMineralNormalBlock - c.elementalMineralStartBlock)));
    const threshold = c.elementalMineralRampStartThreshold + (c.elementalMineralThreshold - c.elementalMineralRampStartThreshold) * ramp;
    if (options.bosses && block + 1 === c.elementalBossWave && this.noise(nx, ny, c.elementalMineralSeed + 250) > c.elementalBossNoiseThreshold) return 'elemental';
    if (block >= c.elementalMineralStartBlock && this.noise(nx, ny, c.elementalMineralSeed) > threshold) return 'elemental';
    const hardThreshold = options.bosses && this.isBoss(block) && block + 1 < c.elementalBossWave ? c.bossHardNoiseThreshold : c.hardMineralThreshold;
    if (block >= c.hardMineralStartBlock && this.noise(nx, ny, c.hardMineralSeed) > hardThreshold) return 'hard';
    return 'stone';
  }
  generate(size: number, tutorial: boolean, bossScaling: boolean): GeneratedStone[] {
    if (!Number.isInteger(size) || size < 1) throw new Error('Некорректный размер карты');
    const stones: GeneratedStone[] = [];
    for (let worldY = 0; worldY < this.config.blockCount * size; worldY++) {
      const block = Math.floor(worldY / size), y = size - 1 - worldY % size;
      for (let x = 0; x < size; x++) {
        const kind = this.stoneKind(block, x, y, size, { tutorial, bosses: true });
        const hp = this.stoneHealth(kind, block, bossScaling);
        stones.push({ block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
      }
    }
    return stones;
  }
}
