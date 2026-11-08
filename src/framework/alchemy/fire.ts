import type { StateAccess } from '../core/contracts';
import { AlchemyRecipe } from './recipe';
/** Огненный цикл потребляет Землю и Воздух и отдаёт ресурсы по рецепту. */
export class FireRecipe extends AlchemyRecipe {
  tick(bus: StateAccess, seconds: number): void {
    const run = bus.read().moduleData.run as { challengeDone?: Record<string, boolean> } | undefined;
    if (!run?.challengeDone?.['3']) return;
    super.tick(bus, seconds);
  }
}
