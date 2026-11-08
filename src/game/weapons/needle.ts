import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';
import { BaseWeapon } from './base';

export class NeedleGun extends BaseWeapon {
  readonly id = 'needle';
  readonly control = 'autonomous' as const;
  protected readonly delivery = 'projectile' as const;
  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    if (context.prioritizeUnburned) {
      const unburned = context.tiles.filter(tile => tile.mapId === context.character.mapId && !tile.tags.includes('burning'));
      if (unburned.length === 0) return this.selectStandardTarget(context);
      return unburned.filter(tile => !context.reservedFireTargets?.has(tile.id) &&
        tile.health - (context.predictedDamage?.[tile.id] ?? 0) > 1e-9)
        .reduce<DeepReadonly<TileState> | undefined>((best, tile) => !best || tile.position.y > best.position.y ||
          (tile.position.y === best.position.y && Math.abs(tile.position.x - context.character.position.x) < Math.abs(best.position.x - context.character.position.x)) ? tile : best, undefined);
    }
    return this.selectStandardTarget(context);
  }
  private selectStandardTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    return context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health - (context.predictedDamage?.[tile.id] ?? 0) > 1e-9)
      .reduce<DeepReadonly<TileState> | undefined>((best, tile) => !best || tile.position.y > best.position.y ||
        (tile.position.y === best.position.y && Math.abs(tile.position.x - context.character.position.x) < Math.abs(best.position.x - context.character.position.x)) ? tile : best, undefined);
  }
}
