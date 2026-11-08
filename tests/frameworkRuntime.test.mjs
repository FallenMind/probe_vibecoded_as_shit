import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { FrameworkGame, getRun, SAVE_KEY } = await server.ssrLoadModule('/src/framework/runtime/game.ts');
const { GameVisuals } = await server.ssrLoadModule('/src/framework/animation/gameVisuals.ts');
const { StateMapAccess } = await server.ssrLoadModule('/src/framework/world/mapAccess.ts');
const { createScreenRenderer } = await server.ssrLoadModule('/src/framework/runtime/screen.ts');
after(() => server.close());
beforeEach(() => storage.clear());

test('персонаж не застревает после первого камня и добывает следующие', () => {
  const game = new FrameworkGame();
  for (let i = 0; i < 90; i++) game.advance(1);
  const s = game.bus.read();
  assert.ok(Object.keys(s.tiles).length <= 575, `осталось ${Object.keys(s.tiles).length}; персонаж ${JSON.stringify(s.characters.main.position)}`);
  assert.ok(s.resources.ore.amount >= 50);
});

test('сохранение на границе дистанции атаки продолжает добычу после загрузки', () => {
  const game = new FrameworkGame();
  const map = Object.values(game.bus.read().maps)[0];
  const id = `${map.id}:11:23`;
  game.bus.update(s => {
    s.tiles = { [id]: { id, mapId: map.id, position: { x: 11, y: 23 }, kind: 'stone', health: 10, maxHealth: 10, armor: 0, tags: [] } };
    s.characters.main.position = { x: 11.873909696866372, y: 23.486088306507085 };
  });
  assert.ok(Math.hypot(11.873909696866372 - 11, 23.486088306507085 - 23) > 1);
  assert.equal(game.save(), true);
  const loaded = FrameworkGame.load();
  loaded.advance(1);
  assert.ok(loaded.bus.read().tiles[id].health < 10);
});

test('режим использует карты, персонажа, ресурсы и оружие общего состояния', () => {
  const game = new FrameworkGame();
  const state = game.bus.read();
  assert.equal(Object.keys(state.maps).length, 1);
  assert.equal(Object.keys(state.tiles).length, 625);
  assert.equal(state.characters.main.controlledWeapon, 'fists');
  assert.equal(state.moduleData.breach, undefined);
  game.advance(1); game.advance(1);
  assert.ok(game.bus.read().resources.ore.amount > 0);
  assert.ok(Object.keys(game.bus.read().tiles).length < 625);
});

test('пауза останавливает механику и команды, затем игра продолжается', () => {
  const game = new FrameworkGame();
  game.advance(1);
  game.bus.setPaused(true);
  const before = game.bus.snapshot();
  assert.equal(game.bus.invoke('gameplay', { type: 'click', payload: null }), false);
  game.advance(2);
  assert.deepEqual(game.bus.snapshot(), before);
  game.bus.setPaused(false);
  game.advance(1);
  assert.ok(game.bus.read().elapsedSeconds > before.elapsedSeconds);
});

test('сохранение содержит состояние шины и восстанавливает персонажа и улучшения', () => {
  const game = new FrameworkGame();
  game.bus.update(s => { s.resources.ore.amount = 1000; });
  assert.equal(game.buyUpgrade('fists.damage'), true);
  game.advance(1);
  assert.equal(game.save(), true);
  assert.ok(storage.has(SAVE_KEY));
  const before = game.bus.snapshot();
  const loaded = FrameworkGame.load();
  assert.equal(loaded.bus.read().upgradeLevels['fists.damage'], 1);
  assert.deepEqual(loaded.bus.read().characters.main.position, before.characters.main.position);
  assert.equal(Object.keys(loaded.bus.read().tiles).length, Object.keys(before.tiles).length);
  loaded.advance(1);
  assert.ok(loaded.bus.read().elapsedSeconds > before.elapsedSeconds);
});

