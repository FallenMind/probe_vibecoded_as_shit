import type { StateAccess } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

/** Контракт для зачарования Земли, элементализации и будущих расходуемых эффектов. */
export interface AlchemyBuff {
  readonly id: string;
  setEnabled(bus: StateAccess, enabled: boolean): void;
  tick?(bus: StateAccess, seconds: number): void;
  onHit?(bus: StateAccess, characterId: string, tile: DeepReadonly<TileState>, damage: number): number;
  onDestroyed?(bus: StateAccess, tile: DeepReadonly<TileState>): void;
}
