import type { BreachState, Stone } from '../../game/breachTypes';

/** Индекс действующих клеток по мировой координате и слою; хранит ссылки на единственный массив камней. */
export class BreachStoneIndex {
  private readonly cells = new Map<string, Stone>();
  private blocks: Stone[][] = [];
  constructor(private readonly state: BreachState, private readonly blockCount: number, private readonly neighborRadius = 2) {}
  private globalY(block: number, y: number): number { return block * this.state.size + this.state.size - 1 - y; }
  private key(x: number, y: number): string { return `${x}:${y}`; }
  get(block: number, x: number, y: number): Stone | undefined { return this.cells.get(this.key(x, this.globalY(block, y))); }
  stonesInBlock(block: number): readonly Stone[] { return this.blocks[block] ?? []; }
  nearbyBlocks(block: number, radius: number): Stone[] {
    return this.blocks.slice(Math.max(0, block - radius), Math.min(this.blockCount, block + radius + 1)).flat();
  }
  rebuild(): void {
    this.cells.clear();
    this.blocks = Array.from({ length: this.blockCount }, () => []);
    for (const stone of this.state.stones) {
      this.cells.set(this.key(stone.x, this.globalY(stone.block, stone.y)), stone);
      this.blocks[stone.block].push(stone);
    }
    for (const stone of this.state.stones) {
      stone.neighbors = 0;
      const gy = this.globalY(stone.block, stone.y);
      for (let dy = -this.neighborRadius; dy <= this.neighborRadius; dy++) for (let dx = -this.neighborRadius; dx <= this.neighborRadius; dx++) {
        if ((dx || dy) && this.cells.has(this.key(stone.x + dx, gy + dy))) stone.neighbors++;
      }
    }
  }
  remove(stone: Stone): boolean {
    const gy = this.globalY(stone.block, stone.y);
    if (this.cells.get(this.key(stone.x, gy)) !== stone) return false;
    if (!this.cells.delete(this.key(stone.x, gy))) return false;
    for (let dy = -this.neighborRadius; dy <= this.neighborRadius; dy++) for (let dx = -this.neighborRadius; dx <= this.neighborRadius; dx++) {
      if (!dx && !dy) continue;
      const neighbor = this.cells.get(this.key(stone.x + dx, gy + dy));
      if (neighbor) neighbor.neighbors--;
    }
    const stones = this.state.stones;
    const index = stones.indexOf(stone);
    if (index !== -1) { stones[index] = stones[stones.length - 1]; stones.pop(); }
    const block = this.blocks[stone.block];
    const blockIndex = block.indexOf(stone);
    if (blockIndex !== -1) { block[blockIndex] = block[block.length - 1]; block.pop(); }
    return true;
  }
}