test('магазин и дальнее оружие подключены к общей шине', () => {
  const game = new FrameworkGame();
  getRun(game.bus.read()).furthest = 20;
  game.bus.update(s => { s.resources.ore.amount = 10000; });
  assert.equal(game.equip('needle'), true);
  assert.deepEqual(game.bus.read().characters.main.autonomousWeapons, ['needle']);
  assert.equal(game.equip('emitter'), true);
  assert.deepEqual(game.bus.read().characters.main.autonomousWeapons, ['emitter']);
  assert.equal(game.buyUpgrade('emitter.damage'), true);
  game.advance(2);
  assert.ok(game.bus.read().resources.ore.amount > 0);
});

test('улучшения оружия находятся под своим выбором и меняются независимо', () => {
  const previousDocument = globalThis.document, elements = new Map();
  globalThis.document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, classList: { toggle() {} }, setAttribute() {} });
    return elements.get(id);
  } };
  try {
    const game = new FrameworkGame(), run = getRun(game.bus.read());
    run.furthest = 20;
    game.bus.update(s => { s.resources.ore.amount = 10000; });
    assert.equal(game.equip('pick'), true);
    assert.equal(game.equip('needle'), true);
    assert.equal(game.buyUpgrade('pick.damage'), true);
    const render = createScreenRenderer(game);
    render('earth');
    assert.match(elements.get('melee-upgrades').innerHTML, /pick\.damage/);
    assert.doesNotMatch(elements.get('melee-upgrades').innerHTML, /needle\.damage/);
    assert.match(elements.get('ranged-upgrades').innerHTML, /needle\.damage/);
    assert.doesNotMatch(elements.get('general-upgrades').innerHTML, /data-value="pick"/);
    assert.equal(game.equip('fists'), true);
    render('earth');
    assert.match(elements.get('melee-upgrades').innerHTML, /fists\.damage/);
    assert.doesNotMatch(elements.get('melee-upgrades').innerHTML, /pick\.damage/);
    assert.match(elements.get('ranged-upgrades').innerHTML, /needle\.damage/);
    assert.equal(game.bus.read().upgradeLevels['pick.damage'], 1);
    assert.match(elements.get('melee-upgrades').innerHTML, /class="upgrade-copy"/);
  } finally { globalThis.document = previousDocument; }
});

test('алхимия конвертирует ресурсы и кристаллизация использует 100 воды', () => {
  const game = new FrameworkGame();
  getRun(game.bus.read()).furthest = 20;
  game.bus.update(s => { s.resources.stone.amount = 100; s.resources.water.amount = 100; });
  assert.equal(game.toggleRecipe('earth'), true);
  game.advance(0.5);
  assert.ok(game.bus.read().resources.earth.amount > 0);
  assert.equal(game.bus.invoke('alchemy.actions', { type: 'exchange', payload: 'crystallize' }), true);
  assert.equal(game.bus.read().resources.water.amount, 0);
  assert.equal(game.bus.read().resources.crystals.amount, 1);
});

test('испытание сохраняет карту и награду после восстановления забега', () => {
  const game = new FrameworkGame();
  const run = getRun(game.bus.read());
  run.furthest = 40;
  const before = game.bus.snapshot();
  assert.equal(game.enterChallenge(1), true);
  assert.equal(Object.keys(game.bus.read().tiles).length, 2500);
  game.bus.update(s => { s.tiles = {}; s.characters.main.position.y = -0.5; });
  game.advance(0.1);
  assert.equal(run.challenge, 0);
  assert.equal(run.challengeDone['1'], true);
  assert.equal(Object.keys(game.bus.read().tiles).length, Object.keys(before.tiles).length);
  assert.deepEqual(game.bus.read().resources, before.resources);
});

