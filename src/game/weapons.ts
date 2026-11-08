import { isCycleUpgradeActive } from '../framework/adapters/breachCycleEffects';
import type Phaser from 'phaser';
import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, Stone, WeaponId } from './breachTypes';
import { CHALLENGE_RULES } from './challengeConfig';
import { RearDensityTargeting } from '../framework/adapters/breachRangedTargeting';
import type { BreachRangedTargeting } from '../framework/adapters/breachRangedTargeting';
import type { BreachAttack, BreachAttackId } from '../framework/adapters/weapons/contracts';
import { BreachFistsAttack } from '../framework/adapters/weapons/fists';
import { BreachPickAttack } from '../framework/adapters/weapons/pick';
import { BreachSpearAttack } from '../framework/adapters/weapons/spear';
import { BreachNeedleAttack } from '../framework/adapters/weapons/needle';
import { BreachEmitterAttack } from '../framework/adapters/weapons/emitter';
import { BreachBombardaAttack } from '../framework/adapters/weapons/bombarda';
import { BreachWeaponTiming, comboCadence, fistComboAvailable } from '../framework/adapters/weapons/timing';
import { BreachLaser } from '../framework/adapters/weapons/laser';
import { BreachWeaponRenderer } from '../framework/adapters/weapons/renderer';
import { BreachWeaponEffects } from '../framework/adapters/weapons/effects';
import { isBreachUpgradeActive } from '../framework/adapters/breachUpgradeActivity';
import { isSpecialUpgradeActive } from '../framework/adapters/breachSpecialUpgrades';
import { areaDistance, selectItemsInArea } from '../framework/world/area';
import type { TileArea } from '../framework/world/area';

/** Плавное затухание по расстоянию с учётом площади расширенного луча. */
export function splashMultiplier(distance: number, radius: number, spreadLevel: number): number {
  if (distance === 0) return 1;
  if (distance > radius) return 0;
  const t = distance / (radius + 1);
  const ease = 1 - t * t * (3 - 2 * t);
  return Math.min(1, ease * ease * (1 + spreadLevel * C.emitterSpreadBonus * 2) / Math.sqrt(radius));
}

export function emitterBlastRadius(level: number): number {
  return C.rangedBlastRadius + level;
}

function fistComboRadius(state: BreachState, level = state.fistComboRadiusLevel): number {
  let radius = C.comboFistRadius;
  const levelCap = C.comboFistRadiusMaxLevel + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0);
  for (let currentLevel = 1; currentLevel <= Math.min(level, levelCap); currentLevel++) {
    radius += C.comboFistRadiusPerLevel[currentLevel] ?? 1;
  }
  return Math.min(C.comboFistRadiusMax + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0), radius);
}

export function fistComboDamageMultiplier(distance: number, radius: number): number {
  const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
  const eased = t * t * (3 - 2 * t);
  const distanceMultiplier = 1 - (1 - C.comboFistEdgeDamageMultiplier) * eased;
  return distanceMultiplier;
}

