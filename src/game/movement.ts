import { BREACH_CONFIG } from './breachConfig';
import type { BreachState, Stone } from './breachTypes';

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
    const step = Math.min(distance, BREACH_CONFIG.movementSpeed * (1 + state.movementLevel * BREACH_CONFIG.movementSpeedPerLevel) * dt);
    state.x += dx / distance * step;
    state.y += dy / distance * step;
  }
}
