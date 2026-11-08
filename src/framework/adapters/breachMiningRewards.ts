import { isCycleUpgradeActive } from './breachCycleEffects';
import type { BreachState, Stone, StoneKind } from '../../game/breachTypes';

export interface BreachMiningRewardConfig {
  stoneWeights: Readonly<Record<StoneKind, number>>;
  elementalCrystalChance: number;
  repeatableUnlockFraction: number;
  elementalizationChance: number;
}
export interface BreachMiningRewardHost {
  readonly state: BreachState;
  random(): number;
  fireUnlocked(): boolean;
  fireCapacity(): number;
  isBoss(block: number): boolean;
  oreReward(kind: StoneKind, block: number): number;
  remainingStones(): number;
  completeChallenge3(): void;
  elementalizationActive(): boolean;
}

/** Начисление добычи отделено от удаления камня и может быть заменено вместе с режимом. */
export class BreachMiningRewards {
  constructor(private readonly host: BreachMiningRewardHost, private readonly config: BreachMiningRewardConfig) {}
  award(stone: Readonly<Stone>): void {
    const s = this.host.state, a = s.alchemy, c = this.config;
    if (s.challengeArena && s.challengeNumber !== 3) return;
    const weight = c.stoneWeights[stone.kind];
    const elementalized = stone.kind !== 'elemental' && this.host.elementalizationActive() && this.host.random() < c.elementalizationChance;
    a.stone += weight - Number(elementalized);
    if (s.challengeArena) {
      if (stone.kind === 'elemental') a.elementalStone += 1;
      if (elementalized) {
        a.elementalStone += 1;
        s.challenge3Transmuted++;
        if (s.challenge3Transmuted >= 10000) this.host.completeChallenge3();
        s.message = `Элементальный камень: ${s.challenge3Transmuted} / 10000`;
      }
      return;
    }
    if (isCycleUpgradeActive(s, 'cycle9')) a.stone += weight * 0.1;
    if (stone.kind === 'elemental') a.elementalStone += 1;
    if (stone.kind === 'elemental' && this.host.fireUnlocked() && a.fire < this.host.fireCapacity()) a.fire = Math.min(this.host.fireCapacity(), a.fire + 1);
    if (elementalized) a.elementalStone += 1;
    if (s.earthOverloadRemaining > 0 && ++s.earthOverloadCounter % 2 === 0) a.elementalStone += 1;
    if (stone.kind === 'elemental' && this.host.random() < c.elementalCrystalChance) {
      s.crystals++;
      s.message = 'Элементальная руда принесла кристалл.';
    }
    const oreMultiplier = 1 + (isCycleUpgradeActive(s, 'cycle13') && this.host.isBoss(stone.block) ? 1 : 0);
    s.ore += this.host.oreReward(stone.kind, stone.block) * oreMultiplier;
    if (stone.block === s.block && this.host.remainingStones() <= s.size * s.size * (1 - c.repeatableUnlockFraction)) s.repeatablesUnlocked = true;
    if (s.tutorial === 'click') { s.ore += 2; s.tutorial = 'auto'; }
  }
}
