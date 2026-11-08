import type { BreachState } from '../../game/breachTypes';
import { isBreachUpgradeActive } from './breachUpgradeActivity';

/** Эффект не применяется, если его купленный уровень временно подавлен испытанием. */
export function isCycleUpgradeActive(state: BreachState, id: string): boolean {
  const tags = id === 'cycle1' || id === 'cycle5' ? ['cycle', 'damage'] : ['cycle'];
  return isBreachUpgradeActive(state, id, !!state.cycleUpgrades[id], tags);
}
