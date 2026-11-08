import type { BreachState } from '../../game/breachTypes';

/** Проверка владельца механики: покупка, личный выбор и все независимые ограничения. */
export function isBreachUpgradeActive(state: BreachState, id: string, purchased: boolean, tags: readonly string[]): boolean {
  if (!purchased || state.frameworkUpgradeEnabled?.[id] === false) return false;
  return !Object.values(state.frameworkUpgradeSuppressions ?? {}).some(rule =>
    rule.all || rule.upgradeIds.includes(id) || rule.tags.some(tag => tags.includes(tag)));
}
