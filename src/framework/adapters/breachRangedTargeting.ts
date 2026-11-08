import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState, Stone } from '../../game/breachTypes';
import type { Point } from '../core/model';

export interface BreachRangedTargetContext {
  state: BreachState; stones: readonly Stone[]; beam: Point | null; blastRadius: number; damage: number;
  spreadLevel: number; beamSpeedLevel: number;
  canHit(stone: Stone): boolean;
  splashMultiplier(distance: number, radius: number, spreadLevel: number): number;
}
export interface BreachRangedTargeting { select(context: BreachRangedTargetContext): Point | undefined }

/** Поиск с конца карты; излучатель оценивает полезную плотность и стоимость перемещения. */
export class RearDensityTargeting implements BreachRangedTargeting {
  select({ state, stones, beam, blastRadius, damage, spreadLevel, beamSpeedLevel, canHit, splashMultiplier }: BreachRangedTargetContext): Point | undefined {
    const cells = new Map<string, Stone>();
    let rear: Stone | undefined;
    for (const stone of stones) {
      if (stone.block !== state.block) continue;
      cells.set(`${stone.x}:${stone.y}`, stone);
      if (canHit(stone) && (!rear || stone.y > rear.y || (stone.y === rear.y && Math.abs(stone.x - state.x) < Math.abs(rear.x - state.x)))) rear = stone;
    }
    if (!rear) return undefined;
    if (state.rangedWeapon === 'needle') return { x: rear.x, y: rear.y };
    const radius = blastRadius * C.rangedSearchMultiplier;
    let best: Point | undefined;
    let bestDamage = 0;
    for (let y = Math.max(0, rear.y - radius); y <= Math.min(state.size - 1, rear.y + radius); y++) {
      for (let x = Math.max(0, rear.x - radius); x <= Math.min(state.size - 1, rear.x + radius); x++) {
        if (Math.hypot(x - rear.x, y - rear.y) > radius) continue;
        let total = 0;
        for (let dy = -blastRadius; dy <= blastRadius; dy++) for (let dx = -blastRadius; dx <= blastRadius; dx++) {
          const distance = Math.hypot(dx, dy);
          if (distance > blastRadius) continue;
          const stone = cells.get(`${x + dx}:${y + dy}`);
          if (!stone || !canHit(stone)) continue;
          const factor = stone.kind === 'elemental' ? 1 / C.elementalMultiplier : 1;
          const weight = splashMultiplier(distance, blastRadius, spreadLevel);
          total += (weight * Math.min(stone.hp, Math.max(damage, 1) * 4) + 0.35) * factor;
        }
        if (beam) total /= 1 + 0.12 * Math.hypot(x - beam.x, y - beam.y) / (1 + beamSpeedLevel * C.beamSpeedPerLevel);
        if (total > bestDamage || (total > 0 && total === bestDamage && best && (y > best.y || (y === best.y && Math.abs(x - state.x) < Math.abs(best.x - state.x))))) {
          bestDamage = total; best = { x, y };
        }
      }
    }
    return best;
  }
}
