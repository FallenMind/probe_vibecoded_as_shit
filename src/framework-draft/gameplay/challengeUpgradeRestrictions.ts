import type { ChallengeRules } from '../core/gameplay';
import type { StateAccess } from '../core/contracts';
import type { DeepReadonly, GameState } from '../core/model';
import { clearUpgradeSuppression } from '../upgrades/upgradeModule';

export interface ChallengeUpgradeFilter {
  all?: boolean;
  upgradeIds?: readonly string[];
  tags?: readonly string[];
}

/** Декоратор испытания: ограничения действуют от входа до выхода и не меняют выбор игрока. */
export class ChallengeWithUpgradeRestrictions implements ChallengeRules {
  readonly id: string;
  private readonly source: string;
  private readonly filter: ChallengeUpgradeFilter;
  constructor(private readonly rules: ChallengeRules, filter: ChallengeUpgradeFilter) {
    if (!rules.id) throw new Error('Испытанию нужен id');
    this.id = rules.id;
    this.source = `challenge:${rules.id}`;
    this.filter = { all: filter.all ?? false, upgradeIds: [...(filter.upgradeIds ?? [])], tags: [...(filter.tags ?? [])] };
  }
  enter(bus: StateAccess): void {
    if (Object.hasOwn(bus.read().upgradeSuppressions, this.source)) throw new Error(`Испытание уже активно: ${this.id}`);
    if (!bus.invoke('upgrades', { type: 'set-suppression', payload: { source: this.source, ...this.filter } })) {
      throw new Error(`Не удалось применить ограничения испытания: ${this.id}`);
    }
    try { this.rules.enter(bus); } catch (error) { clearUpgradeSuppression(bus, this.source); throw error; }
  }
  tick(bus: StateAccess, seconds: number): void { this.rules.tick(bus, seconds); }
  isComplete(state: DeepReadonly<GameState>): boolean { return this.rules.isComplete(state); }
  leave(bus: StateAccess): void {
    if (bus.read().paused) throw new Error('Нельзя выйти из испытания на паузе');
    if (!Object.hasOwn(bus.read().upgradeSuppressions, this.source)) throw new Error(`Испытание не активно: ${this.id}`);
    try { this.rules.leave(bus); } finally { clearUpgradeSuppression(bus, this.source); }
  }
}
