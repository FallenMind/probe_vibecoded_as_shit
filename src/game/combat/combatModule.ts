import type { AttackPlan, GameModule, StateAccess } from '../core/contracts';
import type { DeepReadonly, GameCommand, TileState } from '../core/model';
import { createFalloffDamage } from '../world/area';
import type { TileArea } from '../world/area';
import { StateMapAccess } from '../world/mapAccess';

export interface HitContext { weaponId: string; characterId: string; splash: boolean; combo: boolean; penetration: number; elementalPenetration: number }
/** Например, правила брони, элементальной породы и испытаний. */
export interface HitPolicy { damage(tile: DeepReadonly<TileState>, baseDamage: number, hit: HitContext, bus: StateAccess): number }

/** Применяет планы контактных и взрывных атак; снаряды и лучи требуют отдельных исполнителей доставки. */
export class CombatModule implements GameModule {
  readonly id = 'combat';
  constructor(private readonly policy: HitPolicy) {}

  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type !== 'attack' || !command.payload || typeof command.payload !== 'object') return false;
    const attack = command.payload as AttackPlan;
    const actor = bus.read().characters[attack.characterId];
    if (!actor || !attack.direct || !Array.isArray(attack.splash) ||
        (attack.delivery !== 'contact' && attack.delivery !== 'explosion') ||
        attack.splash.some(splash => splash.shape === 'projectile-path')) return false;
    const maps = new StateMapAccess(bus);
    const target = maps.getTile(attack.direct.targetId);
    if (target && target.mapId !== actor.mapId) return false;
    if (!target && attack.delivery !== 'explosion') return false;
    const context = (splash: boolean, penetration: number, elementalPenetration: number): HitContext =>
      ({ weaponId: attack.weaponId, characterId: attack.characterId, splash, combo: attack.combo, penetration, elementalPenetration });
    const damageBuffer: { tileId: string; damage: number }[] = target
      ? [{ tileId: target.id, damage: this.policy.damage(target, attack.direct.damage, context(false, attack.direct.penetration, attack.direct.elementalPenetration), bus) }]
      : [];
    for (const splash of attack.splash) {
      if (splash.shape === 'projectile-path') return false;
      if (splash.shape === 'path' && !splash.path) return false;
      const direction = { x: attack.direct.point.x - attack.origin.x, y: attack.direct.point.y - attack.origin.y };
      if (direction.x === 0 && direction.y === 0) direction.x = 1;
      const area: TileArea = splash.shape === 'path'
        ? { shape: 'path', from: splash.path!.from, to: splash.path!.to, radius: splash.radius }
        : splash.shape === 'arc'
        ? { shape: 'arc', center: splash.center, radius: splash.radius, direction, degrees: splash.arcDegrees }
        : { shape: splash.shape, center: splash.center, radius: splash.radius };
      const falloff = splash.falloff === 0 ? () => splash.damage : createFalloffDamage({ damage: splash.damage, radius: splash.radius, edgeMultiplier: splash.edgeDamageMultiplier, exponent: splash.falloff, startDistance: splash.falloffStartDistance, curve: splash.falloffCurve });
      const excluded = new Set([attack.direct.targetId, splash.excludedTargetId]);
      for (const tile of maps.selectArea({ mapId: actor.mapId, area, excludeTileIds: [...excluded] })) {
        const distance = Math.hypot(tile.position.x - splash.center.x, tile.position.y - splash.center.y);
        const damage = this.policy.damage(tile, falloff(tile, distance), context(true, splash.penetration, splash.elementalPenetration), bus);
        damageBuffer.push({ tileId: tile.id, damage });
      }
    }
    const hits = maps.damageBatch(damageBuffer);
    if (hits.length) bus.emit({ type: 'combat.damage', source: this.id, payload: { weapon: attack.weaponId, hits } });
    return true;
  }
}
