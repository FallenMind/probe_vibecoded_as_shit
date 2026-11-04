export type AlchemyNode = 'earth' | 'water' | 'fire' | 'air';
export type AlchemySwitch = 'earthEnabled' | 'waterEnabled' | 'pickEnabled' | 'airProductionEnabled' | 'elementalizationEnabled';
export type AlchemyResource = 'earth' | 'water' | 'air' | 'crystals';

/** Баланс рецептов, расхода при добыче и исходных лимитов. */
export const ALCHEMY_CONFIG = {
  earthUnlockBlock: 19,
  waterUnlockBlock: 29,
  earthCapacity: 2000,
  waterCapacity: 100,
  airCapacity: 100,
  earthRecipe: { fraction: 0.1, seconds: 0.2 },
  waterRecipe: { fraction: 0.1, elementalPerWater: 2, seconds: 2 },
  airRecipe: { waterPerAir: 2, seconds: 2 },
  crystalExchange: { water: 50, crystals: 1 },
  stoneWeight: { stone: 1, hard: 3, elemental: 2 },
  pickEarthPerStone: 2,
  pickDamageMultiplier: 2,
  spearEnchantUnlockAir: 60,
} as const;

export interface AlchemyUpgrade {
  id: string;
  node: 'earth' | 'water';
  name: string;
  description: string;
  cost: Partial<Record<AlchemyResource, number>>;
  capacity: Partial<Record<'earth' | 'water' | 'air', number>>;
  tickMultiplier?: number;
  requires?: readonly string[];
  minBlock?: number;
  challenge?: 1 | 4;
}

/** Добавление улучшения сводится к новой записи, без веток в игровой логике. */
export const ALCHEMY_UPGRADES: readonly AlchemyUpgrade[] = [
  { id: 'earth1', node: 'earth', name: 'Земля I', description: 'Увеличивает предел Земли.', cost: { earth: 2000 }, capacity: { earth: 2000 } },
  { id: 'earth2', node: 'earth', name: 'Земля II', description: 'Увеличивает предел Земли.', cost: { crystals: 50 }, capacity: { earth: 2000 } },
  { id: 'water1', node: 'water', name: 'Вода I', description: 'Увеличивает предел Воды.', cost: { crystals: 20 }, capacity: { water: 100 } },
  { id: 'earthSpeed', node: 'earth', name: 'Быстрая Земля', description: 'Ускоряет производство Земли в 2 раза.', cost: { earth: 500 }, capacity: {}, tickMultiplier: 0.5 },
  { id: 'waterSpeed', node: 'water', name: 'Быстрая Вода', description: 'Ускоряет производство Воды в 2 раза.', cost: { water: 50 }, capacity: {}, tickMultiplier: 0.5 },
];

export interface AlchemyState {
  stone: number;
  earth: number;
  water: number;
  air: number;
  elementalStone: number;
  earthEnabled: boolean;
  airProductionEnabled: boolean;
  elementalizationEnabled: boolean;
  waterEnabled: boolean;
  pickEnabled: boolean;
  earthClock: number;
  waterClock: number;
  airProductionClock: number;
  upgrades: Record<string, boolean>;
}

export function alchemyTickSeconds(state: AlchemyState, node: 'earth' | 'water'): number {
  return ALCHEMY_UPGRADES.reduce<number>((seconds, upgrade) =>
    upgrade.node === node && state.upgrades[upgrade.id] ? seconds * (upgrade.tickMultiplier ?? 1) : seconds,
  ALCHEMY_CONFIG[`${node}Recipe`].seconds);
}

export function freshAlchemyState(): AlchemyState {
  return { stone: 0, earth: 0, water: 0, air: 0, elementalStone: 0, earthEnabled: false, waterEnabled: false,
    pickEnabled: false, airProductionEnabled: false, elementalizationEnabled: false, earthClock: 0, waterClock: 0, airProductionClock: 0, upgrades: {} };
}

export function alchemyCapacity(state: AlchemyState, resource: 'earth' | 'water' | 'air'): number {
  return ALCHEMY_UPGRADES.reduce<number>((max, upgrade) => max + (state.upgrades[upgrade.id] ? upgrade.capacity[resource] ?? 0 : 0),
    resource === 'earth' ? ALCHEMY_CONFIG.earthCapacity : resource === 'water' ? ALCHEMY_CONFIG.waterCapacity : ALCHEMY_CONFIG.airCapacity);
}
