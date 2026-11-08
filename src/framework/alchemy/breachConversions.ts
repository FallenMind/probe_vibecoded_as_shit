/** Расчёты действующих рецептов. Побочные эффекты и игровые ограничения остаются у вызывающего кода. */
export class BreachAlchemyConversions {
  earth(stone: number, earth: number, capacity: number, fraction: number): number {
    return Math.min(Math.max(1, Math.floor(stone * fraction)), stone, capacity - earth);
  }

  water(earth: number, elementalStone: number, water: number, capacity: number, fraction: number, elementalPerWater: number): number {
    return Math.min(Math.max(1, Math.floor(earth * fraction)), Math.floor(earth),
      Math.floor(elementalStone / elementalPerWater), capacity - water);
  }
}
