import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';
import { BaseWeapon } from './base';

export class NeedleGun extends BaseWeapon {
  readonly id = 'needle';
  readonly control = 'autonomous' as const;
  protected readonly delivery = 'projectile' as const;
  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    return context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health > 0)
      .reduce<DeepReadonly<TileState> | undefined>((best, tile) => !best || tile.position.y > best.position.y ||
        (tile.position.y === best.position.y && Math.abs(tile.position.x - context.character.position.x) < Math.abs(best.position.x - context.character.position.x)) ? tile : best, undefined);
  }
}
