import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';
/** Камень → Земля; доля и пределы описаны рецептом. */
export class EarthRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { furthest?: number } | undefined;
    if ((run?.furthest ?? 0) < 20) return;
    super.tick(bus, seconds);
  }
}
