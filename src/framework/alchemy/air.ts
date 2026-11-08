import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';
/** Вода → Воздух. */
export class AirRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { challengeDone?: Record<string, boolean> } | undefined;
    if (!run?.challengeDone?.['1']) return;
    super.tick(bus, seconds);
  }
}