test('снаряд доставляется до цели и сохраняется во время паузы', () => {
  const game = new FrameworkGame();
  getRun(game.bus.read()).furthest = 1;
  game.bus.update(s => { s.resources.ore.amount = 1000; });
  assert.equal(game.equip('needle'), true);
  game.bus.setEnabled('weapons', false);
  const state = game.bus.read(), actor = state.characters.main, tile = Object.values(state.tiles)[0];
  const attack = { weaponId: 'needle', characterId: 'main', origin: actor.position, delivery: 'projectile',
    direct: { targetId: tile.id, point: tile.position, damage: 2, penetration: 0, elementalPenetration: 0 }, splash: [],
    projectileSpeed: 20, projectileCount: 1, projectileSpread: 0, projectilePierce: 0, burnSeconds: 0, burnDamageFraction: 0,
    beamTravelSpeed: 1, beamRetargetSeconds: 1, combo: false, dashDistance: 0 };
  assert.equal(game.bus.invoke('combat', { type: 'attack', payload: attack }), true);
  game.bus.setPaused(true); game.advance(1);
  assert.equal(game.bus.read().tiles[tile.id].health, tile.health);
  game.bus.setPaused(false); game.advance(1); game.advance(1);
  assert.ok(!game.bus.read().tiles[tile.id] || game.bus.read().tiles[tile.id].health < tile.maxHealth);
});

test('комбо ближнего оружия применяет рывок через модуль движения', () => {
  const game = new FrameworkGame();
  const map = Object.values(game.bus.read().maps)[0], id = `${map.id}:2:2`;
  game.bus.update(s => {
    s.tiles = { [id]: { id, mapId: map.id, position: { x: 2, y: 2 }, kind: 'stone', health: 100, maxHealth: 100, armor: 0, tags: [] } };
    s.characters.main.position = { x: 0, y: 2 };
  });
  const attack = { weaponId: 'spear', characterId: 'main', origin: { x: 0, y: 2 }, delivery: 'contact',
    direct: { targetId: id, point: { x: 2, y: 2 }, damage: 2, penetration: 0, elementalPenetration: 0 }, splash: [],
    projectileSpeed: 20, projectileCount: 1, projectileSpread: 0, projectilePierce: 0, burnSeconds: 0, burnDamageFraction: 0,
    beamTravelSpeed: 1, beamRetargetSeconds: 1, combo: true, dashDistance: 3 };
  assert.equal(game.bus.invoke('combat', { type: 'attack', payload: attack }), true);
  assert.deepEqual(game.bus.read().characters.main.position, { x: 2, y: 2 });
  assert.equal(game.bus.read().tiles[id].health, 98);
});

test('визуальные клипы реагируют на удары и рывки, останавливаются на паузе и не меняют состояние', () => {
  const game = new FrameworkGame(), visuals = new GameVisuals(game.bus, game.config);
  const target = Object.values(game.bus.read().tiles)[0];
  const attack = { weaponId: 'spear', characterId: 'main', origin: { x: 0, y: 2 }, delivery: 'contact',
    direct: { targetId: target.id, point: target.position, damage: 2, penetration: 0, elementalPenetration: 0 }, splash: [],
    projectileSpeed: 20, projectileCount: 1, projectileSpread: 0, projectilePierce: 0, burnSeconds: 0, burnDamageFraction: 0,
    beamTravelSpeed: 1, beamRetargetSeconds: 1, combo: true, dashDistance: 3 };
  game.bus.emit({ type: 'combat.attack-planned', source: 'weapons', payload: attack });
  game.bus.emit({ type: 'movement.dashed', source: 'movement', payload: { characterId: 'main', from: { x: 0, y: 2 }, to: { x: 3, y: 2 } } });
  game.bus.emit({ type: 'combat.impact', source: 'combat', payload: { actor: 'main', weapon: 'spear', point: target.position, combo: true } });
  assert.equal(visuals.attacks.size, 1);
  assert.equal(visuals.dashes.size, 1);
  assert.equal(visuals.impacts.length, 1);
  const before = game.bus.snapshot();
  visuals.tick(0.1);
  assert.deepEqual(game.bus.snapshot(), before);
  const elapsed = visuals.attacks.get('main:spear').player.elapsedSeconds;
  game.bus.setPaused(true); visuals.tick(1);
  assert.equal(visuals.attacks.get('main:spear').player.elapsedSeconds, elapsed);
  game.bus.setPaused(false); visuals.tick(1);
  assert.equal(visuals.attacks.size, 0);
  assert.equal(visuals.dashes.size, 0);
  assert.equal(visuals.impacts.length, 0);
  visuals.dispose();
});

