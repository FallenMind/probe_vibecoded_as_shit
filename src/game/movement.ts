import { BREACH_CONFIG } from './breachConfig';
import type { BreachState, Stone } from './breachTypes';
import { CHALLENGE_RULES } from './challengeConfig';

/** Движение и выбор ближайшей цели можно заменить независимо от добычи. */
export class NearestStoneMovement {
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
    const dx = x - state.x;
    const dy = y - state.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const fraction = state.clickBuffer / (BREACH_CONFIG.clickBufferCapacity * (state.cycleUpgrades.cycle15 ? 1.1 : 1));
    const clickBoost = fraction > 0.1 ? 1 + BREACH_CONFIG.clickMovementMaxBonus * Math.min(1, (fraction - 0.1) / 0.4) : 1;
    const challengeSpeed = state.challengeArena ? CHALLENGE_RULES[state.challengeNumber].movementSpeedMultiplier : 1;
    const persistentSpeed = state.spectraUpgrades.phaseStep ? 1.2 : 1;
    const step = Math.min(distance, BREACH_CONFIG.movementSpeed * (1 + state.movementLevel * BREACH_CONFIG.movementSpeedPerLevel) * clickBoost * challengeSpeed * persistentSpeed * (state.pickDash && state.weapon === 'pick' ? 5 : 1) * dt);
    state.x += dx / distance * step;
    state.y += dy / distance * step;
  }
}
