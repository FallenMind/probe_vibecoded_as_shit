import type { BreachState } from '../../game/breachTypes';
import { BreachBoundUpgrade } from './breachBoundUpgrade';
import { isBreachUpgradeActive } from './breachUpgradeActivity';

type SpecialField = 'fistUniqueUpgrade' | 'pickInfinityEnchant' | 'spearEnchant' | 'spearPierce' | 'emitterPierceUpgrade' | 'needleFireUpgrade' | 'spatialCompressorUnlocked' | 'artifactUnlocked' | 'pickAlchemyOptimized' | 'fistComboUnlocked' | 'needleAltUnlocked' | 'auto';
export interface SpecialUpgradeBinding { id: string; field: SpecialField; tags: readonly string[]; target: 'weapon' | 'game' | 'alchemy' }
export const BREACH_SPECIAL_UPGRADES: readonly SpecialUpgradeBinding[] = [
  { id: 'fistUnique', field: 'fistUniqueUpgrade', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'pickInfinity', field: 'pickInfinityEnchant', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'spearEnchant', field: 'spearEnchant', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'spearPierce', field: 'spearPierce', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'emitterPierce', field: 'emitterPierceUpgrade', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'needleFire', field: 'needleFireUpgrade', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'fistCombo', field: 'fistComboUnlocked', tags: ['weapon', 'combo'], target: 'weapon' },
  { id: 'needleAlt', field: 'needleAltUnlocked', tags: ['weapon', 'unique'], target: 'weapon' },
  { id: 'spatialCompressor', field: 'spatialCompressorUnlocked', tags: ['game', 'progression'], target: 'game' },
  { id: 'artifact', field: 'artifactUnlocked', tags: ['game', 'artifact'], target: 'game' },
  { id: 'pickOptimization', field: 'pickAlchemyOptimized', tags: ['alchemy', 'weapon'], target: 'alchemy' },
  { id: 'auto', field: 'auto', tags: ['game', 'automation'], target: 'game' },
];
const byId = new Map(BREACH_SPECIAL_UPGRADES.map(definition => [definition.id, definition]));

export function isSpecialUpgradeActive(state: BreachState, id: string): boolean {
  const definition = byId.get(id);
  return !!definition && isBreachUpgradeActive(state, id, state[definition.field], definition.tags);
}
export function bindBreachSpecialLevels(levels: Record<string, number>, state: BreachState): void {
  for (const definition of BREACH_SPECIAL_UPGRADES) Object.defineProperty(levels, definition.id, {
    enumerable: true, configurable: true,
    get: () => state[definition.field] ? 1 : 0, set: (level: number) => { state[definition.field] = level > 0; },
  });
}
export function createBreachSpecialUpgrades(): BreachBoundUpgrade[] {
  return BREACH_SPECIAL_UPGRADES.map(definition => new BreachBoundUpgrade({
    id: definition.id, name: definition.id, description: '', maxLevel: 1,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: definition.tags, effects: [],
    mechanicEffects: [{ key: definition.id, target: { kind: definition.target }, parameters: { enabled: true }, priority: 0 }],
  }));
}
