import type { WeaponConfig } from '../config/schema';
import type { AttackPlan, Weapon, WeaponContext, WeaponResult } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

export abstract class BaseWeapon implements Weapon {
  abstract readonly id: string;
  abstract readonly control: 'movement' | 'autonomous';
  protected abstract readonly delivery: AttackPlan['delivery'];
  constructor(protected readonly config: WeaponConfig) {}
  get comboAvailable(): boolean { return this.config.combo.enabled; }
  protected splashShape(combo: boolean): WeaponConfig['area']['shape'] {
    return combo && this.config.area.shape === 'single' ? 'circle' : this.config.area.shape;
  }

  protected selectTarget(context: WeaponContext): DeepReadonly<TileState> | undefined {
    return context.tiles.filter(tile => tile.mapId === context.character.mapId && tile.health > 0)
      .reduce<DeepReadonly<TileState> | undefined>((best, tile) => {
        const distance = Math.hypot(tile.position.x - context.character.position.x, tile.position.y - context.character.position.y);
        const previous = best ? Math.hypot(best.position.x - context.character.position.x, best.position.y - context.character.position.y) : Infinity;
        return distance < previous ? tile : best;
      }, undefined);
  }

  tick(context: WeaponContext): WeaponResult {
    const runtime = { ...context.runtime };
    const result: WeaponResult = { runtime, movement: null, attacks: [] };
    if (!this.config.enabled || !runtime.enabled || !context.character.enabled || context.seconds <= 0) return result;
    const target = this.selectTarget(context);
    if (!target) return result;
    const distance = Math.hypot(target.position.x - context.character.position.x, target.position.y - context.character.position.y);
    if (this.control === 'movement' && distance > this.config.interactionRange) {
      result.movement = { characterId: context.character.id, destination: { ...target.position }, stopDistance: this.config.interactionRange, speedMultiplier: 1 };
      return result;
    }
    const speed = context.resolveStat?.(context.character.attackSpeed, ['character.attackSpeed', `weapon.${this.id}.attackSpeed`]) ?? context.character.attackSpeed;
    runtime.elapsed += context.seconds * Math.max(0, speed);
    const baseInterval = this.config.attackIntervalSeconds;
    if (!(baseInterval > 0)) return result;
    while (result.attacks.length < this.config.maxAttacksPerTick) {
      const combo = this.config.combo.enabled && runtime.comboEnabled && this.config.combo.attacksRequired > 0 &&
        (runtime.attacks + 1) % this.config.combo.attacksRequired === 0;
      const interval = baseInterval * (combo ? this.config.combo.cooldownMultiplier : 1);
      if (!(interval > 0) || runtime.elapsed + 1e-9 < interval) break;
      runtime.elapsed = Math.max(0, runtime.elapsed - interval);
      runtime.attacks++;
      result.attacks.push(this.createPlan(context, target, combo));
    }
    return result;
  }

  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean): AttackPlan {
    const c = this.config;
    const damage = (context.resolveStat?.(c.damage, ['weapon.damage', `weapon.${c.damageCategory}.damage`, `weapon.${this.id}.damage`]) ?? c.damage) * (combo ? c.combo.damageMultiplier : 1);
    const radius = (context.resolveStat?.(c.area.radius, ['weapon.splash.radius', `weapon.${this.id}.splash.radius`]) ?? c.area.radius) + (combo ? c.combo.extraRadius : 0);
    const shape = this.splashShape(combo);
    const plan: AttackPlan = { weaponId: this.id, characterId: context.character.id, origin: { ...context.character.position },
      delivery: this.delivery, direct: { targetId: target.id, point: { ...target.position }, damage, penetration: c.armorPenetration, elementalPenetration: c.elementalPenetration },
      splash: [],
      projectileSpeed: c.projectile.speed, projectileCount: c.projectile.count, projectileSpread: c.projectile.spread,
      projectilePierce: c.projectile.pierce, burnSeconds: c.projectile.burnSeconds, burnDamageFraction: c.projectile.burnDamageFraction,
      beamTravelSpeed: c.beam.travelSpeed, beamRetargetSeconds: c.beam.retargetSeconds,
      combo, dashDistance: combo ? c.combo.dashDistance : 0 };
    if (shape !== 'single' && radius > 0) plan.splash.push({
      center: { ...(c.area.center === 'character' ? context.character.position : target.position) }, shape, radius,
      arcDegrees: c.area.arcDegrees, damage: damage * c.area.splashDamageMultiplier, falloff: c.area.falloffExponent,
      edgeDamageMultiplier: c.area.edgeDamageMultiplier, penetration: c.armorPenetration,
      elementalPenetration: c.elementalPenetration, excludedTargetId: target.id,
    });
    if (this.delivery === 'projectile' && c.projectile.pierce > 0) plan.splash.push({
      center: { ...target.position }, shape: 'projectile-path', radius: 0, arcDegrees: 0,
      damage: damage * c.projectile.pierce, falloff: 0, edgeDamageMultiplier: 1,
      penetration: c.armorPenetration, elementalPenetration: c.elementalPenetration, excludedTargetId: target.id,
    });
    return plan;
  }
}
