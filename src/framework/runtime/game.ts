import { createDraftFramework } from '../bootstrap';
import { DEFAULT_CONFIG } from '../config/defaults';
import type { FrameworkConfig } from '../config/schema';
import type { GameModule, StateAccess } from '../core/contracts';
import { EARTH_MARKED_TAG, type GameCommand, type GameState, type TileState } from '../core/model';
import { StateBus } from '../core/stateBus';
import { OneTimeUpgrade, RepeatableUpgrade } from '../upgrades/upgrade';
import { UpgradeModule } from '../upgrades/upgradeModule';
import { StateMapAccess } from '../world/mapAccess';
import { DeliveryModule } from './delivery';
import { stoneTextureNoise } from '../world/noise';

export const SAVE_KEY = 'pioneer-framework-v1';
const weaponIds = ['fists', 'pick', 'spear', 'bombarda', 'needle', 'emitter'] as const;
export type NativeWeaponId = typeof weaponIds[number];
export interface NativeRun {
  layer: number; furthest: number; completions: number; boss: number; boundary: number | null;
  clicks: number; message: string; unlocked: Record<string, boolean>; challengeDone: Record<string, boolean>;
  challenge: number; challengeTime: number; challengeGoal: number; regenClock: number; earthBuff: boolean;
  elementalization: boolean; overloadRemaining: number; overloadUsed: boolean; overloadCount: number; endChargeRemaining: number;
  stimpackRemaining: number;
  backup: { maps: GameState['maps']; tiles: GameState['tiles']; characters: GameState['characters']; resources: GameState['resources']; layer: number; boss: number; boundary: number | null } | null;
}
export const equipment = [
  { id: 'fists', name: 'Кулаки', cost: 0, layer: 0, kind: 'melee' },
  { id: 'pick', name: 'Кремниевая кирка', cost: 1500, layer: 3, kind: 'melee' },
  { id: 'spear', name: 'Копьё', cost: 15000, layer: 25, kind: 'melee' },
  { id: 'bombarda', name: 'Бомбарда', cost: 75000, layer: 50, kind: 'melee' },
  { id: 'needle', name: 'Игломёт', cost: 150, layer: 1, kind: 'ranged' },
  { id: 'emitter', name: 'Излучатель', cost: 5000, layer: 15, kind: 'ranged' },
] as const;

