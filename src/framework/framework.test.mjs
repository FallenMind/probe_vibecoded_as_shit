import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { createDraftFramework, addCharacter, resolveStat, resolveStartingLayer, resolveRadiusLevelLimit, ChallengeWithUpgradeRestrictions, UpgradeModule, DEFAULT_CONFIG, StateBus, BreachAlchemyConversions, StateMapAccess, AnimationClip, AnimationSystem, createFalloffDamage, BreachWorldRules, BreachDamagePolicy, CombatModule, BreachWeaponEffects } = await server.ssrLoadModule('/src/framework/index.ts');
const { BREACH_CONFIG: gameConfig } = await server.ssrLoadModule('/src/game/breachConfig.ts');
after(() => server.close());

test('анимация рывка копья хранится отдельно от игровой атаки и заканчивается по таймеру', () => {
  const effects = new BreachWeaponEffects();
  effects.attack('spear', 0, 3, 4, true, { fromX: 1, fromY: 2, toX: 3, toY: 4 });
  assert.deepEqual(effects.spearActorPosition(0), { x: 1, y: 2 });
  effects.tick(gameConfig.chargedAttackSeconds * 0.7);
  assert.deepEqual(effects.spearActorPosition(0), { x: 3, y: 4 });
  effects.tick(gameConfig.chargedAttackSeconds);
  assert.equal(effects.spearActorPosition(0), null);
});

test('боевой модуль применяет прямое попадание и сплеш отдельно и не применяет неготовый снаряд', () => {
  const { bus } = createDraftFramework();
  const maps = new StateMapAccess(bus);
  maps.addMap({ id: 'start', layer: 0, width: 4, height: 4, tags: [] });
  for (const [id, x] of [['target', 1], ['neighbor', 2]]) maps.addTile({ id, mapId: 'start', position: { x, y: 1 }, kind: 'stone', health: 20, maxHealth: 20, armor: 0, tags: [] });
  bus.register(new CombatModule({ damage: (_tile, amount) => amount }));
  const attack = { weaponId: 'pick', characterId: 'main', origin: { x: 0, y: 1 }, delivery: 'contact',
    direct: { targetId: 'target', point: { x: 1, y: 1 }, damage: 10, penetration: 0, elementalPenetration: 0 },
    splash: [{ shape: 'circle', center: { x: 1, y: 1 }, radius: 2, arcDegrees: 360, damage: 8, falloff: 1, edgeDamageMultiplier: 0, penetration: 0, elementalPenetration: 0, excludedTargetId: 'target' }] };
  assert.equal(bus.invoke('combat', { type: 'attack', payload: attack }), true);
  assert.equal(maps.getTile('target').health, 10);
  assert.equal(maps.getTile('neighbor').health, 16);
  assert.equal(bus.invoke('combat', { type: 'attack', payload: { ...attack, delivery: 'projectile' } }), false);
  assert.equal(maps.getTile('target').health, 10);
});

test('оружие на шине передаёт контактную атаку зарегистрированному боевому модулю', () => {
  const { bus } = createDraftFramework();
  const maps = new StateMapAccess(bus);
  maps.addMap({ id: 'start', layer: 0, width: 3, height: 3, tags: [] });
  maps.addTile({ id: 'rock', mapId: 'start', position: { x: 1, y: 0 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] });
  bus.update(state => { state.characters.main.position = { x: 0, y: 0 }; });
  bus.register(new CombatModule({ damage: (_tile, amount) => amount }));
  bus.tick(0.55);
  assert.equal(maps.getTile('rock').health, 8);
  bus.setPaused(true);
  bus.tick(1);
  assert.equal(maps.getTile('rock').health, 8);
});

