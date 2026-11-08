import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';
/** Земля и элементальный камень → Вода. */
export class WaterRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { unlocked?: Record<string, boolean> } | undefined;
    if (!run?.unlocked?.water) return;
    super.tick(bus, seconds);
  }
}
