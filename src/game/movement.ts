import { isCycleUpgradeActive } from '../framework/adapters/breachCycleEffects';
import { BREACH_CONFIG } from './breachConfig';
import type { BreachState, Stone } from './breachTypes';
import { CHALLENGE_RULES } from './challengeConfig';
import type { MovementStrategy } from '../framework/core/contracts';
import { DirectMovement } from '../framework/movement/nearest';
import { isSpectraUpgradeActive } from '../framework/adapters/breachSpectraUpgrades';

/** Движение и выбор ближайшей цели можно заменить независимо от добычи. */
export class NearestStoneMovement {
  constructor(private readonly strategy: MovementStrategy = new DirectMovement()) {}
  private resolveUpgradeStat?: (base: number, key: string) => number;
  setUpgradeResolver(resolve: (base: number, key: string) => number): void { this.resolveUpgradeStat = resolve; }
  target(state: BreachState, stones: readonly Stone[] = state.stones): Stone | undefined {
    let nearest: Stone | undefined;
    let distance = Infinity;
    for (const stone of stones) {
      if (stone.block !== state.block) continue;
      const d = (stone.x - state.x) ** 2 + (stone.y - state.y) ** 2;
      if (d < distance) { distance = d; nearest = stone; }
    }
    return nearest;
  }

  move(state: BreachState, x: number, y: number, dt: number): void {
    const fraction = state.clickBuffer / (BREACH_CONFIG.clickBufferCapacity * (isCycleUpgradeActive(state, 'cycle15') ? 1.1 : 1));
    const clickBoost = fraction > 0.1 ? 1 + BREACH_CONFIG.clickMovementMaxBonus * Math.min(1, (fraction - 0.1) / 0.4) : 1;
    const challengeSpeed = state.challengeArena ? CHALLENGE_RULES[state.challengeNumber].movementSpeedMultiplier : 1;
    const persistentSpeed = isSpectraUpgradeActive(state, 'phaseStep') ? 1.2 : 1;
    const movementBoost = this.resolveUpgradeStat?.(1, 'character.movement.speed') ?? (1 + state.movementLevel * BREACH_CONFIG.movementSpeedPerLevel);
    const speed = BREACH_CONFIG.movementSpeed * movementBoost * clickBoost * challengeSpeed * persistentSpeed * (state.pickDash && state.weapon === 'pick' ? 5 : 1);
    const position = this.strategy.nextPosition({ x: state.x, y: state.y }, { characterId: 'main', destination: { x, y }, stopDistance: 0, speedMultiplier: 1 }, dt, speed);
    state.x = position.x;
    state.y = position.y;
  }
}