export class Weapons {
  constructor(private readonly rangedTargeting: BreachRangedTargeting = new RearDensityTargeting()) {}
  private readonly attacks: Record<BreachAttackId, BreachAttack> = {
    fists: new BreachFistsAttack(), pick: new BreachPickAttack(), spear: new BreachSpearAttack(),
    needle: new BreachNeedleAttack(), emitter: new BreachEmitterAttack(), bombarda: new BreachBombardaAttack(),
  };
  private readonly timing = new BreachWeaponTiming();
  private readonly renderer = new BreachWeaponRenderer();
  private readonly effects = new BreachWeaponEffects();
  private resolveUpgradeStat?: (base: number, key: string) => number;
  private resolveAreaDamage?: (state: BreachState, stones: readonly Stone[], area: TileArea,
    damage: (stone: Readonly<Stone>, distance: number) => number, hit: (stone: Stone, damage: number) => void) => void;
  setAreaDamageResolver(resolve: NonNullable<Weapons['resolveAreaDamage']>): void { this.resolveAreaDamage = resolve; }
  private damageArea(state: BreachState, stones: readonly Stone[], area: TileArea,
    damage: (stone: Readonly<Stone>, distance: number) => number, hit: (stone: Stone, damage: number) => void): void {
    if (this.resolveAreaDamage) return this.resolveAreaDamage(state, stones, area, damage, hit);
    for (const stone of selectItemsInArea(stones, area, item => item)) {
      const amount = damage(stone, areaDistance(area, stone));
      if (amount > 0) hit(stone, amount);
    }
  }
  private resolveUpgradeLevel?: (id: string, fallback: number) => number;
  setUpgradeResolver(stat: (base: number, key: string) => number, level: (id: string, fallback: number) => number): void {
    this.resolveUpgradeStat = stat;
    this.resolveUpgradeLevel = level;
    this.timing.setUpgradeResolver(stat);
  }
  baseDamage(state: BreachState, weapon: BreachAttackId): number {
    const id = weapon === 'bombarda' ? 'emitter' : weapon;
    const base = id === 'fists' ? C.fistDamage : id === 'pick' ? C.baseMeleeDamage : id === 'spear' ? C.spearDamage : id === 'needle' ? C.needleDamage : C.rangedDamage;
    const extra = id === 'fists' ? state.fistLevel * C.fistDamagePerLevel : id === 'pick' ? state.pickLevel : id === 'spear' ? state.spearLevel * C.spearDamagePerLevel : id === 'needle' ? state.needleLevel * C.needleDamagePerLevel : state.rangedLevel * C.rangedDamagePerLevel;
    return this.resolveUpgradeStat?.(base, `weapon.${id}.baseDamage`) ?? base + extra;
  }
  damageMultiplier(state: BreachState, category: 'melee' | 'ranged'): number {
    return this.resolveUpgradeStat?.(1, `weapon.${category}.output`) ?? ((category === 'melee' ? isCycleUpgradeActive(state, 'cycle1') : isCycleUpgradeActive(state, 'cycle5')) ? 1.5 : 1);
  }
  upgradeLevel(id: string, fallback: number): number { return this.resolveUpgradeLevel?.(id, fallback) ?? fallback; }
  radius(state: BreachState, weapon: 'pick' | 'spear' | 'emitter'): number {
    const base = weapon === 'pick' ? C.pickRadius : weapon === 'spear' ? C.spearRadius : C.rangedBlastRadius;
    const extra = weapon === 'pick' ? state.pickReachLevel * C.pickRadiusPerLevel : weapon === 'spear' ? state.spearReachLevel * C.spearRadiusPerLevel : state.emitterAreaLevel;
    return this.resolveUpgradeStat?.(base, `weapon.${weapon}.radius`) ?? base + extra;
  }
  replaceAttack(id: BreachAttackId, attack: BreachAttack): void { this.attacks[id] = attack; }
  private readonly laserModule = new BreachLaser();
  private get beam(): { x: number; y: number } | null { return this.laserModule.position; }
  private get beamTarget(): { x: number; y: number } | null { return this.laserModule.target; }
  beamPosition(): { x: number; y: number } | null { return this.beam ? { ...this.beam } : null; }
  spearDashActorPosition(offset: number): { x: number; y: number } | null {
    return this.effects.spearActorPosition(offset);
  }
  canHit(_state: BreachState, _stone: Stone): boolean { return true; }
  speedMultiplier(state: BreachState, weapon: WeaponId): number { return this.timing.speedMultiplier(state, weapon); }
  needleSpeedMultiplier(state: BreachState): number { return this.timing.needleSpeedMultiplier(state); }
  private masteryMultiplier(state: BreachState, weapon: keyof BreachState['weaponMasteries']): number {
    return isBreachUpgradeActive(state, `${weapon}Mastery`, state.weaponMasteries[weapon], ['weapon', 'mastery']) ? C.weaponMasteries[weapon].damageMultiplier : 1;
  }
  private fistDamage(state: BreachState): number {
    const level = this.resolveUpgradeLevel?.('melee', state.fistLevel) ?? state.fistLevel;
    return this.baseDamage(state, 'fists') / Math.max(1, level + 1);
  }
  private fistStoneDamage(state: BreachState): number {
    const level = this.resolveUpgradeLevel?.('melee', state.fistLevel) ?? state.fistLevel;
    return this.fistDamage(state) * Math.max(1, level + 1);
  }
  currentMeleeDamage(state: BreachState): number {
    const meleePower = this.damageMultiplier(state, 'melee');
    const rangedPower = this.damageMultiplier(state, 'ranged');
    if (state.weapon === 'bombarda') return this.baseDamage(state, 'bombarda') * rangedPower;
    if (state.weapon === 'spear') return this.baseDamage(state, 'spear') * this.masteryMultiplier(state, 'spear') * meleePower;
    if (state.weapon === 'pick') return this.baseDamage(state, 'pick') * this.masteryMultiplier(state, 'pick') * meleePower;
    return this.fistDamage(state) * (isSpecialUpgradeActive(state, 'fistUnique') ? 1.5 : 1) * this.masteryMultiplier(state, 'fist') * meleePower;
  }
  advanceAnimation(dt: number): void {
    this.effects.tick(dt);
  }
  dash(fromX: number, fromY: number, toX: number, toY: number): void {
    this.effects.dash({ fromX, fromY, toX, toY });
  }
  tick(state: BreachState, dt: number, speed: number, weapon: WeaponId = state.weapon): number { return this.timing.tick(state, dt, speed, weapon); }
  interactionRange(state: BreachState): number { return this.timing.interactionRange(state); }
  spearWindup(state: BreachState, stones: readonly Stone[], hit: (stone: Stone, damage: number) => void): void {
    const damage = this.baseDamage(state, 'spear') * this.masteryMultiplier(state, 'spear') * this.damageMultiplier(state, 'melee');
    const radius = Math.min(C.spearRadiusMax + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0), this.radius(state, 'spear'));
    for (const stone of [...stones]) {
      const distance = Math.hypot(stone.x - state.x, stone.y - state.y);
      if (distance > radius) continue;
      const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
      const eased = t * t * (3 - 2 * t);
      hit(stone, damage * (1 - (1 - C.spearFalloffEdgeMultiplier) * eased));
    }
  }
  rangedTarget(state: BreachState, stones: readonly Stone[], damageScale = 1): { x: number; y: number } | undefined {
    const damage = this.baseDamage(state, 'emitter') * this.masteryMultiplier(state, 'emitter') * damageScale * this.damageMultiplier(state, 'ranged');
    return this.rangedTargeting.select({ state, stones, beam: this.beam, blastRadius: this.radius(state, 'emitter'), damage,
      spreadLevel: this.upgradeLevel('emitterSpread', state.emitterSpreadLevel), beamSpeedLevel: this.upgradeLevel('beamSpeed', state.beamSpeedLevel),
      canHit: stone => this.canHit(state, stone), splashMultiplier });
  }

  stopBeam(): void { this.laserModule.stop(); }
  laser(state: BreachState, stones: readonly Stone[], dt: number, speed: number, hit: (stone: Stone, damage: number) => void): void {
    this.laserModule.tick({ state, stones, seconds: dt, speed, target: damageScale => this.rangedTarget(state, stones, damageScale),
      emitterMastery: () => this.masteryMultiplier(state, 'emitter'), baseDamage: () => this.baseDamage(state, 'emitter'),
      rangedMultiplier: () => this.damageMultiplier(state, 'ranged'), blastRadius: () => this.radius(state, 'emitter'),
      spreadLevel: this.upgradeLevel('emitterSpread', state.emitterSpreadLevel), beamSpeedLevel: this.upgradeLevel('beamSpeed', state.beamSpeedLevel), splashMultiplier, hit,
      damageArea: (area, damage, apply) => this.damageArea(state, stones, area, damage, apply) });
  }

  strike(state: BreachState, target: Pick<Stone, 'x' | 'y'>, stones: readonly Stone[], hit: (stone: Stone, damage: number, area?: boolean, splash?: boolean) => void, weapon: WeaponId = state.weapon, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null, pickDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const angle = Math.atan2(target.y - state.y, target.x - state.x);
    const combo = weapon !== 'ranged' && weapon !== 'bombarda' && state.combos[weapon] && (weapon === 'fists' ? fistComboAvailable(state) : state.challenge2Completed);
    const comboCount = combo ? ++state.comboCounts[weapon as 'fists' | 'pick' | 'spear'] : 0;
    const chargedDash = weapon === 'pick' ? state.pickDashCharge >= 1 : weapon === 'spear' && state.spearDashCharge >= 1;
    const special = combo && (comboCount % comboCadence(state, weapon as 'fists' | 'pick' | 'spear') === 0 || chargedDash);
    const suppressSplash = state.challengeArena && !CHALLENGE_RULES[state.challengeNumber].weaponSplash && !special;
    this.effects.attack(weapon, angle, target.x, target.y, special, spearDashPath);
    if (special && weapon === 'pick') state.pickDashCharge = 0;
    if (special && weapon === 'spear') state.spearDashCharge = 0;
    const attack = weapon === 'ranged' ? state.rangedWeapon : weapon;
    const weapons = this;
    this.attacks[attack].strike({ state, target, stones, hit, special, suppressSplash, angle, spearDashPath, pickDashPath,
      damageArea: (area, damage, apply) => this.damageArea(state, stones, area, damage, apply),
      get baseDamage() { return weapons.baseDamage(state, attack); },
      get meleeMultiplier() { return weapons.damageMultiplier(state, 'melee'); },
      get rangedMultiplier() { return weapons.damageMultiplier(state, 'ranged'); },
      get pickRadius() { return weapons.radius(state, 'pick'); }, get spearRadius() { return weapons.radius(state, 'spear'); },
      get emitterRadius() { return weapons.radius(state, 'emitter'); },
      get fistFinisherLevel() { return weapons.upgradeLevel('fistFinisher', state.fistFinisherLevel); },
      get needlePierceLevel() { return weapons.upgradeLevel('needlePierce', state.needlePierceLevel); },
      get emitterSpreadLevel() { return weapons.upgradeLevel('emitterSpread', state.emitterSpreadLevel); },
      get fistStoneDamage() { return weapons.fistStoneDamage(state); },
      get fistComboRadius() { return fistComboRadius(state, weapons.upgradeLevel('fistComboRadius', state.fistComboRadiusLevel)); },
      fistComboDamageMultiplier,
      mastery: item => this.masteryMultiplier(state, item), splashMultiplier });
  }

  draw(g: Phaser.GameObjects.Graphics, state: BreachState, tile: number, px: (x: number) => number, py: (y: number) => number, pickSprite: Phaser.GameObjects.Image, spearSprite: Phaser.GameObjects.Image, visual: { x: number; y: number; alpha: number; previousBeam: { x: number; y: number } | null; offset: number }): void {
    this.renderer.draw(g, state, tile, px, py, pickSprite, spearSprite, visual,
      { animations: this.effects.animations, dashes: this.effects.dashes, beam: this.beam, beamTarget: this.beamTarget, emitterBlastRadius: () => this.radius(state, 'emitter') });
  }
}