test('правила мира сохраняют генерацию, рост здоровья и настройки боссов', () => {
  const rules = new BreachWorldRules({ ...gameConfig, ordinaryStoneHp: 3 }, () => 1);
  assert.equal(rules.stoneHealth('stone', 0), 3);
  assert.equal(rules.stoneHealth('hard', 4, false), 7);
  assert.ok(rules.stoneHealth('hard', 4) > rules.challengeHealth('hard', 4));
  assert.equal(rules.stoneKind(18, 0, 0, 25, { tutorial: false, bosses: true }), 'hard');
  assert.equal(rules.stoneKind(19, 0, 0, 25, { tutorial: false, bosses: true }), 'elemental');
  assert.equal(rules.stoneKind(24, 0, 0, 25, { tutorial: false, bosses: true }), 'elemental');
  const small = new BreachWorldRules({ ...gameConfig, ordinaryStoneHp: 3, blockCount: 3 }, () => 0).generate(2, true, true);
  assert.equal(small.length, 12);
  assert.ok(small.filter(tile => tile.block === 2).every(tile => tile.kind === 'hard'));
  assert.ok(rules.oreReward('hard', 10) > rules.oreReward('hard', 0));
});

test('правила урона учитывают тяжёлую и элементальную породу и расход земли', () => {
  const policy = new BreachDamagePolicy({ hardSplashMultiplier: 0.15, elementalResistance: 5, elementalPierceEfficiency: 0.25,
    earthPerStone: 2, unoptimizedEarthMultiplier: 5, earthDamageMultiplier: 2, stoneWeights: { stone: 1, hard: 3, elemental: 2 } });
  const base = { kind: 'hard', amount: 100, splash: true, weaponHit: true, elementalPierce: false, armorPenetration: 0,
    earthHit: true, earthEnabled: false, earthAvailable: 100, earthOptimized: false, challengeMultiplier: 1, hardBonus: 0, elementalBonus: 0, globalBonus: 0 };
  assert.equal(policy.calculate(base).damage, 15);
  assert.equal(policy.calculate({ ...base, armorPenetration: 1 }).damage, 100);
  assert.equal(policy.calculate({ ...base, kind: 'elemental', elementalPierce: true }).damage, 25);
  assert.deepEqual(policy.calculate({ ...base, kind: 'elemental', earthEnabled: true }), { damage: 200, empowered: true, earthCost: 20 });
  assert.equal(policy.calculate({ ...base, kind: 'elemental', earthEnabled: true, earthAvailable: 19 }).damage, 20);
});

test('области выбирают клетки нужной карты по форме и исключают прямую цель', () => {
  const maps = new StateMapAccess(new StateBus());
  for (const id of ['one', 'two']) maps.addMap({ id, layer: 0, width: 5, height: 5, tags: [] });
  for (const [id, x, y] of [['center', 2, 2], ['east', 3, 2], ['west', 1, 2], ['north', 2, 1], ['diagonal', 3, 3], ['far', 4, 2]])
    maps.addTile({ id, mapId: 'one', position: { x, y }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] });
  maps.addTile({ id: 'other-map', mapId: 'two', position: { x: 2, y: 2 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] });
  const ids = selection => maps.selectArea({ mapId: 'one', ...selection }).map(tile => tile.id).sort();
  assert.deepEqual(ids({ area: { shape: 'circle', center: { x: 2, y: 2 }, radius: 1 }, excludeTileIds: ['center'] }), ['east', 'north', 'west']);
  assert.deepEqual(ids({ area: { shape: 'cross', center: { x: 2, y: 2 }, radius: 2 } }), ['center', 'east', 'far', 'north', 'west']);
  assert.deepEqual(ids({ area: { shape: 'arc', center: { x: 2, y: 2 }, radius: 2, direction: { x: 1, y: 0 }, degrees: 90 } }), ['center', 'diagonal', 'east', 'far']);
  assert.deepEqual(ids({ area: { shape: 'rectangle', bounds: { minX: 2, minY: 2, maxX: 3, maxY: 3 } } }), ['center', 'diagonal', 'east']);
  assert.deepEqual(ids({ area: { shape: 'path', from: { x: 1, y: 2 }, to: { x: 4, y: 2 }, radius: 0 } }), ['center', 'east', 'far', 'west']);
  assert.throws(() => ids({ area: { shape: 'circle', center: { x: 2, y: 2 }, radius: -1 } }));
});

