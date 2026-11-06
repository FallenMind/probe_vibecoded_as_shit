import { OneTimeUpgrade, RepeatableUpgrade } from './upgrade';

/** Примеры; весь магазин предстоит переносить отдельно. */
export const exampleUpgrades = [
  new RepeatableUpgrade({ id: 'fists.damage', name: 'Сила кулаков', description: 'Базовый урон кулаков +2 за уровень.',
    maxLevel: 100, baseCost: { ore: 100 }, costMultiplier: 1.8, requiresUpgrades: {}, requiresResources: {}, tags: ['weapon', 'melee', 'repeatable'],
    effects: [{ type: 'stat', key: 'weapon.fists.damage', stage: 'baseFlat', value: 2 }] }),
  new OneTimeUpgrade({ id: 'cycle.melee', name: 'Кинетический контур', description: 'Урон ближнего боя ×1,5.',
    baseCost: { breakthrough: 1 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle', 'melee'],
    effects: [{ type: 'stat', key: 'weapon.melee.damage', stage: 'outputMult', value: 1.5 }] }),
  new OneTimeUpgrade({ id: 'cycle.start', name: 'Старт после босса', description: 'Начинать новый забег на 5 слоёв позже.',
    baseCost: { breakthrough: 2 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle'], effects: [],
    mechanicEffects: [{ key: 'run.start-layer-offset', target: { kind: 'game' }, parameters: { layers: 5 }, priority: 0 }] }),
  new OneTimeUpgrade({ id: 'cycle.radius', name: 'Раскрытая дуга', description: 'Два дополнительных уровня радиуса для оружия ближнего боя.',
    baseCost: { breakthrough: 2 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle', 'melee'], effects: [],
    mechanicEffects: [{ key: 'weapon.radius-level-limit', target: { kind: 'weapon', id: 'melee' }, parameters: { levels: 2 }, priority: 0 }] }),
];
