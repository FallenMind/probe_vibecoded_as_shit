import { BaseWeapon } from './base';
import type { WeaponContext } from '../core/contracts';
import type { DeepReadonly, Point, TileState } from '../core/model';

/** Вес притяжения к центру карты плавно угасает: полный — от дальнего радиуса, ноль — внутри внутреннего. */
const CENTER_INNER_RADIUS = 1.5;
const CENTER_OUTER_RADIUS = 4;
const CENTER_WEIGHT = 0.5;

export class Bombarda extends BaseWeapon {
  readonly id = 'bombarda';
  readonly control = 'movement' as const;
  protected readonly delivery = 'projectile' as const;
  private indexedTileSource: WeaponContext['tiles'] | undefined;
  private indexedMapSize: WeaponContext['mapSize'] | undefined;
  private indexedCandidates: { tile: DeepReadonly<TileState>; x: number; y: number }[] = [];
  private occupied = new Uint8Array();
  private readonly splashOffsets = new Map<number, { dx: number; dy: number; weight: number }[]>();

  protected movementDestination(context: WeaponContext, target: DeepReadonly<TileState>): Point {
    const mapSize = context.mapSize;
    if (!mapSize) return { ...target.position };
    const center = { x: (mapSize.width - 1) / 2, y: (mapSize.height - 1) / 2 };
    const position = context.character.position;
    const distance = Math.hypot(position.x - center.x, position.y - center.y);
    const falloff = Math.max(0, Math.min(1, (distance - CENTER_INNER_RADIUS) / (CENTER_OUTER_RADIUS - CENTER_INNER_RADIUS)));
    const weight = CENTER_WEIGHT * falloff;
    if (weight <= 0) return { ...target.position };
    return { x: target.position.x + (center.x - target.position.x) * weight,
      y: target.position.y + (center.y - target.position.y) * weight };
  }

  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    const radius = context.resolveStat?.(this.config.area.radius, ['weapon.splash.radius', 'weapon.ranged.splash.radius', 'weapon.bombarda.splash.radius']) ?? this.config.area.radius;
    const range = context.resolveStat?.(this.config.interactionRange, ['weapon.bombarda.interactionRange']) ?? this.config.interactionRange;
    const mapSize = context.mapSize;
    if (!mapSize || mapSize.width <= 0 || mapSize.height <= 0) return super.selectTarget(context);
    if (this.indexedTileSource !== context.tiles || this.indexedMapSize?.width !== mapSize.width || this.indexedMapSize?.height !== mapSize.height) {
      this.indexedTileSource = context.tiles;
      this.indexedMapSize = mapSize;
      this.occupied = new Uint8Array(mapSize.width * mapSize.height);
      this.indexedCandidates = [];
      for (const tile of context.tiles) {
        if (tile.mapId !== context.character.mapId || tile.health <= 0) continue;
        const x = Math.round(tile.position.x), y = Math.round(tile.position.y);
        if (x < 0 || y < 0 || x >= mapSize.width || y >= mapSize.height) continue;
        this.occupied[y * mapSize.width + x] = 1;
        this.indexedCandidates.push({ tile, x, y });
      }
    }
    const candidates = this.indexedCandidates;
    if (!candidates.length) return undefined;
    let offsets = this.splashOffsets.get(radius);
    if (!offsets) {
      offsets = [];
      const reach = Math.ceil(radius), radiusSquared = radius * radius;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared) continue;
        const t = Math.sqrt(distanceSquared) / Math.max(0.01, radius);
        const eased = t * t * (3 - 2 * t);
        offsets.push({ dx, dy, weight: 0.35 + 0.65 * (1 - eased) });
      }
      this.splashOffsets.set(radius, offsets);
    }
    let best: DeepReadonly<TileState> | undefined;
    let bestScore = -Infinity;
    const px = context.character.position.x, py = context.character.position.y, rangeSquared = range * range, width = mapSize.width;
    for (const point of candidates) {
      if (point.tile.health <= 0) continue;
      const dx = point.x - px, dy = point.y - py;
      if (dx * dx + dy * dy > rangeSquared) continue;
      let score = 0;
      for (const offset of offsets) {
        const x = point.x + offset.dx, y = point.y + offset.dy;
        if (x >= 0 && y >= 0 && x < mapSize.width && y < mapSize.height && this.occupied[y * width + x]) score += offset.weight;
      }
      if (score > bestScore) { best = point.tile; bestScore = score; }
    }
    return best ?? super.selectTarget(context);
  }

  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean, speed = 1) {
    const plan = super.createPlan(context, target, combo, speed);
    if (combo) for (const splash of plan.splash) splash.edgeDamageMultiplier = 0.5;
    return plan;
  }
}
