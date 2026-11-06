import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { createDraftFramework, addCharacter, resolveStat, resolveStartingLayer, resolveRadiusLevelLimit, ChallengeWithUpgradeRestrictions, UpgradeModule, DEFAULT_CONFIG, StateBus } = await server.ssrLoadModule('/src/framework-draft/index.ts');
after(() => server.close());

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
  const { exampleUpgrades } = await server.ssrLoadModule('/src/framework-draft/upgrades/examples.ts');
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
  const { exampleUpgrades } = await server.ssrLoadModule('/src/framework-draft/upgrades/examples.ts');
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
