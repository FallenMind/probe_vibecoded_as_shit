import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachAttack, BreachAttackContext } from './contracts';

export class BreachEmitterAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, target, stones, hit } = c;
    const damage = c.baseDamage * c.mastery('emitter') * c.rangedMultiplier;
    if (c.suppressSplash) {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) hit(stone, damage);
      return;
    }
    const radius = c.emitterRadius + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
    const spreadLevel = c.emitterSpreadLevel;
    c.damageArea({ shape: 'circle', center: { x: target.x, y: target.y }, radius },
      (_stone, distance) => damage * c.splashMultiplier(distance, radius, spreadLevel),
      (stone, amount) => hit(stone, amount, true, true));
  }
}