export const upgradeItems = [
  ...weaponIds.flatMap(id => [
    { id: `${id}.damage`, name: `Сила: ${equipment.find(item => item.id === id)!.name}`, description: 'Урон выбранного оружия.', key: `weapon.${id}.damage`, value: ({ fists: 2, pick: 1, spear: 1.5, needle: 0.35, emitter: 0.8, bombarda: 0.8 } as Record<string, number>)[id], cost: id === 'pick' ? 250 : id === 'spear' ? 500 : 8, maxLevel: 100 },
    { id: `${id}.speed`, name: `Скорость: ${equipment.find(item => item.id === id)!.name}`, description: 'Скорость атак выбранного оружия.', key: `weapon.${id}.attackSpeed`, value: ({ fists: 0.25, pick: 0.25, spear: 0.2, needle: 1.1, emitter: 0.3, bombarda: 0.2 } as Record<string, number>)[id], cost: id === 'spear' || id === 'emitter' ? 500 : id === 'fists' || id === 'needle' ? 50 : 250, maxLevel: id === 'needle' ? 50 : 30 },
  ]),
  ...(['fists', 'pick', 'spear', 'emitter'] as const).map(id => ({ id: `${id}.radius`, name: `Радиус: ${equipment.find(item => item.id === id)!.name}`, description: 'Увеличивает область удара или комбо.', key: `weapon.${id}.splash.radius`, value: id === 'emitter' ? 0.1 : 1, cost: id === 'fists' ? 0 : 500, maxLevel: id === 'fists' ? 7 : id === 'emitter' ? 2 : 6 })),
  { id: 'bombarda.radius', name: 'Bombarda splash radius', description: 'Base radius 3, upgrades to 7; Cycle 3 adds 2 more.', key: 'weapon.bombarda.splash.radius', value: 1, cost: 500, maxLevel: 6 },
  { id: 'bombarda.range', name: 'Дальность атаки: Бомбарда', description: 'Увеличивает расстояние, на котором Бомбарда может выбирать цель.', key: 'weapon.bombarda.interactionRange', value: 1, cost: 500, maxLevel: 6 },
  { id: 'penetration', name: 'Пробиваемость тяжёлой породы', description: 'Повышает урон сплеша по тяжёлому камню: от 40% до 100% за 5 уровней. Действует на всё оружие, включая взрыв Бомбарды.', key: 'weapon.armorPenetration', value: 0, cost: 250, maxLevel: 5 },
  { id: 'movement.speed', name: 'Скорость движения', description: 'За уровень добавляет 0,75 клетки в секунду.', key: 'character.moveSpeed', value: 0, cost: 50, maxLevel: 30 },
];
export const cycleUpgradeItems = [
  { id: 'cycle.1', group: 1, name: 'Кинетический контур', description: 'Урон ближнего оружия ×1,5.', cost: 1 },
  { id: 'cycle.2', group: 1, name: 'Полный залп', description: 'Игломёт получает полную мощность; скорость огня ×1,5.', cost: 1 },
  { id: 'cycle.3', group: 1, name: 'Expanded blast', description: 'Breakthrough upgrade: adds 2 Bombarda splash radius.', cost: 2 },
  { id: 'cycle.4', group: 1, name: 'Старт после босса', description: 'Начинайте цикл после первого босса.', cost: 2 },
  { id: 'cycle.5', group: 2, name: 'Дальний контур', description: 'Урон дальнего оружия ×1,5.', cost: 1 },
  { id: 'cycle.6', group: 2, name: 'Acceleration rhythm', description: 'Breakthrough upgrade: pick and spear combos trigger sooner; Bombarda combo cadence drops from 5 attacks to 2.', cost: 1 },
  { id: 'cycle.7', group: 2, name: 'Водный запас', description: '100 Воды в начале цикла.', cost: 2 },
  { id: 'cycle.8', group: 2, name: 'Снятие печати босса', description: 'Боссы без множителя здоровья.', cost: 2 },
  { id: 'cycle.9', group: 3, name: 'Каменный резерв', description: 'Камень за добычу +10%.', cost: 2 },
  { id: 'cycle.10', group: 3, name: 'Стабилизатор породы', description: 'Урон по твёрдой породе +10%.', cost: 4 },
  { id: 'cycle.11', group: 3, name: 'Тихий катализ', description: 'Алхимическое производство +5%.', cost: 7 },
  { id: 'cycle.12', group: 3, name: 'Сейсмический след', description: 'Скорость атак +10%.', cost: 10 },
  { id: 'cycle.13', group: 4, name: 'Архив боссов', description: 'Руда с боссов ×2.', cost: 10 },
  { id: 'cycle.14', group: 4, name: 'Глубинная память', description: 'Урон по элементальной породе +10%.', cost: 25 },
  { id: 'cycle.15', group: 4, name: 'Сборочная волна', description: 'Вместимость буфера кликов +10%.', cost: 60 },
  { id: 'cycle.16', group: 4, name: 'Наследие цикла', description: 'Стоимость повторяемых улучшений −3%.', cost: 250 },
] as const;
export const uniqueItems = [
  { id: 'fists.elemental', name: 'Земляной резонанс', resource: 'earth', cost: 60 },
  { id: 'pick.elemental', name: 'Вечное зачарование кирки', resource: 'earth', cost: 60 },
  { id: 'spear.elemental', name: 'Ветер копья', resource: 'air', cost: 60 },
  { id: 'emitter.elemental', name: 'Гидрорезонанс', resource: 'water', cost: 50 },
  { id: 'needle.elemental', name: 'Зажигательные иглы', resource: 'fire', cost: 20 },
] as const;
export const masteryItems = [
  { id: 'pick.mastery', weapon: 'pick', name: 'Мастерство кирки', description: 'Урон кирки ×1,25. Открывается после 3 уровней силы кирки.', cost: 2500, requiredDamageLevel: 3, multiplier: 1.25 },
] as const;
export const alchemyItems = [
  { id: 'alchemy.earth1', name: 'Хранилище Земли I', resource: 'earth', cost: 2000, target: 'earth', capacity: 2000 },
  { id: 'alchemy.earth2', name: 'Хранилище Земли II', resource: 'crystals', cost: 50, target: 'earth', capacity: 4000 },
  { id: 'alchemy.water1', name: 'Хранилище Воды I', resource: 'crystals', cost: 20, target: 'water', capacity: 400 },
  { id: 'alchemy.air1', name: 'Резервуар Воздуха I', resource: 'fire', cost: 10, target: 'air', capacity: 100 },
  { id: 'alchemy.air2', name: 'Резервуар Воздуха II', resource: 'fire', cost: 50, target: 'air', capacity: 250 },
  { id: 'alchemy.fire1', name: 'Камера Огня I', resource: 'fire', cost: 25, target: 'fire', capacity: 100 },
  { id: 'alchemy.air-speed', name: 'Воздушный ускоритель', resource: 'fire', cost: 25, target: 'air', speedMultiplier: 2 },
] as const;
const upgrades = (config: FrameworkConfig) => [
  ...upgradeItems.map(item => new RepeatableUpgrade({ id: item.id, name: item.name, description: item.description,
    maxLevel: 'maxLevel' in item && typeof item.maxLevel === 'number' ? item.maxLevel : 1000, baseCost: { ore: item.cost },
    priceHandler: item.id === 'fists.radius' ? ({ level }) => ({ ore: [0, 150, 1000, 5000, 25000, 100000, 500000][level] ?? 0 }) : undefined,
    outputHandler: item.id === 'movement.speed' ? ({ current, level }) => current + 0.75 * level
      : item.id === 'penetration' ? ({ level }) => level <= 0 ? 0 : Math.min(0.85, 0.25 + (level - 1) * 0.15) : undefined,
    costMultiplier: item.id === 'fists.speed' || item.id === 'needle.speed' ? 1.7 : ['movement.speed', 'penetration'].includes(item.id) ? 1.55 : 1.8, requiresUpgrades: {}, requiresResources: {},
    tags: ['repeatable', item.id.split('.')[0]], effects: [
      { type: 'stat' as const, key: item.key, stage: 'baseFlat' as const, value: item.id === 'movement.speed' ? 0 : item.value },
      ...(item.id === 'pick.radius' ? [{ type: 'stat' as const, key: 'weapon.pick.interactionRange', stage: 'baseFlat' as const, value: 0.1 }] : []),
      ...(item.id === 'spear.radius' ? [{ type: 'stat' as const, key: 'weapon.spear.interactionRange', stage: 'baseFlat' as const, value: 0.15 }] : []),
    ] })),
  ...masteryItems.map(item => new OneTimeUpgrade({ id: item.id, name: item.name, description: item.description,
    baseCost: { ore: item.cost }, costMultiplier: 1, requiresUpgrades: { 'pick.damage': item.requiredDamageLevel }, requiresResources: {}, tags: ['weapon', 'pick', 'mastery'],
    effects: [{ type: 'stat' as const, key: 'weapon.pick.damage', stage: 'outputMult' as const, value: item.multiplier }] })),
  new OneTimeUpgrade({ id: 'fists.combo', name: 'Ударная связка кулаков', description: 'Включает комбо-удары кулаков.',
    baseCost: { ore: 50 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['weapon', 'fists', 'combo'], effects: [] }),
  new OneTimeUpgrade({ id: 'fists.splash', name: 'Ударная волна', description: 'Обычные удары кулаков задевают соседние камни в радиусе 1 клетки с затуханием урона к краю.',
    baseCost: { ore: 500 }, costMultiplier: 1, requiresUpgrades: { 'fists.radius': 1 }, requiresResources: {}, tags: ['weapon', 'fists', 'splash'],
    effects: [{ type: 'stat', key: 'weapon.fists.splash.radius', stage: 'baseFlat', value: 1 }] }),
  ...uniqueItems.map(item => new OneTimeUpgrade({ id: item.id, name: item.name, description: item.id === 'needle.elemental' ? 'Поджигает поражённую породу до её разрушения.' : item.id === 'pick.elemental' ? 'Постоянно чарует кирку и повышает пробитие элементальной породы.' : 'Открывает частичное пробитие элементальной породы без расхода стихии при атаке.',
    baseCost: { [item.resource]: item.cost }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['unique', item.id.split('.')[0]],
    effects: [
      { type: 'stat' as const, key: `weapon.${item.id.split('.')[0]}.elementalPenetration`, stage: 'baseFlat' as const, value: 0.25 },
      ...(item.id === 'spear.elemental' ? [{ type: 'stat' as const, key: 'weapon.spear.combo.dashPathWidth', stage: 'baseFlat' as const, value: 0.75 }] : []),
    ] })),
  new OneTimeUpgrade({ id: 'bombarda.elemental', name: 'Bombarda elemental ricochet', description: 'After a grenade hits, it ricochets toward the densest nearby rock cluster. The ricochet travels faster with attack speed and deals 40% of the original damage.', baseCost: { crystals: 5, earth: 5000 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['weapon', 'bombarda', 'elemental'], effects: [] }),  ...alchemyItems.map(item => new OneTimeUpgrade({ id: item.id, name: item.name, description: 'speedMultiplier' in item ? 'Удваивает скорость производства Воздуха.' : 'Увеличивает вместимость ресурса.',
    baseCost: { [item.resource]: item.cost }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['alchemy', 'capacity'],
    effects: 'speedMultiplier' in item
      ? [{ type: 'stat' as const, key: `alchemy.${item.target}.productionSpeed`, stage: 'mult' as const, value: item.speedMultiplier }]
      : [{ type: 'stat' as const, key: `alchemy.${item.target}.capacity`, stage: 'baseFlat' as const, value: item.capacity }] })),
  new OneTimeUpgrade({ id: 'alchemy.earth-overload', name: 'Перегрузка земли', description: 'Открывает перегрузку на 30 минут. Активация расходует всю накопленную Землю.',
    baseCost: config.alchemy.buffs.overloadUpgradeCost, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['alchemy', 'earth', 'overload'], effects: [] }),
  new OneTimeUpgrade({ id: 'alchemy.vulcanization-unlock', name: 'Разрешение: Вулканизация', description: 'Открывает переключаемую реакцию Вулканизации.',
    baseCost: config.alchemy.buffs.fireReactionUnlockCosts.vulcanization, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['alchemy', 'fire', 'vulcanization'], effects: [] }),
  new OneTimeUpgrade({ id: 'alchemy.decomposition-unlock', name: 'Разрешение: Разложение элементов', description: 'Открывает переключаемую реакцию Разложения элементов.',
    baseCost: config.alchemy.buffs.fireReactionUnlockCosts.decomposition, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['alchemy', 'fire', 'decomposition'], effects: [] }),
  new RepeatableUpgrade({ id: 'alchemy.fire-speed', name: 'Ускоритель Огня', description: 'Скорость производства Огня ×1,5 за уровень. Доступен после Подхода теоремы Спектра.',
    maxLevel: 10, baseCost: { fire: 25 }, costMultiplier: 1.8, requiresUpgrades: {}, requiresResources: {}, tags: ['alchemy', 'infinity', 'fire'],
    effects: [{ type: 'stat', key: 'alchemy.fire.productionSpeed', stage: 'mult', value: 1.5 }] }),
  new RepeatableUpgrade({ id: 'cycle.expansion', name: 'Расширение карты', description: 'Увеличивает сторону карты при следующем забеге.',
    maxLevel: 3, baseCost: { breakthrough: 1 }, costMultiplier: 2, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle'],
    effects: [{ type: 'stat', key: 'world.expansion', stage: 'baseFlat', value: 1 }] }),
  new OneTimeUpgrade({ id: 'spatial.compressor', name: 'Пространственный сжиматель', description: 'Пропускает зачищенный на 95% слой.',
    baseCost: { ore: config.world.compressorCost }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['world', 'compressor'],
    effects: [{ type: 'stat', key: 'world.compressor', stage: 'baseFlat', value: 1 }] }),
  ...cycleUpgradeItems.map(item => new OneTimeUpgrade({ id: item.id, name: item.name, description: item.description, baseCost: { breakthrough: item.cost }, costMultiplier: 1,
    requiresUpgrades: {}, requiresResources: {}, tags: ['cycle'], effects: item.id === 'cycle.1' ? [{ type: 'stat' as const, key: 'weapon.melee.damage', stage: 'outputMult' as const, value: 1.5 }]
      : item.id === 'cycle.3' ? [{ type: 'stat' as const, key: 'weapon.bombarda.splash.radius', stage: 'baseFlat' as const, value: 2 }]
      : item.id === 'cycle.2' ? [{ type: 'stat' as const, key: 'weapon.needle.attackSpeed', stage: 'mult' as const, value: 1.5 }]
      : item.id === 'cycle.6' ? [
        { type: 'stat' as const, key: 'weapon.pick.combo.attacksRequired', stage: 'exitFlat' as const, value: -2 },
        { type: 'stat' as const, key: 'weapon.spear.combo.attacksRequired', stage: 'exitFlat' as const, value: -2 },
        { type: 'stat' as const, key: 'weapon.bombarda.combo.attacksRequired', stage: 'exitFlat' as const, value: -3 },
        { type: 'stat' as const, key: 'weapon.pick.combo.cooldownMultiplier', stage: 'mult' as const, value: 0.5 },
        { type: 'stat' as const, key: 'weapon.spear.combo.cooldownMultiplier', stage: 'mult' as const, value: 0.5 },
      ]
      : item.id === 'cycle.5' ? [{ type: 'stat' as const, key: 'weapon.ranged.damage', stage: 'outputMult' as const, value: 1.5 }]
      : item.id === 'cycle.10' ? [{ type: 'stat' as const, key: 'weapon.hard.damage', stage: 'outputMult' as const, value: 1.1 }]
      : item.id === 'cycle.12' ? [{ type: 'stat' as const, key: 'weapon.attackSpeed', stage: 'mult' as const, value: 1.1 }]
      : item.id === 'cycle.14' ? [{ type: 'stat' as const, key: 'weapon.elemental.damage', stage: 'outputMult' as const, value: 1.1 }]
      : item.id === 'cycle.11' ? [{ type: 'stat' as const, key: 'alchemy.productionSpeed', stage: 'mult' as const, value: 1.05 }]
      : [] })),
  new OneTimeUpgrade({ id: 'spectrum.approach', name: 'Подход теоремы Спектра', description: 'Открывает улучшения бесконечности.',
    baseCost: { crystals: 1000, earth: 1000, water: 1000, air: 1000, fire: 1000 }, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['infinity', 'spectrum'], effects: [] }),
  new RepeatableUpgrade({ id: 'infinity.breakthrough', name: 'Множитель очков прорыва', description: 'Удваивает очки прорыва за завершённый цикл.',
    maxLevel: 20, baseCost: { breakthrough: 1 }, costMultiplier: 2, requiresUpgrades: {}, requiresResources: {}, tags: ['infinity'],
    effects: [{ type: 'stat', key: 'progression.breakthrough', stage: 'outputMult', value: 2 }] }),
  new RepeatableUpgrade({ id: 'infinity.space-folding', name: 'Складывание пространства', description: 'Здоровье породы ×2; каждый уровень позволяет пройти на одну карту дальше за зачистку (уровень I — сразу 2 карты). Максимум IV.',
    maxLevel: 4, baseCost: { breakthrough: 1 }, costMultiplier: 2, requiresUpgrades: {}, requiresResources: {}, tags: ['infinity', 'world'],
    effects: [{ type: 'stat', key: 'world.space-folding', stage: 'baseFlat', value: 1 }] }),
];

function freshRun(): NativeRun {
  return { layer: 0, furthest: 0, completions: 0, boss: 0, boundary: null, clicks: 0, message: 'Нажимайте на карту, чтобы ускорить добычу.',
    unlocked: { fists: true }, challengeDone: {}, challenge: 0, challengeTime: 0, challengeGoal: 0, regenClock: 0, earthBuff: false,
    elementalization: false, overloadRemaining: 0, overloadUsed: false, overloadCount: 0, endChargeRemaining: 0, stimpackRemaining: 0, backup: null };
}
export function getRun(state: { readonly moduleData: Readonly<Record<string, unknown>> }): NativeRun { return state.moduleData.run as NativeRun; }
function isCycleActive(state: {
  readonly upgradeLevels: Readonly<Record<string, number>>;
  readonly upgradeEnabled: Readonly<Record<string, boolean>>;
  readonly upgradeSuppressions?: Readonly<Record<string, { readonly all: boolean; readonly upgradeIds: readonly string[]; readonly tags: readonly string[] }>>;
}, id: string): boolean {
  const suppressed = Object.values(state.upgradeSuppressions ?? {}).some(rule => rule.all || rule.upgradeIds.includes(id) || rule.tags.includes('cycle'));
  return (state.upgradeLevels[id] ?? 0) > 0 && state.upgradeEnabled[id] !== false && !suppressed;
}
function scaledValue(base: number, increment: number, fraction: number, steps: number): number {
  let value = base;
  for (let i = 0; i < steps; i++) value += increment + value * fraction;
  return value;
}
function bossLayer(layer: number, config: FrameworkConfig): boolean { return (layer + 1) % config.world.bossEveryLayers === 0 && layer + 1 < config.world.layers; }
function finalPlayableLayer(state: { readonly upgradeLevels: Readonly<Record<string, number>> }, config: FrameworkConfig): number {
  const folding = Math.min(4, state.upgradeLevels['infinity.space-folding'] ?? 0);
  if (!folding) return config.world.layers - 1;
  const stride = folding + 1;
  return Math.max(0, Math.floor(config.world.layers / stride) - 1) * stride;
}

class NativeGameplay implements GameModule {
  readonly id = 'gameplay';
  readonly priority = 0;
  constructor(private readonly config: FrameworkConfig) {}
  private resetVisualSnapshot(bus: StateAccess): { origin: { x: number; y: number }; tiles: TileState[] } {
    const state = bus.read(), actor = state.characters.main;
    return { origin: actor ? { ...actor.position } : { x: 0, y: 0 },
      tiles: Object.values(state.tiles).map(tile => ({ ...tile, position: { ...tile.position }, tags: [...tile.tags] })) };
  }
  onRegister(bus: StateAccess): void { bus.update(s => {
    s.moduleData.run ??= freshRun();
    const run = s.moduleData.run as NativeRun;
    run.elementalization ??= false; run.overloadRemaining ??= 0; run.overloadUsed ??= false; run.overloadCount ??= 0; run.endChargeRemaining ??= 0; run.stimpackRemaining ??= 0;
  }); }
  command(bus: StateAccess, command: GameCommand): boolean {
    const run = getRun(bus.read());
    if (command.type === 'click') { const capacity = this.config.input.clickBufferCapacity * (isCycleActive(bus.read(), 'cycle.15') ? 1.1 : 1); bus.update(() => { run.clicks = Math.min(capacity, run.clicks + this.config.input.clickGainPerPress); }); return true; }
    if (command.type === 'unlock-water' && !bus.read().paused && run.furthest >= 20 && !run.unlocked.water && bus.exchange(this.config.alchemy.unlockCosts.water, {})) {
      run.unlocked.water = true;
      return true;
    }
    if (command.type === 'earth-buff') { bus.update(() => { run.earthBuff = !run.earthBuff; }); return true; }
    if (command.type === 'elementalization' && run.challengeDone['1']) { run.elementalization = !run.elementalization; return true; }
    if (command.type === 'earth-overload' && run.furthest >= 20 && !run.overloadUsed && (bus.read().upgradeLevels['alchemy.earth-overload'] ?? 0) > 0 && bus.read().upgradeEnabled['alchemy.earth-overload'] !== false && bus.read().resources.earth.amount > 0 && bus.exchange({ earth: bus.read().resources.earth.amount }, {})) {
      run.overloadRemaining = this.config.alchemy.buffs.overloadSeconds; run.overloadUsed = true; run.overloadCount = 0; return true;
    }
    if (command.type === 'stimpack' && run.challenge === 4 && !bus.read().paused && bus.exchange({ fire: 10, air: 100, water: bus.read().resources.water.amount, earth: bus.read().resources.earth.amount }, {})) {
      run.stimpackRemaining = 10;
      run.message = 'Стимпакет активен: атака ×1,5 на 10 секунд.';
      return true;
    }
    if (command.type === 'compress') return this.compress(bus);
    if (command.type === 'enter-challenge' && typeof command.payload === 'number') return this.enterChallenge(bus, command.payload);
    if (command.type === 'leave-challenge' && run.challenge > 0) { this.leaveChallenge(bus, false); return true; }
    return false;
  }
  tick(bus: StateAccess, seconds: number): void {
    const run = getRun(bus.read());
    const map = Object.values(bus.read().maps)[0];
    if (!map) return;
    bus.update(s => {
      run.clicks = Math.max(0, run.clicks - (this.config.input.clickFlatDecayPerSecond + run.clicks * this.config.input.clickFractionDecayPerSecond) * seconds);
      const capacity = this.config.input.clickBufferCapacity * (isCycleActive(s, 'cycle.15') ? 1.1 : 1);
      const fraction = run.clicks / capacity;
      run.stimpackRemaining = Math.max(0, run.stimpackRemaining - seconds);
      const movement = bus.query('upgrades', { type: 'stat', payload: { base: this.config.characters.baseMovementSpeed, keys: ['character.moveSpeed'] } });
      for (const actor of Object.values(s.characters)) {
        actor.attackSpeed = this.config.characters.baseAttackSpeed * (1 + fraction * this.config.input.miningSpeedBonus) * (isCycleActive(s, 'cycle.12') ? 1.1 : 1) * (run.challenge === 4 && run.stimpackRemaining > 0 ? 1.5 : 1);
        actor.movementSpeed = (typeof movement === 'number' ? movement : this.config.characters.baseMovementSpeed) * (1 + fraction * this.config.input.movementSpeedBonus);
      }
      if (run.elementalization && s.resources.air.amount > 0) s.resources.air.amount = Math.max(0, s.resources.air.amount - this.config.alchemy.buffs.airPerSecond * seconds);
      if (run.overloadRemaining > 0) run.overloadRemaining = Math.max(0, run.overloadRemaining - seconds);
    });
    if (run.endChargeRemaining > 0 && !run.challenge) {
      run.endChargeRemaining = Math.max(0, run.endChargeRemaining - seconds);
      if (run.endChargeRemaining <= 1e-9) { run.endChargeRemaining = 0; this.resetRun(bus, true); }
      return;
    }
    if (run.challenge && run.challengeTime > 0) {
      run.challengeTime = Math.max(0, run.challengeTime - seconds);
      if (run.challengeTime === 0) { this.leaveChallenge(bus, false); return; }
    }
    if (!run.challenge && run.boss > 0) {
      run.boss = Math.max(0, run.boss - seconds);
      if (run.boss === 0) {
        const snapshot = this.resetVisualSnapshot(bus);
        run.layer = Math.max(0, Math.floor(run.layer / this.config.world.bossEveryLayers) * this.config.world.bossEveryLayers);
        this.makeMap(bus);
        run.message = 'Время босса вышло. Ресурсы сохранены.';
        bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'reset', snapshot } });
        return;
      }
    }
    if (this.compress(bus)) return;
    if (!run.challenge && run.boundary !== null && run.boss <= 0) {
      run.boundary -= seconds;
      if (run.boundary <= 0) { this.resetRun(bus, false); run.message = 'Граница настигла первопроходца.'; return; }
    }
    if (run.challenge === 3 || (run.challenge === 4 && run.layer < this.config.world.layers - 1)) {
      run.regenClock += seconds;
      if (run.regenClock >= 1) {
        run.regenClock %= 1;
        const challengeId = run.challenge === 3 ? 'three' : 'four';
        this.regenerate(bus, this.config.challenges[challengeId].regenerationFractionPerSecond);
      }
    }
    if (run.challenge === 3 && run.challengeGoal >= 10000) { this.leaveChallenge(bus, true); return; }
    if (Object.keys(bus.read().tiles).length > 0) return;
    const actor = bus.read().characters.main;
    if (!actor) return;
    if (actor.position.y > -0.5) {
      bus.invoke('movement', { type: 'move', payload: { intent: { characterId: 'main', destination: { x: actor.position.x, y: -0.5 }, stopDistance: 0, speedMultiplier: 1 }, seconds } });
      return;
    }
    if (run.challenge === 3) return;
    if (run.challenge && run.challenge !== 4) { this.leaveChallenge(bus, true); return; }
    if (!run.challenge && run.layer === finalPlayableLayer(bus.read(), this.config)) {
      if (this.config.world.finalChargeSeconds <= 0) { this.resetRun(bus, true); return; }
      run.endChargeRemaining = this.config.world.finalChargeSeconds;
      run.message = 'Финальная граница. Зарядка пробивного удара.';
      bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'charge' } });
      return;
    }
    const folding = run.challenge ? 0 : Math.min(4, bus.read().upgradeLevels['infinity.space-folding'] ?? 0);
    run.layer += folding ? folding + 1 : 1;
    if (!run.challenge) {
      run.furthest = Math.max(run.furthest, run.layer);
      if (run.layer % 5 === 0) bus.exchange({}, { crystals: 1 });
    }
    if (run.layer >= this.config.world.layers) {
      if (run.challenge === 4) this.leaveChallenge(bus, true); else this.resetRun(bus, true);
      return;
    }
    if (!run.challenge && run.layer === 3) run.boundary = this.config.world.layers * 12;
    this.makeMap(bus);
  }
  private compress(bus: StateAccess): boolean {
    const state = bus.read(), run = getRun(state), map = Object.values(state.maps)[0], settings = this.config.world;
    if (!settings.compressorEnabled || !map || (run.challenge !== 0 && run.challenge !== 4) || run.boss > 0 || (!run.challenge && bossLayer(run.layer, this.config)) || run.layer >= (run.challenge === 4 ? settings.layers - 1 : finalPlayableLayer(state, this.config))) return false;
    const active = bus.query('upgrades', { type: 'stat', payload: { base: 0, keys: ['world.compressor'] } });
    if (typeof active !== 'number' || active <= 0 || Object.keys(state.tiles).length / (map.width * map.height) > settings.compressorRemainingFraction) return false;
    run.layer++;
    if (!run.challenge) {
      run.furthest = Math.max(run.furthest, run.layer);
      if (run.layer % settings.bossEveryLayers === 0) bus.exchange({}, { crystals: 1 });
    }
    this.makeMap(bus);
    run.message = 'Пространственный сжиматель перенёс вас на следующий слой.';
    bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'compress' } });
    return true;
  }
  makeMap(bus: StateAccess): void {
    const run = getRun(bus.read());
    const c = this.config.world;
    const challenge = run.challenge;
    const rules = this.config.challenges[challenge === 1 ? 'one' : challenge === 2 ? 'two' : challenge === 3 ? 'three' : 'four'];
    const expansion = bus.query('upgrades', { type: 'stat', payload: { base: 0, keys: ['world.expansion'] } });
    const extra = typeof expansion === 'number' ? Math.min(c.maxExpansion, Math.max(0, Math.floor(expansion))) : 0;
    const width = challenge ? rules.width : c.width + extra, height = challenge ? rules.height : c.height + extra;
    const id = `layer:${run.layer}`;
    const tiles: Record<string, TileState> = {};
    const boss = !challenge && bossLayer(run.layer, this.config);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const growthSteps = Math.floor(run.layer / c.hpGrowthEveryLayers);
      const afterBoss = run.layer >= c.bossEveryLayers && run.layer < c.layers - 1 && run.layer % c.bossEveryLayers < c.postBossCompensationLayers;
      const worldY = run.layer * height + height - 1 - y;
      const nx = (x + c.mineralNoiseOffsetX) / c.mineralNoiseScale, ny = (worldY + c.mineralNoiseOffsetY) / c.mineralNoiseScale;
      const elementalRamp = Math.min(1, Math.max(0, (run.layer - (c.elementalMineralFirstLayer - 1)) / (c.elementalMineralFullLayer - c.elementalMineralFirstLayer)));
      const elementalThreshold = c.elementalRampStartThreshold + (c.elementalMineralThreshold - c.elementalRampStartThreshold) * elementalRamp;
      const elementalBoss = boss && run.layer + 1 === 25 && stoneTextureNoise(nx, ny, c.elementalMineralSeed + 250) > c.elementalBossThreshold;
      const elemental = !challenge && ((run.layer >= c.elementalMineralFirstLayer && stoneTextureNoise(nx, ny, c.elementalMineralSeed) > elementalThreshold) || elementalBoss);
      const hardThreshold = boss && run.layer + 1 < 25 ? c.bossHardThreshold : c.hardMineralThreshold;
      const hard = !challenge && !elemental && run.layer >= c.hardMineralFirstLayer && stoneTextureNoise(nx, ny, c.hardMineralSeed) > hardThreshold;
      const actualKind = elemental ? 'elemental' : hard ? 'hard' : 'stone';
      const actualBase = actualKind === 'hard' ? c.hardHealth : actualKind === 'elemental' ? c.elementalHealth : c.stoneHealth;
      let hp = scaledValue(actualBase, c.hpGrowthLinear, c.hpGrowthFraction, growthSteps);
      if (afterBoss) hp *= c.postBossHealthMultiplier;
      if (boss && !isCycleActive(bus.read(), 'cycle.8')) hp *= c.bossHealthMultiplier;
      const challengeHealth = challenge ? rules.stoneHealthMultiplier : 1;
      const foldingLevel = !challenge ? Math.min(4, bus.read().upgradeLevels['infinity.space-folding'] ?? 0) : 0;
      hp *= challenge ? challengeHealth : 2 ** foldingLevel;
      const tileId = `${id}:${x}:${y}`;
      tiles[tileId] = { id: tileId, mapId: id, position: { x, y }, kind: actualKind, health: hp, maxHealth: hp, armor: actualKind === 'hard' ? 1 - c.hardSplashMultiplier : 0, tags: [] };
    }
    bus.update(s => {
      s.maps = { [id]: { id, layer: run.layer, width, height, tags: boss ? ['boss', 'coordinate-indexed'] : ['coordinate-indexed'] } };
      s.tiles = tiles;
      for (const actor of Object.values(s.characters)) { actor.mapId = id; actor.position = { x: Math.floor(width / 2), y: height }; }
      s.moduleData.delivery = { flights: [], flashes: [] };
    });
    run.boss = boss ? c.bossTimeSeconds : 0;
    run.message = boss ? `Босс ${run.layer + 1}: успейте за ${c.bossTimeSeconds} секунд.` : `Квадрат ${run.layer + 1}`;
    bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'layer' } });
  }
  regenerate(bus: StateAccess, fraction: number): void {
    const state = bus.read(), map = Object.values(state.maps)[0];
    if (!map) return;
    const missing: { x: number; y: number }[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!state.tiles[`${map.id}:${x}:${y}`]) missing.push({ x, y });
    const count = Math.min(missing.length, Math.ceil(map.width * map.height * fraction));
    bus.update(s => {
      for (let i = 0; i < count; i++) {
        const index = i + Math.floor(Math.random() * (missing.length - i));
        [missing[i], missing[index]] = [missing[index], missing[i]];
        const point = missing[i], id = `${map.id}:${point.x}:${point.y}`;
        const run = getRun(s);
        const challengeRules = run.challenge === 3 ? this.config.challenges.three : this.config.challenges.four;
        const healthScale = run.challenge ? challengeRules.stoneHealthMultiplier : 1;
        const health = this.config.world.stoneHealth * healthScale;
        s.tiles[id] = { id, mapId: map.id, position: point, kind: 'stone', health, maxHealth: health, armor: 0, tags: [] };
      }
      if (getRun(s).challenge === 4) for (const tile of Object.values(s.tiles)) tile.health = Math.min(tile.maxHealth, tile.health + tile.maxHealth * 0.05);
    });
    bus.emit({ type: 'terrain.full-dirty', source: this.id, payload: { mapId: map.id } });
  }
  resetRun(bus: StateAccess, completed: boolean): void {
    const run = getRun(bus.read());
    const snapshot = completed ? undefined : this.resetVisualSnapshot(bus);
    bus.update(s => {
      if (completed) {
        const basePoints = this.config.progression.breakthroughPerCompletion;
        const multiplier = bus.query('upgrades', { type: 'stat', payload: { base: 1, keys: ['progression.breakthrough'] } });
        s.resources.breakthrough.amount += Math.max(1, Math.floor(basePoints * (typeof multiplier === 'number' ? multiplier : 1)));
        run.completions++; run.furthest = Math.max(run.furthest, this.config.world.layers);
      }
      for (const id of ['ore', 'stone', 'elementalStone', 'earth', 'water', 'air', 'fire']) s.resources[id].amount = 0;
      run.layer = completed && isCycleActive(s, 'cycle.4') ? this.config.world.bossEveryLayers : 0;
      run.boundary = run.layer >= 3 ? this.config.world.layers * 12 : null; run.clicks = 0; run.boss = 0; run.overloadRemaining = 0; run.overloadUsed = false; run.overloadCount = 0; run.endChargeRemaining = 0;
      if (completed && isCycleActive(s, 'cycle.7')) s.resources.water.amount = Math.min(s.resources.water.capacity ?? Infinity, 100);
    });
    this.makeMap(bus);
    run.message = completed ? 'Прорыв завершён: получено очко прорыва.' : 'Забег начат заново.';
    bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: completed ? 'complete' : 'reset', snapshot } });
  }
  enterChallenge(bus: StateAccess, number: number): boolean {
    const state = bus.read(), run = getRun(state), unlock = [0, 35, 40, 45, 50][number];
    if (!unlock || run.challenge || run.endChargeRemaining > 0 || run.furthest < unlock || (number === 3 && !run.challengeDone['1'])) return false;
    const snap = bus.snapshot();
    run.backup = { maps: snap.maps, tiles: snap.tiles, characters: snap.characters, resources: snap.resources, layer: run.layer, boss: run.boss, boundary: run.boundary };
    run.challenge = number; run.challengeTime = number === 1 ? 60 : number === 2 ? 30 : number === 3 ? 120 : 0;
    run.challengeGoal = 0; run.regenClock = 0; run.layer = 0; run.boundary = null; run.boss = 0; run.stimpackRemaining = 0;
    if (number === 2) bus.update(s => { for (const actor of Object.values(s.characters)) actor.autonomousWeapons = []; });
    if (number === 3) bus.update(s => { s.resources.earth.amount = 2000; s.resources.water.amount = 100; });
    this.makeMap(bus);
    run.message = `Испытание ${number} началось.`;
    bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'challenge-enter' } });
    return true;
  }
  leaveChallenge(bus: StateAccess, won: boolean): void {
    const run = getRun(bus.read()), backup = run.backup, number = run.challenge;
    if (!number || !backup) return;
    if (won) run.challengeDone[String(number)] = true;
    bus.update(s => {
      s.maps = backup.maps; s.tiles = backup.tiles; s.characters = backup.characters; s.resources = backup.resources;
      if (won && number === 3) s.resources.fire.amount = Math.max(1, s.resources.fire.amount);
      s.moduleData.delivery = { flights: [], flashes: [] };
      if (won && number === 2) for (const actor of Object.values(s.characters)) for (const weapon of weaponIds) {
        if (run.unlocked[weapon] && (weapon !== 'fists' || (s.upgradeLevels['fists.combo'] ?? 0) > 0) && actor.weaponStates[weapon]) {
          actor.weaponStates[weapon].comboEnabled = true;
        }
      }
      run.layer = backup.layer; run.boss = backup.boss; run.boundary = backup.boundary;
      run.challenge = 0; run.challengeTime = 0; run.stimpackRemaining = 0; run.backup = null;
    });
    run.message = won ? `Испытание ${number} пройдено.` : `Испытание ${number} не пройдено.`;
    bus.emit({ type: 'run.visual-transition', source: this.id, payload: { kind: 'challenge-exit' } });
  }
}

