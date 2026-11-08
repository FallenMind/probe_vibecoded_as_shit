import type { BreachState } from '../../game/breachTypes';
import { BreachBoundUpgrade } from './breachBoundUpgrade';
import { isBreachUpgradeActive } from './breachUpgradeActivity';

/** Открытие бомбарды пока хранится отдельно: выбор отключённого оружия ещё не перенесён. */
const ids = ['twin', 'skipLayers', 'spectrumDrive', 'phaseStep'] as const;
export type BreachSpectraEffectId = typeof ids[number];

export function isSpectraUpgradeActive(state: BreachState, id: BreachSpectraEffectId): boolean {
  return isBreachUpgradeActive(state, `spectra:${id}`, !!state.spectraUpgrades[id], ['spectra', 'game']);
}
export function bindBreachSpectraLevels(levels: Record<string, number>, state: BreachState): void {
  for (const id of ids) Object.defineProperty(levels, `spectra:${id}`, {
    enumerable: true, configurable: true,
    get: () => state.spectraUpgrades[id] ? 1 : 0, set: (level: number) => { state.spectraUpgrades[id] = level > 0; },
  });
}
export function createBreachSpectraUpgrades(): BreachBoundUpgrade[] {
  return ids.map(id => new BreachBoundUpgrade({ id: `spectra:${id}`, name: id, description: '', maxLevel: 1,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['spectra', 'game'], effects: [],
    mechanicEffects: [{ key: `spectra:${id}`, target: { kind: 'game' }, parameters: { enabled: true }, priority: 0 }],
  }));
}