test('вход и выход из испытания запускают независимые переходы', () => {
  const game = new FrameworkGame(), visuals = new GameVisuals(game.bus, game.config);
  getRun(game.bus.read()).furthest = 35;
  assert.equal(game.enterChallenge(1), true);
  assert.equal(visuals.transition.kind, 'challenge-enter');
  game.leaveChallenge();
  assert.equal(visuals.transition.kind, 'challenge-exit');
  visuals.tick(1);
  assert.equal(visuals.transition, null);
  visuals.dispose();
});

test('вспышка урона появляется от оружия, но не от пассивного урона по карте', () => {
  const game = new FrameworkGame(), visuals = new GameVisuals(game.bus, game.config);
  const [target, passive] = Object.values(game.bus.read().tiles);
  new StateMapAccess(game.bus).damageTile(passive.id, 0.1);
  assert.equal(visuals.damageFlashes.size, 0);
  const attack = { weaponId: 'fists', characterId: 'main', origin: { x: 0, y: 0 }, delivery: 'contact',
    direct: { targetId: target.id, point: target.position, damage: 1, penetration: 0, elementalPenetration: 0 }, splash: [],
    projectileSpeed: 20, projectileCount: 1, projectileSpread: 0, projectilePierce: 0, burnSeconds: 0, burnDamageFraction: 0,
    beamTravelSpeed: 1, beamRetargetSeconds: 1, combo: false, dashDistance: 0 };
  assert.equal(game.bus.invoke('combat', { type: 'attack', payload: attack }), true);
  assert.ok(visuals.damageFlashes.has(target.id));
  visuals.tick(0.2);
  assert.equal(visuals.damageFlashes.size, 0);
  visuals.dispose();
});

test('откат забега передаёт старую карту и позицию только визуальному переходу', () => {
  const game = new FrameworkGame(), visuals = new GameVisuals(game.bus, game.config);
  const run = getRun(game.bus.read());
  const original = { ...game.bus.read().characters.main.position };
  run.boundary = 0.001;
  game.advance(0.02);
  assert.equal(visuals.transition.kind, 'reset');
  assert.deepEqual(visuals.transition.snapshot.origin, original);
  assert.equal(visuals.transition.snapshot.tiles.length, 625);
  assert.equal(game.bus.read().moduleData.visuals, undefined);
  assert.deepEqual(visuals.actorPosition('main', game.bus.read().characters.main.position), original);
  game.bus.setPaused(true);
  visuals.tick(1);
  assert.equal(visuals.transition.player.elapsedSeconds, 0);
  game.bus.setPaused(false);
  visuals.tick(1);
  assert.equal(visuals.transition, null);
  visuals.dispose();
});

test('алхимические лимиты меняются улучшением и сохраняют избыток при подавлении', () => {
  const game = new FrameworkGame();
  getRun(game.bus.read()).furthest = 20;
  game.bus.update(s => { s.resources.crystals.amount = 20; });
  assert.equal(game.buyUpgrade('alchemy.water1'), true);
  assert.equal(game.bus.read().resources.water.capacity, 500);
  game.bus.update(s => { s.resources.water.amount = 400; });
  assert.equal(game.bus.invoke('upgrades', { type: 'set-suppression', payload: { source: 'test', upgradeIds: ['alchemy.water1'] } }), true);
  game.advance(0.1);
  assert.equal(game.bus.read().resources.water.capacity, 100);
  assert.equal(game.bus.read().resources.water.amount, 400);
  assert.equal(game.bus.exchange({ water: 100 }, {}), true);
  assert.equal(game.bus.read().resources.water.amount, 300);
});