class IsolationArtifact implements GameModule {
  readonly id = 'artifact';
  readonly priority = 25;
  onRegister(bus: StateAccess): void { bus.update(s => { s.moduleData.artifact ??= { elapsed: 0 }; }); }
  tick(bus: StateAccess, seconds: number): void {
    const run = getRun(bus.read());
    if (!run.unlocked.artifact || run.challenge === 2) return;
    const timer = bus.read().moduleData.artifact as { elapsed: number };
    timer.elapsed += seconds;
    if (timer.elapsed < 1) return;
    timer.elapsed %= 1;
    const state = bus.read(), actor = state.characters.main, map = actor && state.maps[actor.mapId];
    if (!actor || !map) return;
    const tiles = Object.values(state.tiles).filter(tile => tile.mapId === map.id);
    const occupied = new Uint8Array(map.width * map.height);
    for (const tile of tiles) occupied[tile.position.y * map.width + tile.position.x] = 1;
    const strength = 0.03 * (2 + (state.upgradeLevels[`${actor.controlledWeapon ?? 'fists'}.damage`] ?? 0) * 2);
    const hits: { tileId: string; damage: number }[] = [];
    for (const tile of tiles) {
      let neighbors = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = tile.position.x + dx, y = tile.position.y + dy;
        if ((dx || dy) && x >= 0 && x < map.width && y >= 0 && y < map.height && occupied[y * map.width + x]) neighbors++;
      }
      hits.push({ tileId: tile.id, damage: strength * (1 + 4 * (1 - neighbors / 24) ** 4) });
    }
    new StateMapAccess(bus).damageBatch(hits);
  }
}

