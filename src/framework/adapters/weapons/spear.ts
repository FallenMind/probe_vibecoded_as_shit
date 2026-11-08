import { isCycleUpgradeActive } from '../breachCycleEffects';
import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { Stone } from '../../../game/breachTypes';
import type { BreachAttack, BreachAttackContext } from './contracts';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';

export class BreachSpearAttack implements BreachAttack {
  strike(c: BreachAttackContext): void {
    const { state, stones, target, hit } = c;
    const damage = c.baseDamage * c.mastery('spear') * c.meleeMultiplier;
    if (c.suppressSplash) {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) hit(stone, damage, false, true);
      return;
    }
    const bonus = state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0;
    const radius = Math.min(C.spearRadiusMax + (isCycleUpgradeActive(state, 'cycle3') ? 2 : 0) + bonus, c.spearRadius + bonus);
    const falloff = (distance: number) => {
      const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
      const eased = t * t * (3 - 2 * t);
      return 1 - (1 - C.spearFalloffEdgeMultiplier) * eased;
    };
    const hitStones = new Set<Stone>();
    const path = c.spearDashPath;
    if (c.special && isSpecialUpgradeActive(state, 'spearEnchant') && path) {
      const dx = path.toX - path.fromX, dy = path.toY - path.fromY, length = Math.hypot(dx, dy);
      if (length > 0) for (const stone of [...stones]) {
        const x = stone.x - path.fromX, y = stone.y - path.fromY;
        const along = (x * dx + y * dy) / length, across = Math.abs(x * dy - y * dx) / length;
        if (along >= 0 && along <= length && across <= 0.75) { hit(stone, damage * falloff(across), true, true); hitStones.add(stone); }
      }
    }
    c.damageArea({ shape: 'circle', center: { x: state.x, y: state.y }, radius },
      (_stone, distance) => distance <= radius ? damage * falloff(distance) : 0,
      (stone, amount) => { if (!hitStones.has(stone)) hit(stone, amount, true, true); });
  }
}
