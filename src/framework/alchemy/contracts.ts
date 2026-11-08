import type { StateAccess } from '../core/contracts';
import type { DeepReadonly, TileState } from '../core/model';

/** Производство можно заменить независимо от хранения состояния и интерфейса игры. */
export interface AlchemyProduction {
  tick(seconds: number): void;
  craftWater(): boolean;
}

/** Контракт для зачарования Земли, элементализации и будущих расходуемых эффектов. */
export interface AlchemyBuff {
  readonly id: string;
  setEnabled(bus: StateAccess, enabled: boolean): void;
  tick?(bus: StateAccess, seconds: number): void;
  onHit?(bus: StateAccess, characterId: string, tile: DeepReadonly<TileState>, damage: number): number;
  onDestroyed?(bus: StateAccess, tile: DeepReadonly<TileState>): void;
}
