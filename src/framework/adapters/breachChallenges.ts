import { BREACH_CONFIG as C } from '../../game/breachConfig';
import { CHALLENGE_RULES } from '../../game/challengeConfig';
import type { BreachState, Stone, StoneKind } from '../../game/breachTypes';
import type { BreachChallengeId } from './breachChallengeRewards';

export interface ChallengeTransition { type: 'enter' | 'exit' | 'result'; number: BreachChallengeId; elapsed: number; success?: boolean }
export interface BreachChallengeHost {
  readonly state: BreachState;
  unlocked(id: BreachChallengeId): boolean;
  finalWallActive(): boolean;
  rebuildIndex(): void;
  addStones(stones: readonly Stone[]): boolean;
  setTransition(transition: ChallengeTransition): void;
  stoneHealth(kind: StoneKind, block: number): number;
  challengeHealth(kind: StoneKind, block: number): number;
  challengeKind(block: number, x: number, y: number, size: number): StoneKind;
  random(): number;
  applyUpgradeRestriction(id: BreachChallengeId): boolean;
  clearUpgradeRestriction(id: BreachChallengeId): void;
}

/** Переходный контроллер арен: обычный забег сохраняется до выхода из испытания. */
export class BreachChallenges {
  constructor(private readonly host: BreachChallengeHost) {}

  advanceTimer(dt: number): void {
    const s = this.host.state;
    if (!s.challengeArena || s.challengeWon || s.challengeRemaining <= 0) return;
    s.challengeRemaining = Math.max(0, s.challengeRemaining - dt);
    if (s.challengeRemaining <= 0) {
      s.challengeFailed = true;
      s.challengeWon = true;
      s.message = `Время Challenge ${s.challengeNumber} вышло.`;
      this.host.setTransition({ type: 'result', number: s.challengeNumber, elapsed: 0, success: false });
    }
  }

