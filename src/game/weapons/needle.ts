import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';
import { BaseWeapon } from './base';

export class NeedleGun extends BaseWeapon {
  readonly id = 'needle';
  readonly control = 'autonomous' as const;
  protected readonly delivery = 'projectile' as const;
  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    let best: DeepReadonly<TileState> | undefined, bestDistance = Infinity, hasUnburned = false;
    const findUnburned = !!context.prioritizeUnburned;
    for (const tile of context.tiles) {
      if (tile.mapId !== context.character.mapId || (findUnburned && tile.tags.includes('burning'))) continue;
      if (findUnburned) hasUnburned = true;
      if (findUnburned && context.reservedFireTargets?.has(tile.id)) continue;
      const remaining = tile.health - (context.predictedDamage?.[tile.id] ?? 0);
      if (remaining <= 1e-9) continue;
      const horizontalDistance = Math.abs(tile.position.x - context.character.position.x);
      if (!best || tile.position.y > best.position.y || (tile.position.y === best.position.y && horizontalDistance < bestDistance)) {
        best = tile;
        bestDistance = horizontalDistance;
      }
    }
    if (best || !findUnburned || hasUnburned) return best;
    return this.selectStandardTarget(context);
  }
  private selectStandardTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    let best: DeepReadonly<TileState> | undefined, bestDistance = Infinity;
    for (const tile of context.tiles) {
      if (tile.mapId !== context.character.mapId || tile.health - (context.predictedDamage?.[tile.id] ?? 0) <= 1e-9) continue;
      const horizontalDistance = Math.abs(tile.position.x - context.character.position.x);
      if (!best || tile.position.y > best.position.y || (tile.position.y === best.position.y && horizontalDistance < bestDistance)) {
        best = tile;
        bestDistance = horizontalDistance;
      }
    }
    return best;
  }
}
