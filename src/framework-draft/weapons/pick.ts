import { BaseWeapon } from './base';

/** Форма дуги и поведение комбо задаются параметрами кирки. */
export class Pick extends BaseWeapon {
  readonly id = 'pick';
  readonly control = 'movement' as const;
  protected readonly delivery = 'contact' as const;
  protected splashShape(combo: boolean) { return combo ? 'circle' as const : super.splashShape(combo); }
}
