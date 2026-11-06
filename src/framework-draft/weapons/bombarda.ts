import { BaseWeapon } from './base';

export class Bombarda extends BaseWeapon {
  readonly id = 'bombarda';
  readonly control = 'movement' as const;
  protected readonly delivery = 'explosion' as const;
}
