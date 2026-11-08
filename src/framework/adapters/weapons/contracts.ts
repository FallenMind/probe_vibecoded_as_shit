import type { BreachState, Stone } from '../../../game/breachTypes';
import type { TileArea } from '../../world/area';

export interface DashPath { fromX: number; fromY: number; toX: number; toY: number }
export type BreachAttackId = 'fists' | 'pick' | 'spear' | 'needle' | 'emitter' | 'bombarda';
export interface BreachAttackContext {
  state: BreachState;
  target: Pick<Stone, 'x' | 'y'>;
  stones: readonly Stone[];
  hit(stone: Stone, damage: number, area?: boolean, splash?: boolean): void;
  damageArea(area: TileArea, damage: (stone: Readonly<Stone>, distance: number) => number, hit: (stone: Stone, damage: number) => void): void;
  special: boolean;
  suppressSplash: boolean;
  angle: number;
  baseDamage: number;
  meleeMultiplier: number;
  rangedMultiplier: number;
  pickRadius: number;
  spearRadius: number;
  emitterRadius: number;
  fistFinisherLevel: number;
  needlePierceLevel: number;
  emitterSpreadLevel: number;
  spearDashPath?: DashPath | null;
  pickDashPath?: DashPath | null;
  fistStoneDamage: number;
  fistComboRadius: number;
  fistComboDamageMultiplier(distance: number, radius: number): number;
  mastery(weapon: keyof BreachState['weaponMasteries']): number;
  splashMultiplier(distance: number, radius: number, spreadLevel: number): number;
}

/** Общий контракт для управляющих движением и автономных ударов. */
export interface BreachAttack { strike(context: BreachAttackContext): void }
