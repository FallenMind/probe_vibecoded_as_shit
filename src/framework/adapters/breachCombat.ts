import type { BreachState, Stone } from '../../game/breachTypes';
import { BreachDamagePolicy } from '../combat/breachDamage';
import { isCycleUpgradeActive } from './breachCycleEffects';
import { isSpecialUpgradeActive } from './breachSpecialUpgrades';
import { isSpectraUpgradeActive } from './breachSpectraUpgrades';

export interface BreachHitOptions {
  weaponHit: boolean; earthHit: boolean; ignoreArmor: boolean; splash: boolean; elementalPierce: boolean; flashColor: number;
}
export interface BreachHitProcessor { hit(stone: Stone, amount: number, options: BreachHitOptions): void }
export interface BreachCombatHost {
  readonly state: BreachState;
  canHit(stone: Stone): boolean;
  armorPenetration(): number;
  earthUnlocked(): boolean;
  destroy(stone: Stone): void;
}

/** Владельцы мира и ресурсов остаются снаружи: боевую механику можно заменить целиком. */
export class BreachCombat implements BreachHitProcessor {
  constructor(private readonly host: BreachCombatHost, private readonly policy: BreachDamagePolicy) {}
  hit(stone: Stone, amount: number, options: BreachHitOptions): void {
    const s = this.host.state;
    if (!options.ignoreArmor && !this.host.canHit(stone)) return;
    const { damage, empowered, earthCost } = this.policy.calculate({
      kind: stone.kind, amount, splash: options.splash, weaponHit: options.weaponHit,
      elementalPierce: options.elementalPierce, armorPenetration: this.host.armorPenetration(),
      earthHit: options.earthHit, earthEnabled: s.alchemy.pickEnabled && this.host.earthUnlocked(), earthAvailable: s.alchemy.earth,
      earthOptimized: isSpecialUpgradeActive(s, 'pickOptimization'), challengeMultiplier: s.challengeArena && s.challengeNumber === 4 ? s.challenge4DamageMultiplier : 1,
      hardBonus: isCycleUpgradeActive(s, 'cycle10') ? 0.1 : 0, elementalBonus: isCycleUpgradeActive(s, 'cycle14') ? 0.1 : 0,
      globalBonus: isSpectraUpgradeActive(s, 'spectrumDrive') ? 0.2 : 0,
    });
    if (damage > 0) { stone.damageFlash = 1; stone.damageFlashColor = options.flashColor; }
    stone.hp -= damage;
    if (stone.hp <= 0) {
      if (empowered) s.alchemy.earth -= earthCost;
      this.host.destroy(stone);
    }
  }
}
