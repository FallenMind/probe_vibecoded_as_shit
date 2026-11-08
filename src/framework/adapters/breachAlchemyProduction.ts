import { isCycleUpgradeActive } from './breachCycleEffects';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, alchemyTickSeconds, airProductionTickSeconds } from '../../game/alchemy';
import type { AlchemyNode } from '../../game/alchemy';
import type { BreachState } from '../../game/breachTypes';
import type { AlchemyProduction } from '../alchemy/contracts';
import { BreachAlchemyConversions } from '../alchemy/breachConversions';
import { isAlchemyUpgradeActive } from './breachAlchemyUpgrades';

/** Переходный адаптер: работает с единственным состоянием старого сохранения. */
export interface BreachAlchemyHost {
  readonly state: BreachState;
  isResetting(): boolean;
  isUnlocked(node: AlchemyNode): boolean;
}

export class BreachAlchemyProduction implements AlchemyProduction {
  private readonly conversions = new BreachAlchemyConversions();
  constructor(private readonly host: BreachAlchemyHost) {}
  private capacity(resource: 'earth' | 'water' | 'air' | 'fire'): number {
    const s = this.host.state;
    return alchemyCapacity(s.alchemy, resource, id => isAlchemyUpgradeActive(s, id));
  }

  craftWater(): boolean {
    const s = this.host.state;
    const a = s.alchemy;
    const recipe = A.waterRecipe;
    const amount = this.conversions.water(a.earth, a.elementalStone, a.water, this.capacity('water'), recipe.fraction, recipe.elementalPerWater);
    if (s.paused || this.host.isResetting() || !this.host.isUnlocked('water') || amount < 1) return false;
    a.earth -= amount;
    a.elementalStone -= amount * recipe.elementalPerWater;
    a.water += amount;
    if (s.challengeArena && s.challengeNumber === 3) s.challenge3WaterProduced = true;
    return true;
  }

  tick(dt: number): void {
    const s = this.host.state;
    const a = s.alchemy;
    const earth = A.earthRecipe;
    if (a.earthEnabled && this.host.isUnlocked('earth') && a.stone >= 1 && a.earth < this.capacity('earth')) {
      a.earthClock += dt;
      const seconds = alchemyTickSeconds(a, 'earth', id => isAlchemyUpgradeActive(s, id)) * (isCycleUpgradeActive(s, 'cycle11') ? 0.95 : 1);
      while (a.earthClock + 1e-9 >= seconds && a.stone >= 1 && a.earth < this.capacity('earth')) {
        a.earthClock = Math.max(0, a.earthClock - seconds);
        const amount = this.conversions.earth(a.stone, a.earth, this.capacity('earth'), earth.fraction);
        a.stone -= amount; a.earth += amount;
      }
      if (a.stone < 1 || a.earth >= this.capacity('earth')) a.earthClock = 0;
    } else a.earthClock = 0;

    if (a.waterEnabled && this.host.isUnlocked('water') && a.earth >= 1 && a.elementalStone >= A.waterRecipe.elementalPerWater && a.water < this.capacity('water')) {
      a.waterClock += dt;
      const seconds = alchemyTickSeconds(a, 'water', id => isAlchemyUpgradeActive(s, id)) * (isCycleUpgradeActive(s, 'cycle11') ? 0.95 : 1);
      while (a.waterClock + 1e-9 >= seconds) {
        a.waterClock = Math.max(0, a.waterClock - seconds);
        if (!this.craftWater()) { a.waterClock = 0; break; }
      }
    } else a.waterClock = 0;

    if (a.airProductionEnabled && this.host.isUnlocked('air') && a.water >= A.airRecipe.waterPerAir && a.air < this.capacity('air')) {
      a.airProductionClock += dt;
      const challengeAirBonus = s.challengeArena && s.challengeNumber === 3 ? 0.5 : 1;
      const airTickSeconds = airProductionTickSeconds(a, id => isAlchemyUpgradeActive(s, id)) * challengeAirBonus * (isCycleUpgradeActive(s, 'cycle11') ? 0.95 : 1);
      while (a.airProductionClock + 1e-9 >= airTickSeconds && a.water >= A.airRecipe.waterPerAir && a.air < this.capacity('air')) {
        a.airProductionClock = Math.max(0, a.airProductionClock - airTickSeconds);
        a.water -= A.airRecipe.waterPerAir;
        a.air = Math.min(this.capacity('air'), a.air + 1);
        if (s.challengeArena && s.challengeNumber === 3) s.challenge3AirProduced = true;
      }
    } else a.airProductionClock = 0;

    if (this.host.isUnlocked('fire') && a.fire > 0) {
      const cycleMultiplier = ALCHEMY_UPGRADES.reduce((multiplier, upgrade) =>
        upgrade.fireCycleMultiplier && isAlchemyUpgradeActive(s, upgrade.id) ? multiplier * upgrade.fireCycleMultiplier : multiplier, 1);
      const seconds = A.fireCycle.seconds * cycleMultiplier;
      const canFeedFire = a.earth >= A.fireCycle.earthCostPerTick && a.air >= A.fireCycle.airCostPerTick;
      if (canFeedFire) a.fireClock += dt;
      else a.fireClock = 0;
      while (a.fireClock + 1e-9 >= seconds && a.earth >= A.fireCycle.earthCostPerTick && a.air >= A.fireCycle.airCostPerTick) {
        a.fireClock = Math.max(0, a.fireClock - seconds);
        // Запас, ставший выше лимита при подавлении улучшения, не уничтожается.
        const earthLimit = Math.max(a.earth, this.capacity('earth'));
        const waterLimit = Math.max(a.water, this.capacity('water'));
        const airLimit = Math.max(a.air, this.capacity('air'));
        a.earth -= A.fireCycle.earthCostPerTick;
        a.air -= A.fireCycle.airCostPerTick;
        a.stone += A.fireCycle.stonePerTick;
        a.elementalStone += A.fireCycle.elementalPerTick;
        a.earth = Math.min(earthLimit, a.earth + A.fireCycle.earthPerTick);
        a.water = Math.min(waterLimit, a.water + A.fireCycle.waterPerTick);
        a.air = Math.min(airLimit, a.air + A.fireCycle.airPerTick);
      }
    } else a.fireClock = 0;
  }
}
