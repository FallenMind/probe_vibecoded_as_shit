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
    let best: DeepReadonly<TileState> | undefined, bestDistanceSquared = Infinity;
    for (const tile of context.tiles) {
      if (tile.mapId !== context.character.mapId || tile.health <= 0) continue;
      const dx = tile.position.x - context.character.position.x, dy = tile.position.y - context.character.position.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < bestDistanceSquared) { best = tile; bestDistanceSquared = distanceSquared; }
    }
    return best;
  }

  tick(context: WeaponContext): WeaponResult {
    const runtime = { ...context.runtime };
    const result: WeaponResult = { runtime, movement: null, attacks: [] };
    if (!this.config.enabled || !runtime.enabled || !context.character.enabled || context.seconds <= 0) return result;
    let target = this.selectTarget(context);
    if (!target) return result;
    const distance = Math.hypot(target.position.x - context.character.position.x, target.position.y - context.character.position.y);
    // Движение останавливается ровно на границе радиуса; округление координат
    // не должно заставлять оружие бесконечно ожидать ещё один шаг.
    const interactionRange = context.resolveStat?.(this.config.interactionRange, [`weapon.${this.id}.interactionRange`]) ?? this.config.interactionRange;
    if (this.control === 'movement') {
      // Controlled weapons keep moving toward their target during attack ticks.
      // Plan the attack first so its origin and splash center use this position.
      result.movement = { characterId: context.character.id, destination: { ...target.position },
        stopDistance: this.id === 'fists' ? 0.35 : this.id === 'pick' ? 0.5 : this.id === 'bombarda' ? Math.min(1.5, interactionRange)
          : this.id === 'spear' && distance <= interactionRange ? 0.5 : interactionRange, speedMultiplier: 1 };
    }
    const rawSpeed = context.resolveStat?.(context.character.attackSpeed, ['character.attackSpeed', 'weapon.attackSpeed', `weapon.${this.id}.attackSpeed`]) ?? context.character.attackSpeed;
    const speed = Math.pow(Math.max(0, rawSpeed), this.config.attackSpeedPower ?? 1) + (this.config.attackSpeedFlatBonus ?? 0);
    const baseInterval = this.config.attackIntervalSeconds;
    if (!(baseInterval > 0)) return result;
    if (this.id === 'spear') {
      runtime.elapsed += context.seconds * Math.max(0, speed);
      if (distance > interactionRange + 1e-9) {
        const comboCooldown = context.resolveStat?.(this.config.combo.cooldownMultiplier,
          [`weapon.${this.id}.combo.cooldownMultiplier`, 'weapon.combo.cooldownMultiplier']) ?? this.config.combo.cooldownMultiplier;
        runtime.elapsed = Math.min(runtime.elapsed, baseInterval * Math.max(1, comboCooldown));
        return result;
      }
    } else {
      if (this.control === 'movement' && distance > interactionRange + 1e-9) return result;
      runtime.elapsed += context.seconds * Math.max(0, speed);
    }
    while (result.attacks.length < this.config.maxAttacksPerTick) {
      const comboHits = Math.max(1, Math.floor(context.resolveStat?.(this.config.combo.attacksRequired,
        [`weapon.${this.id}.combo.attacksRequired`, 'weapon.combo.attacksRequired']) ?? this.config.combo.attacksRequired));
      const combo = this.config.combo.enabled && runtime.comboEnabled &&
        (runtime.attacks + 1) % comboHits === 0;
      const comboCooldown = context.resolveStat?.(this.config.combo.cooldownMultiplier,
        [`weapon.${this.id}.combo.cooldownMultiplier`, 'weapon.combo.cooldownMultiplier']) ?? this.config.combo.cooldownMultiplier;
      const interval = baseInterval * (combo ? comboCooldown : 1);
      if (!(interval > 0) || runtime.elapsed + 1e-9 < interval) break;
      runtime.elapsed = Math.max(0, runtime.elapsed - interval);
      runtime.attacks++;
      const plan = this.createPlan(context, target, combo, speed);
      result.attacks.push(plan);
      if (context.prioritizeUnburned) context.reservedFireTargets?.add(target.id);
      if (this.delivery === 'projectile' && context.predictedDamage) {
        const elementalFactor = target.kind === 'elemental' ? Math.max(0.2, Math.min(1, plan.direct.elementalPenetration)) : 1;
        const expectedDamage = context.predictProjectileDamage?.(plan, target) ?? plan.direct.damage * elementalFactor;
        context.predictedDamage[target.id] = (context.predictedDamage[target.id] ?? 0) + expectedDamage;
      }
      if (this.delivery === 'projectile') {
        const nextTarget = this.selectTarget(context);
        if (!nextTarget) break;
        target = nextTarget;
      }
    }
    // Never let a per-tick attack cap turn excess elapsed time into a later burst.
    if (result.attacks.length >= this.config.maxAttacksPerTick && runtime.elapsed >= baseInterval) {
      runtime.elapsed %= baseInterval;
    }
    return result;
  }

  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean, attackSpeedMultiplier = 1): AttackPlan {
    const c = this.config;
    const damage = (context.resolveStat?.(c.damage, ['weapon.damage', `weapon.${c.damageCategory}.damage`, `weapon.${this.id}.damage`]) ?? c.damage) * (combo ? c.combo.damageMultiplier : 1);
    const radius = (context.resolveStat?.(c.area.radius, ['weapon.splash.radius', `weapon.${c.damageCategory}.splash.radius`, `weapon.${this.id}.splash.radius`]) ?? c.area.radius) + (combo ? c.combo.extraRadius : 0);
    const penetration = context.resolveStat?.(c.armorPenetration, ['weapon.armorPenetration', `weapon.${this.id}.armorPenetration`]) ?? c.armorPenetration;
    const elementalPenetration = context.resolveStat?.(c.elementalPenetration, [`weapon.${this.id}.elementalPenetration`]) ?? c.elementalPenetration;
    const shape = this.splashShape(combo);
    const plan: AttackPlan = { weaponId: this.id, characterId: context.character.id, origin: { ...context.character.position },
      delivery: this.delivery, direct: { targetId: target.id, point: { ...target.position }, damage, penetration, elementalPenetration },
      splash: [],
      projectileSpeed: c.projectile.speed * (this.delivery === 'projectile' ? Math.pow(Math.max(0, attackSpeedMultiplier), c.projectile.attackSpeedPower ?? 1) : 1), projectileCount: c.projectile.count, projectileSpread: c.projectile.spread,
      projectilePierce: c.projectile.pierce, burnSeconds: c.projectile.burnSeconds, burnDamageFraction: c.projectile.burnDamageFraction,
      beamTravelSpeed: c.beam.travelSpeed, beamRetargetSeconds: c.beam.retargetSeconds,
      combo, dashDistance: combo ? c.combo.dashDistance : 0 };
    if (shape !== 'single' && radius > 0) plan.splash.push({
      center: { ...(c.area.center === 'character' ? context.character.position : target.position) }, shape, radius,
      arcDegrees: c.area.arcDegrees, damage: damage * c.area.splashDamageMultiplier, falloff: c.area.falloffExponent,
      ...(c.area.falloffCurve ? { falloffCurve: c.area.falloffCurve } : {}),
      ...(c.area.falloffStartDistance === undefined ? {} : { falloffStartDistance: c.area.falloffStartDistance }),
      edgeDamageMultiplier: c.area.edgeDamageMultiplier, penetration,
      elementalPenetration, excludedTargetId: target.id,
    });
    if (this.delivery === 'projectile' && c.projectile.pierce > 0) plan.splash.push({
      center: { ...target.position }, shape: 'projectile-path', radius: 0, arcDegrees: 0,
      damage: damage * c.projectile.pierce, falloff: 0, edgeDamageMultiplier: 1,
      penetration, elementalPenetration, excludedTargetId: target.id,
    });
    return plan;
  }
}