test('урон по площади и уничтожение сообщают события, сохраняя снимки и не задевая исключённую клетку', () => {
  const bus = new StateBus();
  const maps = new StateMapAccess(bus);
  maps.addMap({ id: 'map', layer: 0, width: 3, height: 1, tags: [] });
  for (let x = 0; x < 3; x++) maps.addTile({ id: String(x), mapId: 'map', position: { x, y: 0 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] });
  const events = [];
  bus.subscribe(event => events.push(event.type));
  const selection = { mapId: 'map', area: { shape: 'circle', center: { x: 1, y: 0 }, radius: 1 }, excludeTileIds: ['1'] };
  assert.throws(() => maps.damageArea(selection, tile => tile.id === '2' ? -1 : 3));
  assert.equal(maps.getTile('0').health, 10);
  assert.deepEqual(events, []);
  const hits = maps.damageArea(selection, (tile, distance) => tile.id === '0' ? 4 * distance : 12);
  assert.deepEqual(hits.map(hit => [hit.tile.id, hit.damage, hit.remainingHealth, hit.destroyed]), [['0', 4, 6, false], ['2', 10, 0, true]]);
  assert.equal(maps.getTile('1').health, 10);
  assert.equal(maps.getTile('2'), undefined);
  assert.deepEqual(events, ['tile.damaged', 'tile.damaged', 'tile.destroyed', 'tile.removed']);
  assert.equal(maps.damageTile('1', 0), undefined);
  const destroyed = maps.destroyArea({ mapId: 'map', area: { shape: 'rectangle', bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 } } });
  assert.deepEqual(destroyed.map(hit => hit.tile.id), ['0', '1']);
  assert.equal(maps.listTiles('map').length, 0);
});

test('общее затухание учитывает расстояние, край, кривую и степень', () => {
  const linear = createFalloffDamage({ damage: 100, radius: 4, edgeMultiplier: 0.2 });
  const smooth = createFalloffDamage({ damage: 100, radius: 4, edgeMultiplier: 0, curve: 'smoothstep', exponent: 2 });
  assert.equal(linear(null, 0), 100);
  assert.ok(Math.abs(linear(null, 2) - 60) < 1e-9);
  assert.equal(linear(null, 9), 20);
  assert.equal(smooth(null, 2), 25);
  assert.throws(() => createFalloffDamage({ damage: 1, radius: -1, edgeMultiplier: 0 }));
});

test('карты и камни проверяются, доступны по координатам и удаляются согласованно', () => {
  const bus = new StateBus();
  const maps = new StateMapAccess(bus);
  const events = [];
  bus.subscribe(event => events.push(event.type));
  const map = { id: 'first', layer: 0, width: 3, height: 3, tags: [] };
  const rock = { id: 'rock', mapId: 'first', position: { x: 1, y: 1 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] };
  assert.equal(maps.addMap(map), true);
  assert.equal(maps.addMap(map), false);
  assert.equal(maps.addTile(rock), true);
  rock.position.x = 2; // Внешнее изменение исходных данных не изменяет хранилище.
  assert.equal(maps.getTileAt('first', { x: 1, y: 1 }).id, 'rock');
  assert.equal(maps.addTile({ ...rock, id: 'occupied', position: { x: 1, y: 1 } }), false);
  assert.equal(maps.addTile({ ...rock, id: 'outside', position: { x: 3, y: 0 } }), false);
  assert.equal(maps.listTiles('first', { minX: 0, maxX: 1, minY: 0, maxY: 1 }).length, 1);
  assert.equal(maps.listTiles('first', { minX: 2, maxX: 2, minY: 2, maxY: 2 }).length, 0);
  bus.update(state => { state.characters.actor = { id: 'actor', mapId: 'first', position: { x: 0, y: 0 }, movementSpeed: 1, attackSpeed: 1, enabled: true, controlledWeapon: null, autonomousWeapons: [], weaponStates: {}, tags: [] }; });
  assert.equal(maps.removeMap('first'), false);
  bus.update(state => { delete state.characters.actor; });
  assert.equal(maps.removeTile('rock'), true);
  assert.equal(maps.removeTile('rock'), false);
  assert.equal(maps.addTile({ ...rock, id: 'other' }), true);
  assert.equal(maps.removeMap('first'), true);
  assert.equal(maps.getTile('other'), undefined);
  assert.deepEqual(events, ['map.added', 'tile.added', 'tile.removed', 'tile.added', 'map.removed']);
});

