import { BaseWeapon } from './base';
import type { AttackPlan, WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

/** Рывок описывается в плане комбо; исполнитель боя решает, как его применить. */
export class Spear extends BaseWeapon {
  readonly id = 'spear';
  readonly control = 'movement' as const;
  protected readonly delivery = 'contact' as const;

  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean, attackSpeedMultiplier = 1): AttackPlan {
    const plan = super.createPlan(context, target, combo, attackSpeedMultiplier);
    if (!combo) return plan;

    const splashRadius = plan.splash[0]?.radius ?? this.config.area.radius;
    const searchRadius = splashRadius * 1.5;
    const aliveTiles = context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health > 0);
    const tileAt = new Map(aliveTiles.map(tile => [`${tile.position.x}:${tile.position.y}`, tile]));
    const candidates = aliveTiles.filter(tile =>
      Math.hypot(tile.position.x - target.position.x, tile.position.y - target.position.y) <= searchRadius + 1e-9);
    let best = target, bestScore = -1, bestDistance = Infinity;
    for (const candidate of candidates) {
      let score = 0;
      const extent = Math.ceil(splashRadius);
      for (let y = candidate.position.y - extent; y <= candidate.position.y + extent; y++) {
        for (let x = candidate.position.x - extent; x <= candidate.position.x + extent; x++) {
          const dx = x - candidate.position.x, dy = y - candidate.position.y;
          if (dx * dx + dy * dy <= splashRadius * splashRadius + 1e-9 && tileAt.has(`${x}:${y}`)) score++;
        }
      }
      const distance = Math.hypot(candidate.position.x - target.position.x, candidate.position.y - target.position.y);
      if (score > bestScore || (score === bestScore && distance < bestDistance) ||
          (score === bestScore && distance === bestDistance && candidate.id < best.id)) {
        best = candidate; bestScore = score; bestDistance = distance;
      }
    }
    plan.direct.targetId = best.id;
    plan.direct.point = { ...best.position };

    const dashWidth = context.resolveStat?.(0, ['weapon.spear.combo.dashPathWidth']) ?? 0;
    if (dashWidth > 0) plan.splash.push({
      center: { ...context.character.position }, shape: 'path', path: { from: { ...context.character.position }, to: { ...best.position } },
      radius: dashWidth, arcDegrees: 0, damage: plan.direct.damage, falloff: 1, edgeDamageMultiplier: 0.35,
      penetration: plan.direct.penetration, elementalPenetration: plan.direct.elementalPenetration, excludedTargetId: best.id,
    });
    return plan;
  }
}
