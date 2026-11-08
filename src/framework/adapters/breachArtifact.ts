import type { BreachState, Stone } from '../../game/breachTypes';
import { BREACH_CONFIG as C } from '../../game/breachConfig';
import { isSpecialUpgradeActive } from './breachSpecialUpgrades';

export interface IsolationArtifactHost {
  readonly state: BreachState;
  nearbyStones(block: number, radius: number): readonly Stone[];
  meleeDamage(): number;
  hit(stone: Stone, damage: number): void;
}
export interface IsolationArtifactConfig { adjacentBlocks: number; damageMultiplier: number; isolationBonus: number; neighborhoodSize: number; isolationExponent: number }

/** Расчёт всех попаданий до применения сохраняет одинаковую изоляцию в пределах тика. */
export class BreachIsolationArtifact {
  constructor(private readonly host: IsolationArtifactHost, private readonly config: IsolationArtifactConfig) {}
  advance(seconds: number): void {
    const s = this.host.state;
    if (!isSpecialUpgradeActive(s, 'artifact') || (s.challengeArena && s.challengeNumber === 2)) return;
    s.artifactClock += seconds;
    while (s.artifactClock >= C.artifactInterval) { s.artifactClock -= C.artifactInterval; this.tick(); }
  }
  tick(): void {
    const state = this.host.state;
    if (state.challengeArena && state.challengeNumber === 2) return;
    const { adjacentBlocks, damageMultiplier, isolationBonus, neighborhoodSize, isolationExponent } = this.config;
    const damage = damageMultiplier * this.host.meleeDamage();
    const hits = this.host.nearbyStones(state.block, adjacentBlocks).map(stone =>
      ({ stone, damage: damage * (1 + isolationBonus * (1 - stone.neighbors / neighborhoodSize) ** isolationExponent) }));
    for (const hit of hits) this.host.hit(hit.stone, hit.damage);
  }
}