test('анимации воспроизводятся независимо, соблюдают паузу, скорость и повтор', () => {
  const pose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 };
  const clip = new AnimationClip('swing', 2, [{ at: 0, pose }, { at: 1, pose: { ...pose, x: 10 } }]);
  const loop = new AnimationClip('glow', 1, [{ at: 0, pose }, { at: 1, pose: { ...pose, alpha: 0 } }], true);
  const system = new AnimationSystem();
  const swing = system.play('actor:weapon', clip);
  const glow = system.play('actor:glow', loop);
  swing.speed = 2;
  glow.paused = true;
  system.tick(0.5);
  assert.equal(swing.pose().x, 5);
  assert.equal(glow.pose().alpha, 1);
  glow.paused = false;
  system.tick(0.75);
  assert.equal(swing.pose().x, 10);
  assert.equal(swing.finished, true);
  system.tick(0.5);
  assert.equal(glow.pose().alpha, 0.75);
  assert.equal(system.stop('actor:weapon'), true);
  assert.equal(system.get('actor:weapon'), undefined);
  assert.throws(() => { swing.speed = -1; });
});

test('действующие рецепты Земли и Воды учитывают сырьё и свободное место', () => {
  const conversions = new BreachAlchemyConversions();
  assert.equal(conversions.earth(100, 0, 2000, 0.1), 10);
  assert.equal(conversions.earth(3, 1999.5, 2000, 0.1), 0.5);
  assert.equal(conversions.water(100, 7, 0, 100, 0.1, 2), 3);
  assert.equal(conversions.water(100, 100, 98, 100, 0.1, 2), 2);
  assert.equal(conversions.water(0.9, 100, 0, 100, 0.1, 2), 0);
});

test('обмен ресурсов атомарен при нехватке сырья и переполнении', () => {
  const bus = new StateBus();
  bus.registerResource('earth', { amount: 10, capacity: 20 });
  bus.registerResource('water', { amount: 4, capacity: 5 });
  assert.equal(bus.exchange({ earth: 11 }, { water: 1 }), false);
  assert.equal(bus.exchange({ earth: 2 }, { water: 2 }), false);
  assert.deepEqual(bus.snapshot().resources, { earth: { amount: 10, capacity: 20 }, water: { amount: 4, capacity: 5 } });
  assert.equal(bus.exchange({ earth: 2 }, { water: 1 }), true);
  assert.equal(bus.read().resources.earth.amount, 8);
  assert.equal(bus.read().resources.water.amount, 5);
});

test('рецепт перерабатывает долю запаса и останавливается на паузе', () => {
  const { bus } = createDraftFramework();
  assert.equal(bus.exchange({}, { stone: 100 }), true);
  bus.tick(0.2);
  assert.equal(bus.read().resources.stone.amount, 90);
  assert.equal(bus.read().resources.earth.amount, 10);
  bus.setPaused(true);
  bus.tick(10);
  assert.equal(bus.invoke('alchemy.earth', { type: 'set-enabled', payload: false }), false);
  assert.equal(bus.read().resources.stone.amount, 90);
  bus.setPaused(false);
  assert.equal(bus.invoke('alchemy.earth', { type: 'set-enabled', payload: false }), true);
  bus.tick(1);
  assert.equal(bus.read().resources.stone.amount, 90);
});

