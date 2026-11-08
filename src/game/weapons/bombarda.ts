import { BaseWeapon } from './base';
import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

export class Bombarda extends BaseWeapon {
  readonly id = 'bombarda';
  readonly control = 'movement' as const;
  protected readonly delivery = 'projectile' as const;

  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    const candidates = context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health > 0);
    if (!candidates.length) return undefined;
    const radius = context.resolveStat?.(this.config.area.radius, ['weapon.splash.radius', 'weapon.ranged.splash.radius', 'weapon.bombarda.splash.radius']) ?? this.config.area.radius;
    const range = context.resolveStat?.(this.config.interactionRange, ['weapon.bombarda.interactionRange']) ?? this.config.interactionRange;
    const byPosition = new Map(candidates.map(tile => [String(tile.position.x) + ',' + String(tile.position.y), tile]));
    const reach = Math.ceil(radius);
    let best: DeepReadonly<TileState> | undefined;
    let bestScore = -Infinity;
    for (const point of candidates) {
      const dx = point.position.x - context.character.position.x, dy = point.position.y - context.character.position.y;
      if (dx * dx + dy * dy > range * range) continue;
      let score = 0;
      for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) {
        const distance = Math.hypot(x, y);
        if (distance > radius) continue;
        if (byPosition.has(String(point.position.x + x) + ',' + String(point.position.y + y))) {
          const t = Math.max(0, Math.min(1, distance / Math.max(0.01, radius)));
          const eased = t * t * (3 - 2 * t);
          score += 0.35 + 0.65 * (1 - eased);
        }
      }
      if (score > bestScore) { best = point; bestScore = score; }
    }
    return best ?? super.selectTarget(context);
  }

  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean, speed = 1) {
    const plan = super.createPlan(context, target, combo, speed);
    if (combo) for (const splash of plan.splash) splash.edgeDamageMultiplier = 0.5;
    return plan;
  }
}