  enter(number: BreachChallengeId): boolean {
    const s = this.host.state;
    if (s.paused || s.challengeArena || !this.host.unlocked(number) || (number === 3 && s.alchemy.air < 1) || s.endChargeRemaining > 0 || this.host.finalWallActive()) return false;
    const before = { ...s, alchemy: { ...s.alchemy, upgrades: { ...s.alchemy.upgrades } }, combos: { ...s.combos }, comboCounts: { ...s.comboCounts } };
    if (!this.host.applyUpgradeRestriction(number)) return false;
    try {
    s.challengeReturnStones = s.stones;
    s.challengeReturnSize = s.size; s.challengeReturnBlock = s.block;
    s.challengeReturnX = s.x; s.challengeReturnY = s.y;
    s.challengeReturnBossRemaining = s.bossRemaining; s.challengeReturnEndChargeRemaining = s.endChargeRemaining;
    s.bossRemaining = 0; s.endChargeRemaining = 0;
    if (number === 3) {
      const seed = CHALLENGE_RULES[3].alchemySeed;
      s.alchemy.stone += seed.stone ?? 0; s.alchemy.earth += seed.earth ?? 0;
      s.alchemy.elementalStone += seed.elementalStone ?? 0; s.alchemy.water += seed.water ?? 0;
      s.challenge3Transmuted = 0; s.challenge3WaterProduced = false; s.challenge3AirProduced = false;
      s.alchemy.earthEnabled = true; s.alchemy.waterEnabled = true; s.alchemy.airProductionEnabled = true;
    }
    s.challengeRegenClock = 0; s.stones = [];
    const rules = CHALLENGE_RULES[number];
    s.size = rules.size; s.block = 0; s.challengeArena = true; s.challengeNumber = number;
    s.challengeWon = false; s.challengeFailed = false; s.challengeRemaining = rules.durationSeconds;
    if (number === 2) s.combos.fists = true;
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      const kind: StoneKind = number === 4 ? this.host.challengeKind(s.block, x, y, s.size) : 'stone';
      const hp = (number === 4 ? this.host.challengeHealth(kind, s.block) : this.host.stoneHealth(kind, C.blockCount - 1)) * rules.stoneMultiplier * (number === 4 ? s.challenge4StoneMultiplier : 1);
      s.stones.push({ block: s.block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
    }
    this.host.rebuildIndex();
    s.x = Math.floor(s.size / 2); s.y = s.size; s.target = null; s.attackClock = 0;
    s.comboCounts = { fists: 0, pick: 0, spear: 0 };
    this.host.setTransition({ type: 'enter', number, elapsed: 0 });
    return true;
    } catch (error) {
      Object.assign(s, before);
      this.host.clearUpgradeRestriction(number);
      // Индекс должен снова ссылаться на исходную карту; исходную ошибку сохраняем.
      try { this.host.rebuildIndex(); } catch { /* Ошибку индекса сообщит исходная операция. */ }
      throw error;
    }
  }

  leave(): boolean {
    const s = this.host.state;
    if (!s.challengeArena) return false;
    const number = s.challengeNumber;
    this.host.clearUpgradeRestriction(number);
    this.host.setTransition({ type: 'exit', number, elapsed: 0, success: s.challengeWon && !s.challengeFailed });
    s.stones = s.challengeReturnStones ?? []; s.challengeReturnStones = null;
    s.size = s.challengeReturnSize ?? C.blockSize + s.expansion; s.block = s.challengeReturnBlock ?? s.block;
    s.x = s.challengeReturnX ?? Math.floor(s.size / 2); s.y = s.challengeReturnY ?? s.size - 0.5;
    if (s.challengeReturnAlchemy) { s.alchemy = s.challengeReturnAlchemy; s.challengeReturnAlchemy = null; }
    if (number === 3 && s.challenge3Completed) {
      s.alchemy.earthEnabled = true; s.alchemy.waterEnabled = true; s.alchemy.airProductionEnabled = true; s.alchemy.elementalizationEnabled = true;
    }
    s.bossRemaining = s.challengeReturnBossRemaining ?? 0; s.endChargeRemaining = s.challengeReturnEndChargeRemaining ?? 0;
    s.challengeReturnBossRemaining = null; s.challengeReturnEndChargeRemaining = null;
    if (number === 2 && !s.fistComboUnlocked) s.combos.fists = false;
    if (number === 4) { s.challenge4StoneMultiplier = 1; s.challenge4DamageMultiplier = 1; s.challenge4RangeBonus = 0; }
    s.challengeReturnSize = s.challengeReturnBlock = s.challengeReturnX = s.challengeReturnY = null;
    s.challengeArena = false; s.challengeWon = false; s.challengeFailed = false; s.challengeRemaining = 0; s.challengeNumber = 1; s.target = null;
    s.challenge3Transmuted = 0; s.challenge3WaterProduced = false; s.challenge3AirProduced = false;
    this.host.rebuildIndex();
    return true;
  }

  regenerate(dt: number): void {
    const s = this.host.state;
    if (!s.challengeArena || s.challengeWon || (s.challengeNumber !== 3 && s.challengeNumber !== 4)) return;
    const rules = CHALLENGE_RULES[s.challengeNumber];
    const remaining = s.stones.length / (s.size * s.size);
    if (s.challengeNumber === 4 && (remaining <= CHALLENGE_RULES[4].finishFraction || s.block >= C.blockCount - 1)) return;
    if (s.challengeNumber === 4) {
      const repairPerSecond = C.needleBurnDamagePercentPerTick / C.needleBurnTickSeconds;
      for (const stone of s.stones) stone.hp = Math.min(stone.maxHp, stone.hp + stone.maxHp * repairPerSecond * dt);
    }
    s.challengeRegenClock += dt;
    while (s.challengeRegenClock >= 1) {
      s.challengeRegenClock -= 1;
      const missing: { x: number; y: number }[] = [];
      const occupied = new Set(s.stones.map(stone => `${stone.x}:${stone.y}`));
      for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) if (!occupied.has(`${x}:${y}`)) missing.push({ x, y });
      const count = Math.min(missing.length, Math.ceil(s.size * s.size * (rules.regenFraction ?? 0)));
      const generated: Stone[] = [];
      for (let i = 0; i < count; i++) {
        const pick = Math.floor(this.host.random() * missing.length);
        const [{ x, y }] = missing.splice(pick, 1);
        const block = s.block;
        const hp = (s.challengeNumber === 4 ? this.host.challengeHealth('stone', block) * s.challenge4StoneMultiplier : this.host.stoneHealth('stone', C.blockCount - 1)) * rules.stoneMultiplier;
        generated.push({ block, x, y, hp, maxHp: hp, kind: 'stone', neighbors: 0 });
      }
      if (!this.host.addStones(generated)) throw new Error('Не удалось восстановить камни испытания');
    }
  }
}