test('оружие планирует атаки для каждого персонажа со своим таймером', () => {
  const { bus, config } = createDraftFramework();
  bus.update(state => {
    state.characters.main.position = { x: 0, y: 0 };
    state.tiles.rock = { id: 'rock', mapId: 'start', position: { x: 0, y: 1 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] };
  });
  assert.equal(addCharacter(bus, { id: 'second', mapId: 'start', position: { x: 0, y: 0 }, movementSpeed: 2, attackSpeed: 2,
    enabled: true, controlledWeapon: null, autonomousWeapons: [], weaponStates: {}, tags: [] }, config.characters.maxCount), true);
  assert.equal(bus.invoke('weapons', { type: 'equip', payload: { characterId: 'second', weaponId: 'fists' } }), true);
  const attacks = [];
  bus.subscribe(event => { if (event.type === 'combat.attack-planned') attacks.push(event.payload); });
  bus.tick(0.55);
  assert.equal(attacks.filter(attack => attack.characterId === 'main').length, 1);
  assert.equal(attacks.filter(attack => attack.characterId === 'second').length, 2);
  assert.equal(bus.read().characters.main.weaponStates.fists.attacks, 1);
  assert.equal(bus.read().characters.second.weaponStates.fists.attacks, 2);
});

test('улучшение покупается за общий ресурс и эффект вычисляется по уровню', async () => {
  const { exampleUpgrades } = await server.ssrLoadModule('/src/framework/upgrades/examples.ts');
  const { bus } = createDraftFramework();
  assert.equal(bus.exchange({}, { breakthrough: 1 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.melee' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.melee' }), false);
  assert.equal(bus.read().resources.breakthrough.amount, 0);
  assert.equal(resolveStat(10, 'weapon.melee.damage', exampleUpgrades.map(item => item.definition), bus.read()), 15);
});

test('четыре стадии баффов применяются в заданном порядке независимо от порядка улучшений', () => {
  const def = (id, effect) => ({ id, name: id, description: '', maxLevel: 10, baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, effects: [effect] });
  const upgrades = [
    def('out', { type: 'stat', key: 'damage', stage: 'outputMult', value: 2 }),
    def('exit', { type: 'stat', key: 'damage', stage: 'exitFlat', value: 5 }),
    def('mult', { type: 'stat', key: 'damage', stage: 'mult', value: 1.1, stacking: 'linear' }),
    def('base', { type: 'stat', key: 'damage', stage: 'baseFlat', value: 3 }),
  ];
  const state = { upgradeLevels: { base: 2, mult: 2, exit: 1, out: 1 }, upgradeEnabled: {} };
  assert.ok(Math.abs(resolveStat(10, 'damage', upgrades, state) - 48.4) < 1e-9);
  assert.ok(Math.abs(resolveStat(10, 'damage', [...upgrades].reverse(), state) - 48.4) < 1e-9);
  upgrades.find(upgrade => upgrade.id === 'mult').effects[0].stacking = 'compound';
  assert.ok(Math.abs(resolveStat(10, 'damage', upgrades, state) - 48.72) < 1e-9);
  state.upgradeEnabled.mult = false;
  assert.equal(resolveStat(10, 'damage', upgrades, state), 42);
});

test('выключение улучшения сохраняет покупку и уровень, новые уровни не включают его обратно', () => {
  const { bus } = createDraftFramework();
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'fists.damage', enabled: false } }), false);
  assert.equal(bus.exchange({}, { ore: 1000 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'fists.damage' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'fists.damage', enabled: false } }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'fists.damage' }), true);
  assert.equal(bus.read().upgradeLevels['fists.damage'], 2);
  assert.equal(bus.read().upgradeEnabled['fists.damage'], false);
  assert.equal(bus.query('upgrades', { type: 'stat', payload: { base: 2, keys: ['weapon.fists.damage'] } }), 2);
  assert.equal(bus.snapshot().upgradeEnabled['fists.damage'], false);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'fists.damage', enabled: true } }), true);
  assert.equal(bus.query('upgrades', { type: 'stat', payload: { base: 2, keys: ['weapon.fists.damage'] } }), 6);
});

