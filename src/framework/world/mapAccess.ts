import type { StateAccess } from '../core/contracts';
import type { DeepReadonly, MapState, Point, TileState } from '../core/model';
import { areaBounds, areaDistance, selectItemsInArea, validateArea } from './area';
import type { AreaSelection } from './area';

export interface TileBounds { minX: number; minY: number; maxX: number; maxY: number }
export interface TileDamageResult { tile: DeepReadonly<TileState>; damage: number; remainingHealth: number; destroyed: boolean }
/** Функция получает снимок камня и расстояние до области; защиту и falloff задаёт вызывающий код. */
export type TileDamage = number | ((tile: DeepReadonly<TileState>, distance: number) => number);

/** Операции с квадратами карты и камнями через единственное состояние шины. */
export interface MapAccess {
  getMap(id: string): DeepReadonly<MapState> | undefined;
  listMaps(): readonly DeepReadonly<MapState>[];
  addMap(map: MapState): boolean;
  removeMap(id: string): boolean;
  getTile(id: string): DeepReadonly<TileState> | undefined;
  getTileAt(mapId: string, point: Point): DeepReadonly<TileState> | undefined;
  listTiles(mapId: string, bounds?: TileBounds): readonly DeepReadonly<TileState>[];
  addTile(tile: TileState): boolean;
  removeTile(id: string): boolean;
  selectArea(selection: AreaSelection): readonly DeepReadonly<TileState>[];
  damageTile(id: string, damage: number): TileDamageResult | undefined;
  damageBatch(hits: readonly { tileId: string; damage: number }[]): readonly TileDamageResult[];
  damageArea(selection: AreaSelection, damage: TileDamage): readonly TileDamageResult[];
  destroyArea(selection: AreaSelection): readonly TileDamageResult[];
}

export class StateMapAccess implements MapAccess {
  constructor(private readonly bus: StateAccess) {}

  getMap(id: string): DeepReadonly<MapState> | undefined { return this.bus.read().maps[id]; }
  listMaps(): readonly DeepReadonly<MapState>[] { return Object.values(this.bus.read().maps); }

  addMap(map: MapState): boolean {
    if (!map.id || this.getMap(map.id) || !Number.isInteger(map.layer) || map.layer < 0 ||
        !Number.isInteger(map.width) || map.width < 1 || !Number.isInteger(map.height) || map.height < 1) return false;
    this.bus.update(state => { state.maps[map.id] = structuredClone(map); });
    this.bus.emit({ type: 'map.added', source: 'world', payload: { mapId: map.id } });
    return true;
  }

  removeMap(id: string): boolean {
    if (!this.getMap(id) || Object.values(this.bus.read().characters).some(character => character.mapId === id)) return false;
    this.bus.update(state => {
      delete state.maps[id];
      for (const [tileId, tile] of Object.entries(state.tiles)) if (tile.mapId === id) delete state.tiles[tileId];
    });
    this.bus.emit({ type: 'map.removed', source: 'world', payload: { mapId: id } });
    return true;
  }

