import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';

/** Вулканизация замыкает ресурсный цикл вне четвёртого испытания. */
export class VulcanizationRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { challenge?: number; challengeDone?: Record<string, boolean> } | undefined;
    if (run?.challenge === 4 || !run?.challengeDone?.['3'] || (bus.read().upgradeLevels['alchemy.vulcanization-unlock'] ?? 0) <= 0) return;
    super.tick(bus, seconds);
  }
}