test('улучшения цикла меняют правила через владельцев механик и выключаются', () => {
  const { bus } = createDraftFramework();
  assert.equal(bus.exchange({}, { breakthrough: 4 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.start' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.radius' }), true);
  assert.equal(resolveStartingLayer(bus, 0), 5);
  assert.equal(resolveRadiusLevelLimit(bus, 5, 'pick', 'melee'), 7);
  assert.equal(resolveRadiusLevelLimit(bus, 5, 'needle', 'ranged'), 5);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.start', enabled: false } }), true);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.radius', enabled: false } }), true);
  assert.equal(resolveStartingLayer(bus, 0), 0);
  assert.equal(resolveRadiusLevelLimit(bus, 5, 'pick', 'melee'), 5);
});

test('ограничение испытания временно подавляет эффекты и сохраняет выбор игрока и другие ограничения', async () => {
  const { bus } = createDraftFramework();
  assert.equal(bus.exchange({}, { ore: 100, breakthrough: 3 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'fists.damage' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.melee' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.start' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.melee', enabled: false } }), true);
  const rules = { id: 'sample', enter() {}, leave() {}, tick() {}, isComplete() { return false; } };
  const challenge = new ChallengeWithUpgradeRestrictions(rules, { tags: ['cycle'], upgradeIds: ['fists.damage'] });
  challenge.enter(bus);
  assert.equal(bus.query('upgrades', { type: 'stat', payload: { base: 2, keys: ['weapon.fists.damage'] } }), 2);
  assert.equal(resolveStartingLayer(bus, 0), 0);
  assert.deepEqual(bus.query('upgrades', { type: 'status', payload: 'cycle.melee' }).suppressedBy, ['challenge:sample']);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.melee', enabled: true } }), true);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'cycle.melee' }).active, false);
  assert.equal(bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.melee', enabled: false } }), true);
  assert.equal(bus.read().upgradeLevels['cycle.start'], 1);
  assert.equal(bus.invoke('upgrades', { type: 'set-suppression', payload: { source: 'event:storm', upgradeIds: ['fists.damage'] } }), true);
  assert.deepEqual(bus.snapshot().upgradeSuppressions['challenge:sample'].tags, ['cycle']);
  const { exampleUpgrades } = await server.ssrLoadModule('/src/framework/upgrades/examples.ts');
  const restored = new StateBus(bus.snapshot());
  restored.register(new UpgradeModule(exampleUpgrades));
  assert.equal(resolveStartingLayer(restored, 0), 0);
  assert.equal(restored.read().upgradeEnabled['cycle.melee'], false);
  challenge.leave(bus);
  assert.equal(resolveStartingLayer(bus, 0), 5);
  assert.equal(bus.read().upgradeEnabled['cycle.melee'], false);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'fists.damage' }).active, false);
  assert.equal(bus.invoke('upgrades', { type: 'clear-suppression', payload: 'event:storm' }), true);
  assert.equal(bus.query('upgrades', { type: 'stat', payload: { base: 2, keys: ['weapon.fists.damage'] } }), 4);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'cycle.melee' }).active, false);
});

test('общее ограничение действует и на новые покупки, а ошибка входа убирает ограничение', () => {
  const { bus } = createDraftFramework();
  assert.equal(bus.invoke('upgrades', { type: 'set-suppression', payload: { source: 'challenge:all', all: true } }), true);
  assert.equal(bus.exchange({}, { ore: 100 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'fists.damage' }), true);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'fists.damage' }).active, false);
  assert.equal(bus.invoke('upgrades', { type: 'clear-suppression', payload: 'challenge:all' }), true);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'fists.damage' }).active, true);
  const rules = { id: 'broken', enter() { throw new Error('enter failed'); }, leave() {}, tick() {}, isComplete() { return false; } };
  const challenge = new ChallengeWithUpgradeRestrictions(rules, { tags: ['repeatable'] });
  assert.throws(() => challenge.enter(bus), /enter failed/);
  assert.equal(Object.hasOwn(bus.read().upgradeSuppressions, 'challenge:broken'), false);
  assert.equal(bus.query('upgrades', { type: 'status', payload: 'fists.damage' }).active, true);
  const failsOnExit = new ChallengeWithUpgradeRestrictions({ ...rules, id: 'exit', enter() {}, leave() { throw new Error('leave failed'); } }, { all: true });
  failsOnExit.enter(bus);
  assert.throws(() => failsOnExit.leave(bus), /leave failed/);
  assert.equal(Object.hasOwn(bus.read().upgradeSuppressions, 'challenge:exit'), false);
});

