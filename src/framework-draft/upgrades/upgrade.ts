import type { StateAccess, Upgrade } from '../core/contracts';
import type { DeepReadonly, ResourceAmounts, UpgradeSuppression } from '../core/model';

export type BuffStage = 'baseFlat' | 'mult' | 'exitFlat' | 'outputMult';
export interface NumericUpgradeEffect {
  type: 'stat';
  key: string;
  stage: BuffStage;
  value: number;
  /** Для множителей: 1.1 на двух уровнях даёт 1.2 или 1.21. */
  stacking?: 'linear' | 'compound';
}

/** Данные особого правила. Его смысл и применение принадлежат модулю механики. */
export interface MechanicUpgradeEffect {
  key: string;
  target: { kind: 'game' | 'weapon' | 'character' | 'map' | 'alchemy'; id?: string };
  parameters: Readonly<Record<string, number | string | boolean>>;
  priority: number;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: ResourceAmounts;
  costMultiplier: number;
  requiresUpgrades: Record<string, number>;
  requiresResources: ResourceAmounts;
  tags?: readonly string[];
  effects: readonly NumericUpgradeEffect[];
}

/** Улучшение может содержать числовые эффекты и одновременно менять правила игры. */
export interface MechanicUpgradeDefinition extends UpgradeDefinition {
  mechanicEffects: readonly MechanicUpgradeEffect[];
}
export type AnyUpgradeDefinition = UpgradeDefinition | MechanicUpgradeDefinition;
export interface UpgradeStateView {
  readonly upgradeLevels: Readonly<Record<string, number>>;
  readonly upgradeEnabled: Readonly<Record<string, boolean>>;
  readonly upgradeSuppressions?: Readonly<Record<string, DeepReadonly<UpgradeSuppression>>>;
}
export interface ActiveMechanicEffect extends MechanicUpgradeEffect { upgradeId: string; level: number }
/** Реализуется владельцем механики: улучшение не изменяет чужой объект напрямую. */
export interface MechanicEffectConsumer<T> {
  readonly key: string;
  apply(current: T, effect: ActiveMechanicEffect): T;
}

export function applyMechanicEffects<T>(initial: T, effects: readonly ActiveMechanicEffect[], consumer: MechanicEffectConsumer<T>): T {
  return effects.reduce((value, effect) => effect.key === consumer.key ? consumer.apply(value, effect) : value, initial);
}

export class RepeatableUpgrade implements Upgrade {
  readonly id: string;
  constructor(readonly definition: AnyUpgradeDefinition) { this.id = definition.id; }
  cost(level: number): ResourceAmounts {
    return Object.fromEntries(Object.entries(this.definition.baseCost).map(([id, value]) =>
      [id, Math.ceil(value * this.definition.costMultiplier ** level)]));
  }
  canBuy(bus: StateAccess): boolean {
    const state = bus.read();
    const level = state.upgradeLevels[this.id] ?? 0;
    if (state.paused || level >= this.definition.maxLevel) return false;
    for (const [id, required] of Object.entries(this.definition.requiresUpgrades)) if ((state.upgradeLevels[id] ?? 0) < required) return false;
    for (const [id, required] of Object.entries(this.definition.requiresResources)) if ((state.resources[id]?.amount ?? 0) < required) return false;
    return Object.entries(this.cost(level)).every(([id, amount]) => (state.resources[id]?.amount ?? -1) >= amount);
  }
  buy(bus: StateAccess): boolean {
    if (!this.canBuy(bus)) return false;
    const level = bus.read().upgradeLevels[this.id] ?? 0;
    if (!bus.exchange(this.cost(level), {})) return false;
    bus.update(state => {
      state.upgradeLevels[this.id] = level + 1;
      state.upgradeEnabled[this.id] ??= true;
    });
    bus.emit({ type: 'upgrade.purchased', source: 'upgrades', payload: { id: this.id, level: level + 1 } });
    return true;
  }
  setEnabled(bus: StateAccess, enabled: boolean): boolean {
    if (bus.read().paused || (bus.read().upgradeLevels[this.id] ?? 0) <= 0) return false;
    bus.update(state => { state.upgradeEnabled[this.id] = enabled; });
    bus.emit({ type: 'upgrade.enabled-changed', source: 'upgrades', payload: { id: this.id, enabled } });
    return true;
  }
}

export class OneTimeUpgrade extends RepeatableUpgrade {
  constructor(definition: Omit<UpgradeDefinition, 'maxLevel'> | Omit<MechanicUpgradeDefinition, 'maxLevel'>) {
    super({ ...definition, maxLevel: 1 });
  }
}

export function upgradeSuppressionSources(id: string, state: UpgradeStateView, tags: readonly string[] = []): string[] {
  return Object.entries(state.upgradeSuppressions ?? {})
    .filter(([, rule]) => rule.all || rule.upgradeIds.includes(id) || rule.tags.some(tag => tags.includes(tag)))
    .map(([source]) => source);
}

export function isUpgradeActive(id: string, state: UpgradeStateView, tags: readonly string[] = []): boolean {
  return (state.upgradeLevels[id] ?? 0) > 0 && state.upgradeEnabled[id] !== false && upgradeSuppressionSources(id, state, tags).length === 0;
}

/** ((base + baseFlat) × mult + exitFlat) × outputMult; порядок записей не влияет на стадии. */
export function resolveStat(base: number, keys: string | readonly string[], upgrades: readonly AnyUpgradeDefinition[], state: UpgradeStateView): number {
  const selected = typeof keys === 'string' ? new Set([keys]) : new Set(keys);
  let baseFlat = 0, mult = 1, exitFlat = 0, outputMult = 1;
  for (const upgrade of upgrades) {
    if (!isUpgradeActive(upgrade.id, state, upgrade.tags)) continue;
    const level = state.upgradeLevels[upgrade.id];
    for (const effect of upgrade.effects) {
      if (!selected.has(effect.key)) continue;
      if (effect.stage === 'baseFlat') baseFlat += effect.value * level;
      else if (effect.stage === 'exitFlat') exitFlat += effect.value * level;
      else {
        const factor = effect.stacking === 'linear' ? 1 + (effect.value - 1) * level : effect.value ** level;
        if (effect.stage === 'mult') mult *= factor;
        else outputMult *= factor;
      }
    }
  }
  return ((base + baseFlat) * mult + exitFlat) * outputMult;
}

/** Базовая механика запрашивает только активные эффекты и решает, как их применять. */
export function collectMechanicEffects(key: string, upgrades: readonly AnyUpgradeDefinition[], state: UpgradeStateView): ActiveMechanicEffect[] {
  return upgrades.flatMap(upgrade => {
    if (!isUpgradeActive(upgrade.id, state, upgrade.tags) || !('mechanicEffects' in upgrade)) return [];
    return upgrade.mechanicEffects.filter(effect => effect.key === key)
      .map(effect => ({ ...effect, upgradeId: upgrade.id, level: state.upgradeLevels[upgrade.id] }));
  }).sort((a, b) => a.priority - b.priority || a.upgradeId.localeCompare(b.upgradeId));
}
