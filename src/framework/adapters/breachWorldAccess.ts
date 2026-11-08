import type { BreachState, Stone } from '../../game/breachTypes';
import { selectItemsInArea, areaDistance } from '../world/area';
import type { TileArea } from '../world/area';
import { BreachStoneIndex } from './breachStoneIndex';

/** Доступ к действующей карте. Индекс содержит ссылки на единственный массив камней забега. */
export class BreachWorldAccess {
  private readonly index: BreachStoneIndex;
  constructor(private readonly state: BreachState, private readonly blockCount: number) {
    this.index = new BreachStoneIndex(state, blockCount);
  }

  rebuild(): void { this.index.rebuild(); }
  getStone(block: number, x: number, y: number): Stone | undefined {
    if (!Number.isInteger(block) || block < 0 || block >= this.blockCount || !Number.isInteger(x) || x < 0 || x >= this.state.size ||
      !Number.isInteger(y) || y < 0 || y >= this.state.size) return undefined;
    return this.index.get(block, x, y);
  }
  stonesInBlock(block: number): readonly Stone[] { return this.index.stonesInBlock(block); }
  nearbyBlocks(block: number, radius: number): Stone[] { return this.index.nearbyBlocks(block, radius); }
  selectArea(block: number, area: TileArea): readonly Stone[] {
    return selectItemsInArea(this.stonesInBlock(block), area, stone => stone);
  }

  /** Урон вычисляется до первого попадания; сопротивления и награды применяет переданный владелец механики. */
  damageArea(block: number, area: TileArea, damage: number | ((stone: Readonly<Stone>, distance: number) => number),
    hit: (stone: Stone, damage: number) => void): void {
    const hits = this.selectArea(block, area).map(stone => {
      const amount = typeof damage === 'function' ? damage({ ...stone }, areaDistance(area, stone)) : damage;
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Некорректный урон');
      return { stone, amount };
    });
    if (typeof damage === 'number' && (!Number.isFinite(damage) || damage < 0)) throw new Error('Некорректный урон');
    for (const { stone, amount } of hits) if (amount > 0 && this.getStone(stone.block, stone.x, stone.y) === stone) hit(stone, amount);
  }

  addStone(stone: Stone): boolean {
    return this.addStones([stone]);
  }

  /** Пакетная вставка атомарна и перестраивает индекс один раз. */
  addStones(stones: readonly Stone[]): boolean {
    const positions = new Set<string>();
    for (const stone of stones) {
      if (!stone || typeof stone !== 'object') return false;
      const { block, x, y, hp, maxHp, kind } = stone;
      const key = `${block}:${x}:${y}`;
      if (!Number.isInteger(block) || block < 0 || block >= this.blockCount ||
        !Number.isInteger(x) || x < 0 || x >= this.state.size || !Number.isInteger(y) || y < 0 || y >= this.state.size ||
        !Number.isFinite(hp) || !Number.isFinite(maxHp) || hp <= 0 || hp > maxHp ||
        !['stone', 'hard', 'elemental'].includes(kind) || this.getStone(block, x, y) || positions.has(key)) return false;
      positions.add(key);
    }
    if (!stones.length) return true;
    this.state.stones.push(...stones.map(stone => ({ ...stone })));
    this.rebuild();
    return true;
  }

  /** Удаление само по себе не является добычей и не начисляет ресурсы. */
  removeStone(stone: Stone): boolean { return this.index.remove(stone); }
}
