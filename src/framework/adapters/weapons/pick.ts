import { isCycleUpgradeActive } from '../breachCycleEffects';
import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachAttack, BreachAttackContext } from './contracts';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';

export class BreachPickAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, stones, target, hit, special } = c;
    const baseDamage = c.baseDamage * c.mastery('pick') * c.meleeMultiplier;
    const damage = baseDamage * (special ? 3 : 1);
    const pickRadius = c.pickRadius;
    state.pickDash = special;
    const threshold = Math.cos(C.pickArcDegrees * Math.PI / 360);
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    if (c.suppressSplash) {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) hit(stone, damage, false, true);
      return;
    }
    const path = c.pickDashPath;
    if (special && isSpecialUpgradeActive(state, 'pickInfinity') && path) {
      const radius = Math.min(C.pickRadiusMax + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0), pickRadius) + C.pickBlastBonusRadius;
      for (const center of [{ x: path.fromX, y: path.fromY }, { x: path.toX, y: path.toY }]) {
        c.damageArea({ shape: 'circle', center, radius }, (stone, distance) => {
          const falloff = Math.max(0, 1 - distance / Math.max(1, radius)) ** C.pickBlastFalloffExponent;
          return Math.min(stone.hp * 0.5, baseDamage * 2) * falloff;
        }, (stone, amount) => hit(stone, amount, true, true));
      }
      return;
    }
    const bonus = state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0;
    const regularRadius = Math.min(C.pickRadiusMax + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0) + bonus, pickRadius + bonus);
    const reach = regularRadius + (special ? C.pickBlastBonusRadius : 0);
    c.damageArea({ shape: 'circle', center: { x: state.x, y: state.y }, radius: reach }, (stone, distance) => {
      const dx = stone.x - state.x, dy = stone.y - state.y;
      if (distance > reach || (!special && distance >= 0.001 && (dx * fx + dy * fy) / distance < threshold)) return 0;
      if (special) {
        const falloff = Math.max(0, 1 - distance / Math.max(1, reach)) ** C.pickBlastFalloffExponent;
        return damage * falloff;
      }
      const falloff = Math.max(0, Math.min(1, (distance - C.meleeRange) / Math.max(0.01, reach - C.meleeRange)));
      return damage * (1 - (1 - C.pickMinDamageMultiplier) * falloff ** C.pickFalloffExponent);
    }, (stone, amount) => hit(stone, amount, special, true));
  }
}
