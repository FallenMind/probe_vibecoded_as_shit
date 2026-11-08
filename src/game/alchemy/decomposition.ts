import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';

/** Пассивное разложение включается после открытия огненного цикла. */
export class DecompositionRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { challengeDone?: Record<string, boolean> } | undefined;
    if (!run?.challengeDone?.['3'] || (bus.read().upgradeLevels['alchemy.decomposition-unlock'] ?? 0) <= 0) return;
    super.tick(bus, seconds);
  }
}
