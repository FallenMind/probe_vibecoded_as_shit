import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachAttack, BreachAttackContext } from './contracts';

export class BreachNeedleAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, target, stones, hit } = c;
    const stone = stones.find(item => item.x === target.x && item.y === target.y);
    const damage = c.baseDamage * c.mastery('needle') * c.rangedMultiplier;
    if (stone) hit(stone, damage);
    const next = stones.find(item => item.x === target.x && item.y === target.y - 1);
    if (next && c.needlePierceLevel > 0) hit(next, damage * Math.min(1, c.needlePierceLevel * C.needlePierceBonus));
  }
}

