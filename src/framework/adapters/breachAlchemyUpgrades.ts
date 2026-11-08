import { ALCHEMY_UPGRADES } from '../../game/alchemy';
import type { BreachState } from '../../game/breachTypes';
import { BreachBoundUpgrade } from './breachBoundUpgrade';
import { isBreachUpgradeActive } from './breachUpgradeActivity';

const definitions = ALCHEMY_UPGRADES;
const tagsFor = (definition: typeof definitions[number]): string[] => [
  'alchemy', definition.node,
  ...(definition.tickMultiplier || definition.fireCycleMultiplier || definition.airProductionMultiplier ? ['speed'] : []),
  ...(Object.keys(definition.capacity).length ? ['capacity'] : []),
];
const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
const tagsById = new Map(definitions.map(definition => [definition.id, tagsFor(definition)]));

export function isAlchemyUpgradeActive(state: BreachState, id: string): boolean {
  const definition = definitionsById.get(id);
  if (!definition) return !!state.alchemy.upgrades[id];
  return isBreachUpgradeActive(state, `alchemy:${id}`, !!state.alchemy.upgrades[id], tagsById.get(id)!);
}

export function bindBreachAlchemyLevels(levels: Record<string, number>, state: BreachState): void {
  for (const definition of definitions) Object.defineProperty(levels, `alchemy:${definition.id}`, {
    enumerable: true, configurable: true,
    get: () => state.alchemy.upgrades[definition.id] ? 1 : 0,
    set: (level: number) => { state.alchemy.upgrades[definition.id] = level > 0; },
  });
}

export function createBreachAlchemyUpgrades(): BreachBoundUpgrade[] {
  return definitions.map(definition => new BreachBoundUpgrade({
    id: `alchemy:${definition.id}`, name: definition.name, description: definition.description, maxLevel: 1,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: tagsById.get(definition.id)!, effects: [],
    mechanicEffects: [
      { key: 'alchemy.capacity', target: { kind: 'alchemy', id: definition.node }, parameters: { ...definition.capacity }, priority: 0 },
      { key: 'alchemy.timing', target: { kind: 'alchemy', id: definition.node }, parameters: {
        tickMultiplier: definition.tickMultiplier ?? 1, fireCycleMultiplier: definition.fireCycleMultiplier ?? 1, airProductionMultiplier: definition.airProductionMultiplier ?? 1,
      }, priority: 0 },
    ],
  }));
}
