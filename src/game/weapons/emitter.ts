import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';
import { BaseWeapon } from './base';

export class Emitter extends BaseWeapon {
  readonly id = 'emitter';
  readonly control = 'autonomous' as const;
  protected readonly delivery = 'beam' as const;
  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    const tiles = context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health > 0);
    if (!tiles.length) return undefined;
    const rearY = Math.max(...tiles.map(tile => tile.position.y));
    const search = this.config.area.radius * this.config.beam.searchRadiusMultiplier;
    const grid = new Map(tiles.map(tile => [`${tile.position.x}:${tile.position.y}`, tile]));
    let best: DeepReadonly<TileState> | undefined;
    let bestScore = -1;
    const radius = Math.ceil(this.config.area.radius);
    for (const tile of tiles) {
      if (rearY - tile.position.y > search) continue;
      let score = 0;
      for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
        if (Math.hypot(x, y) > this.config.area.radius) continue;
        score += grid.get(`${tile.position.x + x}:${tile.position.y + y}`)?.health ?? 0;
      }
      if (score > bestScore || (score === bestScore && best && tile.position.y > best.position.y)) { best = tile; bestScore = score; }
    }
    return best;
  }
}
