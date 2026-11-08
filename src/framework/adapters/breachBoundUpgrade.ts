import type { StateAccess } from '../core/contracts';
import { RepeatableUpgrade } from '../upgrades/upgrade';

/** Покупка принадлежит действующему магазину; общее представление не выдаёт бесплатных уровней. */
export class BreachBoundUpgrade extends RepeatableUpgrade {
  override canBuy(_bus: StateAccess): boolean { return false; }
  override buy(_bus: StateAccess): boolean { return false; }
}
