import { BaseWeapon } from './base';
import type { AttackPlan, WeaponContext } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

export class Fists extends BaseWeapon {
  readonly id = 'fists';
  readonly control = 'movement' as const;
  protected readonly delivery = 'contact' as const;
  protected splashShape(combo: boolean) { return combo ? 'circle' as const : super.splashShape(combo); }
  /** Базовая «Ударная волна» расходится от пробиваемого камня, а не от персонажа: задевает его соседей. */
  protected createPlan(context: WeaponContext, target: DeepReadonly<TileState>, combo: boolean, attackSpeedMultiplier = 1): AttackPlan {
    const plan = super.createPlan(context, target, combo, attackSpeedMultiplier);
    if (!combo) for (const splash of plan.splash) splash.center = { ...target.position };
    return plan;
  }
}