test('элементализация расходует Воздух и добавляет элементальный камень', () => {
  const game = new FrameworkGame(), run = getRun(game.bus.read());
  run.challengeDone['1'] = true;
  game.bus.update(s => { s.resources.air.amount = 10; });
  assert.equal(game.bus.invoke('gameplay', { type: 'elementalization', payload: null }), true);
  const random = Math.random; Math.random = () => 0;
  try {
    const tile = Object.values(game.bus.read().tiles)[0];
    new StateMapAccess(game.bus).damageTile(tile.id, tile.health);
    assert.equal(game.bus.read().resources.elementalStone.amount, 1);
    assert.equal(game.bus.read().resources.stone.amount, 0);
    game.advance(0.1);
    assert.ok(game.bus.read().resources.air.amount < 10);
  } finally { Math.random = random; }
});

test('перегрузка Земли оплачивается один раз и усиливает каждый второй добытый камень', () => {
  const game = new FrameworkGame(), run = getRun(game.bus.read());
  run.furthest = 20;
  game.bus.update(s => { s.resources.earth.amount = 4000; s.resources.water.amount = 100; });
  assert.equal(game.bus.invoke('gameplay', { type: 'earth-overload', payload: null }), true);
  assert.equal(game.bus.invoke('gameplay', { type: 'earth-overload', payload: null }), false);
  assert.equal(game.bus.read().resources.earth.amount, 0);
  assert.equal(run.overloadRemaining, game.config.alchemy.buffs.overloadSeconds);
  const world = new StateMapAccess(game.bus);
  for (const tile of Object.values(game.bus.read().tiles).slice(0, 2)) world.damageTile(tile.id, tile.health);
  assert.equal(game.bus.read().resources.elementalStone.amount, 1);
  run.boundary = 0.001;
  game.advance(0.02);
  assert.equal(run.overloadRemaining, 0);
  assert.equal(run.overloadUsed, false);
});

test('старое сохранение каркаса получает значения новых алхимических переключателей', () => {
  const game = new FrameworkGame();
  assert.equal(game.save(), true);
  const state = JSON.parse(storage.get(SAVE_KEY));
  for (const key of ['elementalization', 'overloadRemaining', 'overloadUsed', 'overloadCount', 'endChargeRemaining']) delete state.moduleData.run[key];
  storage.set(SAVE_KEY, JSON.stringify(state));
  const run = getRun(FrameworkGame.load().bus.read());
  assert.equal(run.elementalization, false);
  assert.equal(run.overloadRemaining, 0);
  assert.equal(run.overloadUsed, false);
  assert.equal(run.endChargeRemaining, 0);
});

test('сжиматель срабатывает при покупке и на следующих слоях, но не на последнем', () => {
  const game = new FrameworkGame(), visuals = new GameVisuals(game.bus, game.config);
  const run = getRun(game.bus.read());
  run.furthest = 40; run.layer = 40;
  game.bus.update(s => { s.resources.ore.amount = game.config.world.compressorCost; s.tiles = Object.fromEntries(Object.entries(s.tiles).slice(0, 30)); });
  assert.equal(game.buyUpgrade('spatial.compressor'), true);
  assert.equal(run.layer, 41);
  assert.equal(visuals.transition.kind, 'compress');
  assert.equal(game.bus.read().upgradeLevels['spatial.compressor'], 1);
  game.bus.update(s => { s.tiles = Object.fromEntries(Object.entries(s.tiles).slice(0, 30)); });
  game.advance(0.02);
  assert.equal(run.layer, 42);
  assert.equal(game.bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'spatial.compressor', enabled: false } }), true);
  game.bus.update(s => { s.tiles = Object.fromEntries(Object.entries(s.tiles).slice(0, 30)); });
  game.advance(0.02);
  assert.equal(run.layer, 42);
  assert.equal(game.bus.invoke('upgrades', { type: 'set-enabled', payload: { id: 'spatial.compressor', enabled: true } }), true);
  run.layer = game.config.world.layers - 1;
  game.advance(0.02);
  assert.equal(run.layer, game.config.world.layers - 1);
  visuals.dispose();
});

