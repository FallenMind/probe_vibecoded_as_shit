import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachAttack, BreachAttackContext } from './contracts';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';

export class BreachFistsAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, stones, target, hit } = c;
    const bonus = isSpecialUpgradeActive(state, 'fistUnique') ? 1.5 : 1;
    const damage = c.fistStoneDamage * bonus * c.mastery('fist') * c.meleeMultiplier;
    if (c.special) {
      const radius = c.fistComboRadius + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
      c.damageArea({ shape: 'circle', center: { x: state.x, y: state.y }, radius },
        (_stone, distance) => distance <= radius ? damage * c.fistComboDamageMultiplier(distance, radius) : 0,
        (stone, amount) => hit(stone, amount, true, true));
      return;
    }
    const stone = stones.find(item => item.x === target.x && item.y === target.y);
    if (stone) hit(stone, damage * (stone.hp <= stone.maxHp / 2 ? 1 + c.fistFinisherLevel * C.fistFinisherBonus : 1));
  }
}
