import { BaseWeapon } from './base';

export class Fists extends BaseWeapon {
  readonly id = 'fists';
  readonly control = 'movement' as const;
  protected readonly delivery = 'contact' as const;
  protected splashShape(combo: boolean) { return combo ? 'circle' as const : super.splashShape(combo); }
}