class ResourceCapacities implements GameModule {
  readonly id = 'capacity';
  readonly priority = 5;
  constructor(private readonly config: FrameworkConfig) {}
  onRegister(bus: StateAccess): void { this.refresh(bus); }
  tick(bus: StateAccess): void { this.refresh(bus); }
  command(bus: StateAccess, command: GameCommand): boolean { if (command.type !== 'refresh') return false; this.refresh(bus); return true; }
  private refresh(bus: StateAccess): void {
      for (const id of ['stone', 'elementalStone', 'earth', 'water', 'air', 'fire']) {
      const base = this.config.alchemy.resources[id].capacity;
      if (base === null) continue;
      const value = bus.query('upgrades', { type: 'stat', payload: { base, keys: [`alchemy.${id}.capacity`] } });
      if (typeof value === 'number') bus.update(s => {
        const capacity = Math.max(0, value);
        s.resources[id].capacity = capacity;
        s.resources[id].amount = Math.min(s.resources[id].amount, capacity);
      });
    }
  }
}

export class FrameworkGame {
  readonly bus: StateBus;
  readonly config: FrameworkConfig;
  private readonly gameplay: NativeGameplay;
  private readonly shop: ReturnType<typeof upgrades>;
  constructor(initial?: GameState) {
    const config = structuredClone(DEFAULT_CONFIG);
    for (const weapon of Object.values(config.weapons)) weapon.combo.enabled = true;
    config.weapons.fists.area.edgeDamageMultiplier = 0.35;
    if ((initial?.upgradeLevels['fists.splash'] ?? 0) > 0) config.weapons.fists.area.shape = 'circle';
    for (const recipe of Object.values(config.alchemy.recipes)) recipe.enabled = !!recipe.passive;
    const assembled = createDraftFramework(config, initial);
    this.bus = assembled.bus; this.config = assembled.config;
    this.shop = upgrades(this.config);
    this.bus.replace(new UpgradeModule(this.shop));
    this.bus.register(new ResourceCapacities(this.config));
    this.gameplay = new NativeGameplay(this.config);
    this.bus.register(this.gameplay);
    this.bus.register(new DeliveryModule({ damage: (tile, base, hit, bus) => {
      const run = getRun(bus.read());
      if (run.challenge === 2 && hit.splash && !hit.combo) return 0;
      let amount = base * (tile.kind === 'hard' && hit.splash ? 1 - Math.max(0, tile.armor - hit.penetration) : 1);
      if (run.challenge === 4 && run.stimpackRemaining > 0) amount *= 1.5;
      if (tile.kind === 'hard' && isCycleActive(bus.read(), 'cycle.10')) amount *= 1.1;
      if (tile.kind === 'elemental' && isCycleActive(bus.read(), 'cycle.14')) amount *= 1.1;
      const currentTile = bus.read().tiles[tile.id];
      const alreadyMarked = currentTile?.tags.includes(EARTH_MARKED_TAG) ?? tile.tags.includes(EARTH_MARKED_TAG);
      let empowered = base > 0 && run.earthBuff && alreadyMarked;
      if (base > 0 && run.earthBuff && !alreadyMarked && bus.exchange({ earth: 2 }, {})) {
        empowered = true;
        bus.update(state => {
          const hitTile = state.tiles[tile.id];
          if (hitTile && !hitTile.tags.includes(EARTH_MARKED_TAG)) hitTile.tags.push(EARTH_MARKED_TAG);
        });
      }
      if (tile.kind === 'elemental') amount *= empowered ? 1 : Math.max(0.2, Math.min(1, hit.elementalPenetration));
      if (empowered) amount *= this.config.alchemy.buffs.earthDamageMultiplier;
      return amount;
    } }, { burnTickSeconds: 0.5, burnDamageFraction: this.config.weapons.needle.projectile.burnDamageFraction,
      earthDamageMultiplier: this.config.alchemy.buffs.earthDamageMultiplier, meleeHitDamage: bus => {
      const actor = bus.read().characters.main, id = actor?.controlledWeapon ?? 'fists';
      const weapon = this.config.weapons[id] ?? this.config.weapons.fists;
      const value = bus.query('upgrades', { type: 'stat', payload: { base: weapon.damage, keys: ['weapon.damage', 'weapon.melee.damage', `weapon.${id}.damage`] } });
      return typeof value === 'number' && Number.isFinite(value) ? value : weapon.damage;
    } }));
    this.bus.register(new IsolationArtifact());
    this.bus.subscribe(event => {
      if (event.type !== 'tile.destroyed') return;
      const tile = (event.payload as { tile: TileState }).tile, run = getRun(this.bus.read());
      const weight = tile.kind === 'hard' ? 3 : tile.kind === 'elemental' ? 2 : 1;
      const converted = tile.kind !== 'elemental' && run.elementalization && this.bus.read().resources.air.amount > 0 && Math.random() < this.config.alchemy.buffs.elementalizationChance;
      const world = this.config.world, layer = Math.max(0, run.layer);
      const oreBase = world.oreRewardByKind[tile.kind === 'hard' || tile.kind === 'elemental' ? tile.kind : 'stone'];
      const ore = Math.floor(scaledValue(oreBase, world.oreRewardLinear, world.oreRewardFraction, Math.floor(layer / 2)));
      const isBoss = this.bus.read().maps[tile.mapId]?.tags.includes('boss') ?? false;
      const rewards: Record<string, number> = { stone: weight * (isCycleActive(this.bus.read(), 'cycle.9') ? 1.1 : 1), ore: ore * (isBoss && isCycleActive(this.bus.read(), 'cycle.13') ? 2 : 1) };
      if (tile.kind === 'elemental') rewards.elementalStone = 1;
      if (converted) { rewards.elementalStone = (rewards.elementalStone ?? 0) + 1; if (run.challenge === 3) run.challengeGoal++; }
      if (run.overloadRemaining > 0 && ++run.overloadCount % 2 === 0) rewards.elementalStone = (rewards.elementalStone ?? 0) + 1;
      if (tile.kind === 'elemental' && Math.random() < 1 / 500) rewards.crystals = 1;
      for (const id of ['stone', 'elementalStone']) {
        const resource = this.bus.read().resources[id];
        if (resource.capacity !== null) rewards[id] = Math.min(rewards[id] ?? 0, Math.max(0, resource.capacity - resource.amount));
      }
      this.bus.exchange({}, rewards);
    });
    if (!Object.keys(this.bus.read().maps).length) this.gameplay.makeMap(this.bus);
  }
  static load(): FrameworkGame {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const data = raw ? JSON.parse(raw) as GameState : undefined;
      if (data?.version === 1 && data.resources && data.characters && data.maps && data.tiles && data.moduleData?.run) return new FrameworkGame(data);
    } catch { /* Повреждённое сохранение не мешает новой игре. */ }
    return new FrameworkGame();
  }
  save(): boolean { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.bus.snapshot())); return true; } catch { return false; } }
  debugGrantResources(): boolean {
    if (this.bus.read().paused) return false;
    return this.bus.exchange({}, { ore: 10000, crystals: 10 });
  }
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    let left = Math.min(seconds, 1);
    while (left > 1e-9) { const dt = Math.min(left, this.config.simulation.stepSeconds); this.bus.tick(dt); left -= dt; }
  }
  buyUpgrade(id: string): boolean {
    const run = getRun(this.bus.read());
    const radiusWeapon = id.endsWith('.radius') ? id.slice(0, -'.radius'.length) : '';
    const radiusLevel = this.bus.read().upgradeLevels[id] ?? 0;
    const preCycleRadiusCap: Record<string, number> = { fists: 5, pick: 4, spear: 4, bombarda: 4 };
    if (preCycleRadiusCap[radiusWeapon] !== undefined && radiusLevel >= preCycleRadiusCap[radiusWeapon] && !isCycleActive(this.bus.read(), 'cycle.3')) return false;
    if (uniqueItems.some(item => item.id === id) && !run.challengeDone['1']) return false;
    if (id === 'fists.splash' && (this.bus.read().upgradeLevels['fists.radius'] ?? 0) < 1) return false;
    if (id === 'bombarda.elemental' && !run.challengeDone['1']) return false;
    if (alchemyItems.some(item => item.id === id) && (run.furthest < 20 || (id === 'alchemy.water1' && !run.unlocked.water) || (id.startsWith('alchemy.air') && !run.challengeDone['3']) || (id === 'alchemy.fire1' && !run.challengeDone['3']))) return false;
    if (id === 'alchemy.fire-speed' && !this.bus.read().upgradeLevels['spectrum.approach']) return false;
    if (id === 'alchemy.earth-overload' && (run.furthest < 20 || !run.unlocked.water)) return false;
    if ((id === 'alchemy.vulcanization-unlock' || id === 'alchemy.decomposition-unlock') && !run.challengeDone['3']) return false;
    if ((id === 'cycle.expansion' || id.startsWith('cycle.')) && !run.completions) return false;
    if (id === 'spatial.compressor' && (!this.config.world.compressorEnabled || run.furthest < this.config.world.compressorUnlockLayer || (run.challenge && run.challenge !== 4))) return false;
    if (id === 'spectrum.approach' && !run.challengeDone['4']) return false;
    if (id.startsWith('infinity.') && (!run.challengeDone['4'] || !this.bus.read().upgradeLevels['spectrum.approach'])) return false;
    const bought = this.bus.invoke('upgrades', { type: 'buy', payload: id });
    if (bought) this.bus.invoke('capacity', { type: 'refresh', payload: null });
    if (bought && id === 'spatial.compressor') this.bus.invoke('gameplay', { type: 'compress', payload: null });
    if (bought && id === 'fists.combo') this.bus.update(s => { const fists = s.characters.main?.weaponStates.fists; if (fists) fists.comboEnabled = true; });
    if (bought && id === 'fists.splash') this.config.weapons.fists.area.shape = 'circle';
    return bought;
  }
  upgradeCost(id: string): Record<string, number> | undefined {
    const item = this.shop.find(item => item.id === id); if (!item) return undefined;
    const discount = upgradeItems.some(upgrade => upgrade.id === id) && isCycleActive(this.bus.read(), 'cycle.16') ? 0.97 : 1;
    return item.cost(this.bus.read().upgradeLevels[id] ?? 0, discount, this.bus.read());
  }
  equip(id: string): boolean {
    const item = equipment.find(item => item.id === id), state = this.bus.read(), run = getRun(state);
    if (!item || state.paused || (run.challenge === 2 && item.kind === 'ranged') || (id === 'bombarda' && !run.challengeDone['4'])) return false;
    if (!run.unlocked[id]) {
      if (run.furthest < item.layer || !this.bus.exchange({ ore: item.cost, ...(id === 'spear' ? { crystals: 5 } : {}) }, {})) return false;
      run.unlocked[id] = true;
    }
    if (item.kind === 'ranged') this.bus.update(s => { s.characters.main.autonomousWeapons = []; });
    const equipped = this.bus.invoke('weapons', { type: 'equip', payload: { characterId: 'main', weaponId: id } });
    if (equipped && id !== 'fists' && run.challengeDone['2']) this.bus.update(s => {
      const weapon = s.characters.main?.weaponStates[id]; if (weapon) weapon.comboEnabled = true;
    });
    return equipped;
  }
  toggleCombo(): boolean {
    const actor = this.bus.read().characters.main, run = getRun(this.bus.read()), id = actor.controlledWeapon;
    if (!id || (id === 'fists' && !(this.bus.read().upgradeLevels['fists.combo'] ?? 0)) || (id !== 'fists' && !run.challengeDone['2'])) return false;
    return this.bus.invoke('weapons', { type: 'set-combo', payload: { characterId: 'main', weaponId: id, enabled: !actor.weaponStates[id]?.comboEnabled } });
  }
  toggleRecipe(id: string): boolean {
    const run = getRun(this.bus.read());
    if (this.config.alchemy.recipes[id]?.passive) return false;
    if (id === 'vulcanization' && (this.bus.read().upgradeLevels['alchemy.vulcanization-unlock'] ?? 0) <= 0) return false;
    if (id === 'decomposition' && (this.bus.read().upgradeLevels['alchemy.decomposition-unlock'] ?? 0) <= 0) return false;
    if (id === 'vulcanization' && run.challenge === 4) return false;
    if ((id === 'earth' || id === 'water' || id === 'air' || id === 'fire' || id === 'vulcanization' || id === 'decomposition') && run.furthest < 20) return false;
    if (id === 'water' && !run.unlocked.water) return false;
    if (id === 'air' && !run.challengeDone['1']) return false;
    if ((id === 'fire' || id === 'vulcanization' || id === 'decomposition') && !run.challengeDone['3']) return false;
    const key = `alchemy.${id}`, data = this.bus.read().moduleData[key] as { enabled?: boolean } | undefined;
    return !!data && this.bus.invoke(key, { type: 'set-enabled', payload: !data.enabled });
  }
  unlockWater(): boolean { return this.bus.invoke('gameplay', { type: 'unlock-water', payload: null }); }
  buyArtifact(): boolean {
    const run = getRun(this.bus.read());
    if (this.bus.read().paused || run.furthest < 25 || run.unlocked.artifact || !this.bus.exchange({ crystals: 5 }, {})) return false;
    run.unlocked.artifact = true; return true;
  }
  enterChallenge(id: number): boolean { return this.bus.invoke('gameplay', { type: 'enter-challenge', payload: id }); }
  leaveChallenge(): void { this.bus.invoke('gameplay', { type: 'leave-challenge', payload: null }); }
}
