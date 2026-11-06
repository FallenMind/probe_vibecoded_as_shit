import { BaseWeapon } from './base';

/** Рывок описывается в плане комбо; исполнитель боя решает, как его применить. */
export class Spear extends BaseWeapon {
  readonly id = 'spear';
  readonly control = 'movement' as const;
  protected readonly delivery = 'contact' as const;
}
