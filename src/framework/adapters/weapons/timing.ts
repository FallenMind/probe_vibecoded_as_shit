import { isCycleUpgradeActive } from '../breachCycleEffects';
import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import { CHALLENGE_RULES } from '../../../game/challengeConfig';
import type { BreachState, WeaponId } from '../../../game/breachTypes';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';
import { isSpectraUpgradeActive } from '../breachSpectraUpgrades';

export function comboCadence(state: BreachState, weapon: 'fists' | 'pick' | 'spear'): number {
  return C.comboAttackCount - (weapon !== 'fists' && isCycleUpgradeActive(state, 'cycle6') ? 2 : 0);
}
export function fistComboAvailable(state: BreachState): boolean {
  return isSpecialUpgradeActive(state, 'fistCombo') || (state.challengeArena && state.challengeNumber === 2);
}

/** Вычисляет скорость и длительность удара; часы живут в состоянии персонажа. */
export class BreachWeaponTiming {
  private resolveStat?: (base: number, key: string) => number;
  setUpgradeResolver(resolveStat: (base: number, key: string) => number): void { this.resolveStat = resolveStat; }
  private weaponSpeed(id: string, level: number, gain: number): number {
    return this.resolveStat?.(1, `weapon.${id}.speed`) ?? (1 + level * gain);
  }
  speedMultiplier(state: BreachState, weapon: WeaponId): number {
    const challengeSpeed = state.challengeArena ? CHALLENGE_RULES[state.challengeNumber].attackSpeedMultiplier : 1;
    const cycleSpeed = 1 + (isCycleUpgradeActive(state, 'cycle12') ? 0.1 : 0) + (isSpectraUpgradeActive(state, 'twin') ? 0.35 : 0);
    const clickFraction = Math.min(1, state.clickBuffer / (C.clickBufferCapacity * (isCycleUpgradeActive(state, 'cycle15') ? 1.1 : 1)));
    const clickBonus = clickFraction * C.clickMiningSpeedMaxBonus;
    if (weapon === 'ranged') {
      const level = state.rangedWeapon === 'needle' ? state.needleSpeedLevel : state.emitterSpeedLevel;
      const gain = state.rangedWeapon === 'needle' ? C.needleAttackSpeedPerLevel : C.emitterAttackSpeedPerLevel;
      const emitterBonus = state.rangedWeapon === 'emitter' && isSpecialUpgradeActive(state, 'emitterPierce') ? clickFraction * C.emitterClickSpeedMaxBonus : 0;
      const needleBonus = state.rangedWeapon === 'needle' && isCycleUpgradeActive(state, 'cycle2') ? 1.5 : 1;
      return this.weaponSpeed(state.rangedWeapon, level, gain) * (1 + clickBonus) * (1 + emitterBonus) * challengeSpeed * cycleSpeed * needleBonus;
    }
    const level = weapon === 'fists' ? state.fistSpeedLevel : weapon === 'pick' ? state.pickSpeedLevel : weapon === 'spear' ? state.spearSpeedLevel : state.rangedLevel;
    const gain = weapon === 'fists' ? C.fistAttackSpeedPerLevel : weapon === 'pick' ? C.pickAttackSpeedPerLevel : weapon === 'spear' ? C.spearAttackSpeedPerLevel : C.needleAttackSpeedPerLevel;
    const baseSpeed = weapon === 'bombarda' ? 1 + level * gain : this.weaponSpeed(weapon, level, gain);
    return baseSpeed * (1 + clickBonus) * challengeSpeed * cycleSpeed;
  }
  needleSpeedMultiplier(state: BreachState): number {
    const clickFraction = Math.min(1, state.clickBuffer / (C.clickBufferCapacity * (isCycleUpgradeActive(state, 'cycle15') ? 1.1 : 1)));
    return this.weaponSpeed('needle', state.needleSpeedLevel, C.needleAttackSpeedPerLevel) * (1 + clickFraction * C.clickMiningSpeedMaxBonus) * (isCycleUpgradeActive(state, 'cycle2') ? 1.5 : 1);
  }
  tick(state: BreachState, dt: number, speed: number, weapon: WeaponId = state.weapon): number {
    let interval = weapon === 'ranged' ? (state.rangedWeapon === 'needle' ? C.needleInterval : C.rangedInterval) : weapon === 'pick' ? C.pickInterval : weapon === 'spear' ? C.spearInterval : C.attackInterval;
    if (weapon === 'fists' && fistComboAvailable(state) && state.combos.fists && state.comboCounts.fists % comboCadence(state, 'fists') === comboCadence(state, 'fists') - 1) interval *= 2;
    const charged = weapon === 'spear'
      ? state.challenge2Completed && state.combos.spear && (state.comboCounts.spear % comboCadence(state, 'spear') === comboCadence(state, 'spear') - 1 || state.spearDashCharge >= 1)
      : weapon === 'pick' && state.challenge2Completed && state.combos.pick && (state.comboCounts.pick % comboCadence(state, 'pick') === comboCadence(state, 'pick') - 1 || state.pickDashCharge >= 1);
    if (!isCycleUpgradeActive(state, 'cycle6') && weapon === 'spear' && charged) interval *= C.spearComboWaitMultiplier;
    if (!isCycleUpgradeActive(state, 'cycle6') && weapon === 'pick' && charged) interval *= 2;
    const clock = weapon === 'ranged' ? 'rangedClock' : 'attackClock';
    state[clock] += dt * speed / interval;
    const attacks = Math.floor(state[clock] + 1e-9);
    state[clock] = Math.max(0, state[clock] - attacks);
    return attacks;
  }
  interactionRange(state: BreachState): number {
    return C.meleeRange + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
  }
}