  getTile(id: string): DeepReadonly<TileState> | undefined { return this.bus.read().tiles[id]; }
  getTileAt(mapId: string, point: Point): DeepReadonly<TileState> | undefined {
    const map = this.getMap(mapId);
    if (map?.tags.includes('coordinate-indexed')) return this.bus.read().tiles[`${mapId}:${point.x}:${point.y}`];
    return Object.values(this.bus.read().tiles).find(tile => tile.mapId === mapId && tile.position.x === point.x && tile.position.y === point.y);
  }
  listTiles(mapId: string, bounds?: TileBounds): readonly DeepReadonly<TileState>[] {
    const map = this.getMap(mapId);
    if (!map) return [];
    const tiles = this.bus.read().tiles;
    if (map.tags.includes('coordinate-indexed')) {
      const minX = Math.max(0, bounds ? Math.ceil(bounds.minX) : 0), maxX = Math.min(map.width - 1, bounds ? Math.floor(bounds.maxX) : map.width - 1);
      const minY = Math.max(0, bounds ? Math.ceil(bounds.minY) : 0), maxY = Math.min(map.height - 1, bounds ? Math.floor(bounds.maxY) : map.height - 1);
      const result: DeepReadonly<TileState>[] = [];
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const tile = tiles[`${mapId}:${x}:${y}`];
        if (tile?.mapId === mapId) result.push(tile);
      }
      return result;
    }
    return Object.values(tiles).filter(tile => tile.mapId === mapId && (!bounds ||
      (tile.position.x >= bounds.minX && tile.position.x <= bounds.maxX && tile.position.y >= bounds.minY && tile.position.y <= bounds.maxY)));
  }

  addTile(tile: TileState): boolean {
    const map = this.getMap(tile.mapId);
    const { x, y } = tile.position;
    if (!tile.id || this.getTile(tile.id) || !map || !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x >= map.width || y >= map.height || this.getTileAt(tile.mapId, tile.position) ||
        (map.tags.includes('coordinate-indexed') && tile.id !== `${map.id}:${x}:${y}`) ||
        !Number.isFinite(tile.health) || !Number.isFinite(tile.maxHealth) || tile.maxHealth <= 0 ||
        tile.health <= 0 || tile.health > tile.maxHealth || !Number.isFinite(tile.armor) || tile.armor < 0) return false;
    this.bus.update(state => { state.tiles[tile.id] = structuredClone(tile); });
    this.bus.emit({ type: 'tile.added', source: 'world', payload: { mapId: tile.mapId, tileId: tile.id, position: { x, y } } });
    return true;
  }

  removeTile(id: string): boolean {
    const tile = this.getTile(id);
    if (!tile) return false;
    const payload = { mapId: tile.mapId, tileId: id, position: { ...tile.position } };
    this.bus.update(state => { delete state.tiles[id]; });
    this.bus.emit({ type: 'tile.removed', source: 'world', payload });
    return true;
  }

  selectArea(selection: AreaSelection): readonly DeepReadonly<TileState>[] {
    validateArea(selection.area);
    const excluded = new Set(selection.excludeTileIds ?? []);
    return selectItemsInArea(this.listTiles(selection.mapId, areaBounds(selection.area)), selection.area, tile => tile.position)
      .filter(tile => !excluded.has(tile.id));
  }

  damageTile(id: string, damage: number): TileDamageResult | undefined {
    if (!Number.isFinite(damage) || damage < 0) throw new Error('Некорректный урон');
    const tile = this.getTile(id);
    return tile ? this.applyDamage([{ tile: structuredClone(tile), damage }])[0] : undefined;
  }

  /** Apply many independent hits with one state mutation, preserving per-hit damage and destruction events. */
  damageBatch(hits: readonly { tileId: string; damage: number }[]): readonly TileDamageResult[] {
    const pending = hits.map(hit => {
      if (!Number.isFinite(hit.damage) || hit.damage < 0) throw new Error('Invalid damage');
      const tile = this.getTile(hit.tileId);
      return tile ? { tile, damage: hit.damage } : undefined;
    }).filter((hit): hit is { tile: DeepReadonly<TileState>; damage: number } => hit !== undefined);
    return this.applyDamage(pending);
  }

  damageArea(selection: AreaSelection, damage: TileDamage): readonly TileDamageResult[] {
    if (typeof damage === 'number' && (!Number.isFinite(damage) || damage < 0)) throw new Error('Некорректный урон');
    // Сначала рассчитываем все попадания: ошибка в правиле не оставит наполовину изменённую карту.
    const hits = this.selectArea(selection).map(tile => {
      const snapshot = structuredClone(tile);
      const amount = typeof damage === 'function' ? damage(structuredClone(snapshot), areaDistance(selection.area, snapshot.position)) : damage;
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Некорректный урон');
      return { tile: snapshot, damage: amount };
    });
    return this.applyDamage(hits);
  }

  destroyArea(selection: AreaSelection): readonly TileDamageResult[] {
    return this.applyDamage(this.selectArea(selection).map(tile => ({ tile: structuredClone(tile), damage: tile.health })));
  }

  private applyDamage(hits: readonly { tile: DeepReadonly<TileState>; damage: number }[]): TileDamageResult[] {
    const results: TileDamageResult[] = [];
    this.bus.update(state => {
      for (const { tile, damage } of hits) {
        const current = state.tiles[tile.id];
        if (!current || current.mapId !== tile.mapId || damage === 0) continue;
        const actual = Math.min(current.health, damage);
        const remainingHealth = Math.max(0, current.health - actual);
        const result = { tile: structuredClone(current), damage: actual, remainingHealth, destroyed: remainingHealth === 0 };
        if (result.destroyed) delete state.tiles[tile.id];
        else current.health = remainingHealth;
        results.push(result);
      }
    });
    for (const result of results) {
      this.bus.emit({ type: 'tile.damaged', source: 'world', payload: result });
      if (result.destroyed) {
        this.bus.emit({ type: 'tile.destroyed', source: 'world', payload: result });
        this.bus.emit({ type: 'tile.removed', source: 'world', payload: { mapId: result.tile.mapId, tileId: result.tile.id, position: { ...result.tile.position } } });
      }
    }
    return results;
  }
}
