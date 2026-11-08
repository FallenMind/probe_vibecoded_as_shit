import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachAttack, BreachAttackContext } from './contracts';
import { isSpectraUpgradeActive } from '../breachSpectraUpgrades';

export class BreachBombardaAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, target, stones, hit } = c;
    const damage = c.baseDamage * (isSpectraUpgradeActive(state, 'twin') ? 1.35 : 1) * c.rangedMultiplier;
    const radius = 2 + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
    if (c.suppressSplash) {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) hit(stone, damage);
      return;
    }
    c.damageArea({ shape: 'circle', center: { x: target.x, y: target.y }, radius },
      (_stone, distance) => damage * c.splashMultiplier(distance, radius, 0),
      (stone, amount) => hit(stone, amount, true, true));
  }
}
