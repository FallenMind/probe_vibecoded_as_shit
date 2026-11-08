export type AlchemyNode = 'earth' | 'water' | 'fire' | 'air';
export type AlchemySwitch = 'earthEnabled' | 'waterEnabled' | 'pickEnabled' | 'airProductionEnabled' | 'elementalizationEnabled';
export type AlchemyResource = 'earth' | 'water' | 'air' | 'fire' | 'crystals';

/** Баланс рецептов, расхода при добыче и исходных лимитов. */
export const ALCHEMY_CONFIG = {
  earthUnlockBlock: 19,
  waterUnlockBlock: 19,
  earthCapacity: 2000,
  waterCapacity: 100,
  airCapacity: 100,
  fireCapacity: 100,
  earthOverloadCost: { water: 100, earth: 4000, seconds: 1800 },
  pickOptimizationCost: { ore: 50000, earth: 4000, water: 300 },
  earthRecipe: { fraction: 0.1, seconds: 0.2 },
  waterRecipe: { fraction: 0.1, elementalPerWater: 2, seconds: 2 },
  airRecipe: { waterPerAir: 2, seconds: 2 },
  crystalExchange: { water: 100, crystals: 1 },
  fireCycle: { seconds: 5, earthCostPerTick: 100, airCostPerTick: 10, stonePerTick: 50, elementalPerTick: 10, earthPerTick: 100, waterPerTick: 10, airPerTick: 10 },
  stoneWeight: { stone: 1, hard: 3, elemental: 2 },
  pickEarthPerStone: 2,
  pickDamageMultiplier: 2,
  spearEnchantUnlockAir: 60,
} as const;

export interface AlchemyUpgrade {
  id: string;
  node: AlchemyNode;
  name: string;
  description: string;
  cost: Partial<Record<AlchemyResource, number>>;
  capacity: Partial<Record<'earth' | 'water' | 'air' | 'fire', number>>;
  tickMultiplier?: number;
  fireCycleMultiplier?: number;
  airProductionMultiplier?: number;
  requires?: readonly string[];
  minBlock?: number;
  challenge?: 1 | 4;
}

/** Добавление улучшения сводится к новой записи, без веток в игровой логике. */
export const ALCHEMY_UPGRADES: readonly AlchemyUpgrade[] = [
  { id: 'earth1', node: 'earth', name: 'Земля I', description: 'Увеличивает предел Земли.', cost: { water: 100 }, capacity: { earth: 2000 } },
  { id: 'earth2', node: 'earth', name: 'Земля II', description: 'Сильно увеличивает предел Земли.', cost: { air: 50 }, capacity: { earth: 5000 } },
  { id: 'water1', node: 'water', name: 'Вода I', description: 'Увеличивает предел Воды.', cost: { water: 100 }, capacity: { water: 200 } },
  { id: 'earthSpeed', node: 'earth', name: 'Быстрая Земля', description: 'Ускоряет производство Земли в 2 раза.', cost: { water: 50 }, capacity: {}, tickMultiplier: 0.5 },
  { id: 'earthSpeed2', node: 'earth', name: 'Глубокая Земля', description: 'Ещё вдвое ускоряет производство Земли.', cost: { air: 50 }, capacity: {}, tickMultiplier: 0.5, requires: ['earthSpeed'] },
  { id: 'waterSpeed', node: 'water', name: 'Быстрая Вода', description: 'Ускоряет производство Воды в 2 раза.', cost: { water: 50 }, capacity: {}, tickMultiplier: 0.5 },
  { id: 'waterSpeed2', node: 'water', name: 'Высокое Давление', description: 'Ещё вдвое ускоряет производство Воды.', cost: { air: 50 }, capacity: {}, tickMultiplier: 0.5, requires: ['waterSpeed'] },
  { id: 'fireCycle1', node: 'fire', name: 'Катализатор I', description: 'Ускоряет бесконечный цикл стихий.', cost: { fire: 100, water: 100, air: 100 }, capacity: { fire: 500, water: 500, air: 200 }, fireCycleMultiplier: 0.5 },
  { id: 'fireCycle2', node: 'fire', name: 'Катализатор II', description: 'Ещё ускоряет цикл и поднимает предел Огня.', cost: { fire: 500, water: 500, air: 200 }, capacity: { fire: 2000 }, fireCycleMultiplier: 0.5, requires: ['fireCycle1'] },
  { id: 'airFurnace', node: 'fire', name: 'Воздушная форсунка', description: 'Огонь ускоряет производство Воздуха вдвое.', cost: { fire: 250, air: 100 }, capacity: { fire: 500 }, airProductionMultiplier: 0.5 },
];

export interface AlchemyState {
  stone: number;
  earth: number;
  water: number;
  air: number;
  fire: number;
  elementalStone: number;
  earthEnabled: boolean;
  airProductionEnabled: boolean;
  elementalizationEnabled: boolean;
  waterEnabled: boolean;
  pickEnabled: boolean;
  earthClock: number;
  waterClock: number;
  airProductionClock: number;
  fireClock: number;
  upgrades: Record<string, boolean>;
}

export function alchemyTickSeconds(state: AlchemyState, node: 'earth' | 'water', active: (id: string) => boolean = id => !!state.upgrades[id]): number {
  return ALCHEMY_UPGRADES.reduce<number>((seconds, upgrade) =>
    upgrade.node === node && active(upgrade.id) ? seconds * (upgrade.tickMultiplier ?? 1) : seconds,
  ALCHEMY_CONFIG[`${node}Recipe`].seconds);
}

export function airProductionTickSeconds(state: AlchemyState, active: (id: string) => boolean = id => !!state.upgrades[id]): number {
  return ALCHEMY_UPGRADES.reduce<number>((seconds, upgrade) => seconds * (active(upgrade.id) ? upgrade.airProductionMultiplier ?? 1 : 1), ALCHEMY_CONFIG.airRecipe.seconds);
}

export function freshAlchemyState(): AlchemyState {
  return { stone: 0, earth: 0, water: 0, air: 0, fire: 0, elementalStone: 0, earthEnabled: false, waterEnabled: false,
    pickEnabled: false, airProductionEnabled: false, elementalizationEnabled: false, earthClock: 0, waterClock: 0, airProductionClock: 0, fireClock: 0, upgrades: {} };
}

export function alchemyCapacity(state: AlchemyState, resource: 'earth' | 'water' | 'air' | 'fire', active: (id: string) => boolean = id => !!state.upgrades[id]): number {
  return ALCHEMY_UPGRADES.reduce<number>((max, upgrade) => max + (active(upgrade.id) ? upgrade.capacity[resource] ?? 0 : 0),
    resource === 'earth' ? ALCHEMY_CONFIG.earthCapacity : resource === 'water' ? ALCHEMY_CONFIG.waterCapacity : resource === 'fire' ? ALCHEMY_CONFIG.fireCapacity : ALCHEMY_CONFIG.airCapacity);
}