test('уникальное улучшение пробития требует испытания и поддерживает подавление', () => {
  const game = new FrameworkGame();
  const run = getRun(game.bus.read());
  game.bus.update(s => { s.resources.water.amount = 100; });
  assert.equal(game.buyUpgrade('emitter.elemental'), false);
  run.challengeDone['1'] = true;
  assert.equal(game.buyUpgrade('emitter.elemental'), true);
  const stat = () => game.bus.query('upgrades', { type: 'stat', payload: { base: 0, keys: ['weapon.emitter.elementalPenetration'] } });
  assert.equal(stat(), 0.25);
  assert.equal(game.bus.invoke('upgrades', { type: 'set-suppression', payload: { source: 'test', tags: ['unique'] } }), true);
  assert.equal(stat(), 0);
  assert.equal(game.bus.read().upgradeLevels['emitter.elemental'], 1);
});

test('завершение цикла выдаёт очко и применяет купленное расширение', () => {
  const game = new FrameworkGame();
  const run = getRun(game.bus.read());
  run.completions = 1;
  game.bus.update(s => { s.resources.breakthrough.amount = 1; s.resources.crystals.amount = 7; });
  assert.equal(game.buyUpgrade('cycle.expansion'), true);
  run.layer = 49;
  game.bus.update(s => { s.tiles = {}; s.characters.main.position.y = -0.5; s.resources.ore.amount = 100; });
  game.advance(0.1);
  assert.ok(run.endChargeRemaining > 0);
  assert.equal(run.completions, 1);
  for (let i = 0; i < 5; i++) game.advance(1);
  assert.equal(run.completions, 2);
  assert.equal(game.bus.read().resources.breakthrough.amount, 1);
  assert.equal(game.bus.read().resources.ore.amount, 0);
  assert.equal(game.bus.read().resources.crystals.amount, 7);
  assert.equal(Object.values(game.bus.read().maps)[0].width, 26);
});

test('зарядка финальной границы сохраняется, ставится на паузу и завершается после загрузки', () => {
  const game = new FrameworkGame(), run = getRun(game.bus.read());
  run.layer = 49;
  game.bus.update(s => { s.tiles = {}; s.characters.main.position.y = -0.5; });
  game.advance(1);
  assert.ok(run.endChargeRemaining > 0);
  assert.equal(game.save(), true);
  const loaded = FrameworkGame.load(), restored = getRun(loaded.bus.read()), visuals = new GameVisuals(loaded.bus, loaded.config);
  assert.equal(visuals.transition.kind, 'charge');
  const remaining = restored.endChargeRemaining;
  assert.ok(Math.abs(visuals.transition.player.elapsedSeconds - (loaded.config.world.finalChargeSeconds - remaining)) < 1e-8);
  loaded.bus.setPaused(true); loaded.advance(1); visuals.tick(1);
  assert.equal(restored.endChargeRemaining, remaining);
  loaded.bus.setPaused(false);
  for (let i = 0; i < 5; i++) loaded.advance(1);
  assert.equal(restored.completions, 1);
  assert.equal(loaded.bus.read().resources.breakthrough.amount, 1);
  assert.equal(visuals.transition.kind, 'complete');
  visuals.dispose();
});

test('сохранение нового режима не перезаписывает старый ключ', () => {
  storage.set('pioneer-breach-v1', 'legacy');
  const game = new FrameworkGame();
  assert.equal(game.save(), true);
  assert.equal(storage.get('pioneer-breach-v1'), 'legacy');
});
