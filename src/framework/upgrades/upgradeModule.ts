import type { GameModule, StateAccess, Upgrade } from '../core/contracts';
import type { GameCommand } from '../core/model';
import { collectMechanicEffects, isUpgradeActive, resolveStat, upgradeSuppressionSources } from './upgrade';
import type { AnyUpgradeDefinition } from './upgrade';

/** Убирает только ограничение указанного источника, сохраняя остальные. */
export function clearUpgradeSuppression(bus: StateAccess, source: string): boolean {
  if (!Object.hasOwn(bus.read().upgradeSuppressions, source)) return false;
  bus.update(state => { delete state.upgradeSuppressions[source]; });
  bus.emit({ type: 'upgrade.suppression-changed', source: 'upgrades', payload: { source, rule: null } });
  return true;
}

export class UpgradeModule implements GameModule {
  readonly id = 'upgrades';
  private readonly upgrades = new Map<string, Upgrade & { readonly definition: AnyUpgradeDefinition }>();
  private readonly definitions: AnyUpgradeDefinition[] = [];
  private readonly statsByKey = new Map<string, AnyUpgradeDefinition[]>();
  constructor(upgrades: readonly (Upgrade & { readonly definition: AnyUpgradeDefinition })[]) {
    for (const upgrade of upgrades) {
      if (this.upgrades.has(upgrade.id)) throw new Error(`Повторное улучшение: ${upgrade.id}`);
      this.upgrades.set(upgrade.id, upgrade);
      this.definitions.push(upgrade.definition);
      for (const key of new Set(upgrade.definition.effects.map(effect => effect.key))) {
        const definitions = this.statsByKey.get(key) ?? [];
        definitions.push(upgrade.definition);
        this.statsByKey.set(key, definitions);
      }
    }
  }
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type === 'buy' && typeof command.payload === 'string') return this.upgrades.get(command.payload)?.buy(bus) ?? false;
    if (command.type === 'set-enabled' && command.payload && typeof command.payload === 'object') {
      const value = command.payload as { id?: unknown; enabled?: unknown };
      return typeof value.id === 'string' && typeof value.enabled === 'boolean' && (this.upgrades.get(value.id)?.setEnabled(bus, value.enabled) ?? false);
    }
    if (command.type === 'set-suppression' && command.payload && typeof command.payload === 'object') {
      const value = command.payload as { source?: unknown; all?: unknown; upgradeIds?: unknown; tags?: unknown };
      const validList = (list: unknown): list is string[] => Array.isArray(list) && list.every(item => typeof item === 'string' && item.length > 0);
      if (typeof value.source !== 'string' || !value.source.trim() || ['__proto__', 'constructor', 'prototype'].includes(value.source) ||
        (value.all !== undefined && typeof value.all !== 'boolean') ||
        (value.upgradeIds !== undefined && !validList(value.upgradeIds)) || (value.tags !== undefined && !validList(value.tags))) return false;
      const source = value.source;
      const rule = { all: value.all === true, upgradeIds: [...new Set((value.upgradeIds ?? []) as string[])], tags: [...new Set((value.tags ?? []) as string[])] };
      if (!rule.all && rule.upgradeIds.length === 0 && rule.tags.length === 0) return false;
      bus.update(state => { state.upgradeSuppressions[source] = rule; });
      bus.emit({ type: 'upgrade.suppression-changed', source: this.id, payload: { source, rule } });
      return true;
    }
    if (command.type === 'clear-suppression' && typeof command.payload === 'string') {
      return clearUpgradeSuppression(bus, command.payload);
    }
    return false;
  }
  query(bus: StateAccess, query: GameCommand): unknown {
    if (query.type === 'stat' && query.payload && typeof query.payload === 'object') {
      const value = query.payload as { base?: unknown; keys?: unknown };
      if (typeof value.base !== 'number' || !Number.isFinite(value.base) || !Array.isArray(value.keys) || !value.keys.every(key => typeof key === 'string')) return undefined;
      const selected = new Set<AnyUpgradeDefinition>();
      for (const key of value.keys as string[]) for (const definition of this.statsByKey.get(key) ?? []) selected.add(definition);
      return resolveStat(value.base, value.keys as string[], [...selected], bus.read());
    }
    if (query.type === 'mechanics' && typeof query.payload === 'string') return collectMechanicEffects(query.payload, this.definitions, bus.read());
    if (query.type === 'status' && typeof query.payload === 'string') {
      const upgrade = this.upgrades.get(query.payload);
      if (!upgrade) return undefined;
      const state = bus.read();
      const id = upgrade.id;
      return { level: state.upgradeLevels[id] ?? 0, playerEnabled: state.upgradeEnabled[id] !== false,
        suppressedBy: upgradeSuppressionSources(id, state, upgrade.definition.tags), active: isUpgradeActive(id, state, upgrade.definition.tags) };
    }
    return undefined;
  }
}