test('прямое попадание и сплеш разделены для всех видов оружия, включая комбо', () => {
  for (const weaponId of ['fists', 'pick', 'spear', 'needle', 'emitter', 'bombarda']) {
    const config = structuredClone(DEFAULT_CONFIG);
    config.modules.alchemy = false;
    const weaponConfig = config.weapons[weaponId];
    weaponConfig.attackIntervalSeconds = 1;
    Object.assign(weaponConfig.combo, { enabled: true, attacksRequired: 2, cooldownMultiplier: 1, extraRadius: 2 });
    if (weaponId === 'needle') weaponConfig.projectile.pierce = 0.3;
    const { bus } = createDraftFramework(config);
    bus.update(state => {
      state.characters.main.position = { x: 0, y: 0 };
      state.tiles.rock = { id: 'rock', mapId: 'start', position: { x: 0, y: 1 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] };
    });
    assert.equal(bus.invoke('weapons', { type: 'equip', payload: { characterId: 'main', weaponId } }), true, weaponId);
    assert.equal(bus.invoke('weapons', { type: 'set-combo', payload: { characterId: 'main', weaponId, enabled: true } }), true, weaponId);
    const attacks = [];
    bus.subscribe(event => { if (event.type === 'combat.attack-planned' && event.payload.weaponId === weaponId) attacks.push(event.payload); });
    bus.tick(2);
    assert.equal(attacks.length, 2, weaponId);
    assert.equal(attacks[0].combo, false, weaponId);
    assert.equal(attacks[1].combo, true, weaponId);
    assert.equal(attacks[1].direct.targetId, 'rock', weaponId);
    assert.deepEqual(attacks[1].direct.point, { x: 0, y: 1 }, weaponId);
    assert.ok(attacks[1].splash.length > 0, weaponId);
    for (const splash of attacks[1].splash) assert.equal(splash.excludedTargetId, 'rock', weaponId);
    if (weaponId === 'needle') assert.ok(attacks[0].splash.some(splash => splash.shape === 'projectile-path'));
    assert.equal(bus.read().tiles.rock.health, 10, 'план атаки ещё не применяет урон');
  }
});

test('пайплайн усилений подключён к урону прямого удара оружия', () => {
  const { bus } = createDraftFramework();
  bus.update(state => {
    state.characters.main.position = { x: 0, y: 0 };
    state.tiles.rock = { id: 'rock', mapId: 'start', position: { x: 0, y: 1 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] };
  });
  assert.equal(bus.exchange({}, { ore: 100, breakthrough: 1 }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'fists.damage' }), true);
  assert.equal(bus.invoke('upgrades', { type: 'buy', payload: 'cycle.melee' }), true);
  const attacks = [];
  bus.subscribe(event => { if (event.type === 'combat.attack-planned') attacks.push(event.payload); });
  bus.tick(0.55);
  assert.equal(attacks.at(-1).direct.damage, 6);
  bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'cycle.melee', enabled: false } });
  bus.tick(0.55);
  assert.equal(attacks.at(-1).direct.damage, 4);
});

test('огненный рецепт требует Землю и Воздух и приостанавливается при нехватке', () => {
  const { bus } = createDraftFramework();
  bus.setEnabled('alchemy.earth', false);
  bus.setEnabled('alchemy.water', false);
  bus.setEnabled('alchemy.air', false);
  assert.equal(bus.exchange({}, { fire: 1, earth: 100, air: 10 }), true);
  bus.tick(5);
  assert.equal(bus.read().resources.stone.amount, 50);
  assert.equal(bus.read().resources.water.amount, 10);
  assert.equal(bus.exchange({ air: 1 }, {}), true);
  bus.tick(5);
  assert.equal(bus.read().resources.stone.amount, 50);
});
