import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { PreInfinityGame, clearBreachSave } = await server.ssrLoadModule('/src/game/breach.ts');
const { BREACH_CONFIG: C } = await server.ssrLoadModule('/src/game/breachConfig.ts');
const { Weapons, splashMultiplier } = await server.ssrLoadModule('/src/game/weapons.ts');
const { NearestStoneMovement } = await server.ssrLoadModule('/src/game/movement.ts');
const { stoneNoise } = await server.ssrLoadModule('/src/game/stoneNoise.ts');
after(() => server.close());
beforeEach(() => storage.clear());

test('сброс удаляет только сохранение прорыва и начинает новую игру', () => {
  storage.set('probe-idle-save-v1', 'legacy');
  const game = new PreInfinityGame();
  Object.assign(game.state, { ore: 250, crystals: 12, auto: true, tutorial: 'done', furthestBlock: 35 });
  game.save();
  assert.equal(clearBreachSave(), true);
  const fresh = new PreInfinityGame();
  assert.equal(fresh.state.ore, 0);
  assert.equal(fresh.state.crystals, 0);
  assert.equal(fresh.state.tutorial, 'click');
  assert.equal(fresh.challenge1Unlocked, false);
  assert.equal(storage.get('probe-idle-save-v1'), 'legacy');
});

test('ошибка хранилища не выдаётся за успешный сброс', () => {
  const remove = globalThis.localStorage.removeItem;
  try {
    globalThis.localStorage.removeItem = () => { throw new Error('denied'); };
    assert.equal(clearBreachSave(), false);
  } finally {
    globalThis.localStorage.removeItem = remove;
  }
});

function clearBlock(game) {
  for (const stone of [...game.currentStones()]) game.destroy(stone);
  game.state.y = -0.5;
  game.advance(0.1);
}

function finishTutorial(game) {
  const s = game.state;
  game.click(); game.click(); game.click();
  assert.equal(s.tutorial, 'auto');
  assert.equal(game.buy('auto'), true);
  clearBlock(game);
  clearBlock(game);
  game.advance(0.1);
  assert.equal(s.tutorial, 'penetration');
  assert.equal(game.buy('penetration'), true);
  clearBlock(game);
  assert.equal(s.tutorial, 'done');
}

test('три полные карты обучения, добыча по области и запуск границы', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  assert.equal(s.size, 25);
  assert.equal(game.currentStones().length, 625);
  game.advance(1);
  const target = game.currentStones().find(stone => stone.y === s.size - 1 && stone.x === Math.floor(s.size / 2));
  game.click();
  assert.equal(target.hp, target.maxHp - C.fistDamage);
  game.click(); game.click();
  assert.equal(s.tutorial, 'auto');
  assert.equal(s.boundary, null);
  assert.equal(game.buy('auto'), true);
  clearBlock(game);
  assert.equal(s.block, 1);
  assert.equal(s.tutorial, 'second');
  assert.equal(s.boundary, null);
  clearBlock(game);
  assert.equal(s.block, 2);
  game.advance(0.1);
  assert.equal(s.tutorial, 'penetration');
  const hard = game.currentStones()[0];
  assert.equal(hard.kind, 'hard');
  game.advance(1);
  assert.equal(hard.hp, hard.maxHp);
  assert.equal(s.boundary, null);
  assert.equal(game.buy('penetration'), true);
  assert.equal(s.tutorial, 'third');
  assert.equal(s.boundary, null);
  clearBlock(game);
  assert.equal(s.block, 3);
  assert.equal(s.tutorial, 'done');
  assert.ok(s.boundary > C.blockCount * s.size);
});

test('автоматическая добыча самостоятельно проходит учебные карты', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  game.click(); game.click(); game.click();
  assert.equal(game.buy('auto'), true);
  s.ore = C.costs.pick;
  assert.equal(game.buy('pick'), true);
  for (let i = 0; i < 1200 && s.tutorial !== 'penetration'; i++) game.advance(1);
  assert.equal(s.block, 2);
  assert.equal(s.tutorial, 'penetration');
  assert.equal(s.boundary, null);
  assert.equal(game.buy('penetration'), true);
  for (let i = 0; i < 1200 && s.tutorial !== 'done'; i++) game.advance(1);
  assert.equal(s.block, 3);
  assert.equal(s.tutorial, 'done');
  assert.notEqual(s.boundary, null);
});

test('старый размер карты переносится с постоянными улучшениями', () => {
  const game = new PreInfinityGame();
  Object.assign(game.state, { size: 5, tutorial: 'done', auto: true, penetration: 1, crystals: 4, meleeLevel: 3, paused: true });
  game.save();
  const restored = new PreInfinityGame().state;
  assert.equal(restored.size, 25);
  assert.equal(restored.block, 0);
  assert.equal(restored.tutorial, 'done');
  assert.equal(restored.auto, true);
  assert.equal(restored.penetration, 1);
  assert.equal(restored.crystals, 4);
  assert.equal(restored.meleeLevel, 3);
  assert.equal(restored.stones.length, C.blockCount * C.blockSize ** 2);
});

test('граница сбрасывает всю карту и обычные ресурсы, сохраняя улучшения и редкие ресурсы', () => {
  const game = new PreInfinityGame();
  finishTutorial(game);
  const s = game.state;
  Object.assign(s, { ore: 55, crystals: 4, breakthrough: 2, meleeLevel: 3, reagent: 2, charges: 3 });
  s.boundary = s.block * s.size + s.size - s.y + 0.01;
  game.advance(0.1);
  assert.equal(s.block, 0);
  assert.equal(s.ore, 0);
  assert.equal(s.reagent, 0);
  assert.equal(s.charges, 0);
  assert.equal(s.crystals, 4);
  assert.equal(s.breakthrough, 2);
  assert.equal(s.meleeLevel, 3);
  assert.equal(s.auto, true);
  assert.equal(s.penetration, 1);
  assert.equal(s.stones.length, C.blockCount * C.blockSize ** 2);
  assert.ok(s.boundary > C.blockCount * s.size);
});

test('ranged weapon fires alongside melee without changing movement', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { tutorial: 'done', auto: true, rangedUnlocked: true, weapon: 'fists', x: 5, y: 5, penetration: 1 });
  const near = { block: 0, x: 5, y: 5, hp: 50, maxHp: 50, kind: 'stone', neighbors: 0 };
  const rear = { block: 0, x: 5, y: 7, hp: 50, maxHp: 50, kind: 'stone', neighbors: 0 };
  s.stones = [near, rear];
  game.rebuildIndex();
  game.advance(C.rangedInterval);
  assert.ok(near.hp < near.maxHp);
  assert.ok(rear.hp < rear.maxHp);
  assert.equal(s.weapon, 'fists');
  assert.deepEqual(s.target, { x: near.x, y: near.y });
  const paused = structuredClone(s);
  s.paused = true;
  game.advance(10);
  assert.equal(near.hp, paused.stones.find(stone => stone.y === 5).hp);
  assert.equal(rear.hp, paused.stones.find(stone => stone.y === 7).hp);
});

test('артефакт учитывает соседей через границу квадратов и усиливает урон по изолированным камням', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  const a = { block: 0, x: 2, y: 0, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const b = { block: 1, x: 2, y: s.size - 1, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const isolated = { block: 1, x: 0, y: 0, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const remote = { block: 3, x: 0, y: 0, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  s.stones = [a, b, isolated, remote];
  game.rebuildIndex();
  assert.equal(a.neighbors, 1);
  assert.equal(b.neighbors, 1);
  game.artifactTick();
  assert.ok(100 - isolated.hp > 100 - a.hp);
  assert.equal(remote.hp, 100);
  game.destroy(a);
  assert.equal(b.neighbors, 0);
});

test('реагент собирается в заряд и автоматически усиливает элементальную руду', () => {
  const game = new PreInfinityGame();
  finishTutorial(game);
  const s = game.state;
  s.auto = false;
  game.advance(C.reagentInterval);
  assert.equal(s.reagent, 1);
  const stone = s.stones.find((item) => item.block === s.block && item.kind === 'stone');
  stone.kind = 'elemental';
  stone.hp = 10;
  s.x = stone.x;
  s.y = stone.y;
  game.click();
  assert.ok(Math.abs(stone.hp - 9.8) < 1e-8);
  game.collect();
  assert.equal(s.charges, 1);
  game.click();
  assert.ok(Math.abs(stone.hp - 8.8) < 1e-8);
  assert.equal(s.charges, 0);
  assert.equal(s.buffRemaining, C.elementalBuffSeconds);
});

test('прохождение выдаёт очко, а расширение применяется в следующей попытке', () => {
  const game = new PreInfinityGame();
  finishTutorial(game);
  const s = game.state;
  s.block = C.blockCount - 1;
  s.stones = [];
  game.rebuildIndex();
  s.y = -0.5;
  s.ore = 30;
  s.reagent = 3;
  s.boundary = C.blockCount * s.size + C.boundaryHeadStart;
  game.advance(0.1);
  assert.equal(s.completions, 1);
  assert.equal(s.breakthrough, 1);
  assert.equal(s.ore, 0);
  assert.equal(s.reagent, 0);
  assert.equal(s.block, 0);
  assert.equal(game.buy('expansion'), true);
  assert.equal(s.size, C.blockSize);
  s.boundary = s.size - s.y + 0.01;
  game.advance(0.1);
  assert.equal(s.size, C.blockSize + 1);
  assert.equal(s.stones.length, C.blockCount * s.size ** 2);
});

test('пауза останавливает игру, сохранение восстанавливает прогресс и старый ключ не перезаписывается', () => {
  storage.set('probe-idle-save-v1', 'original');
  const game = new PreInfinityGame();
  finishTutorial(game);
  game.state.paused = true;
  const snapshot = structuredClone(game.state);
  game.advance(100);
  game.click();
  assert.deepEqual(game.state, snapshot);
  game.save();
  const restored = new PreInfinityGame();
  assert.equal(restored.state.tutorial, 'done');
  assert.equal(restored.state.auto, true);
  assert.equal(restored.state.penetration, 1);
  assert.equal(restored.state.stones.length, game.state.stones.length);
  assert.equal(storage.get('probe-idle-save-v1'), 'original');
});

test('weapon patterns, discrete timing and speed', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  const weapon = new Weapons();
  Object.assign(s, { x: 5, y: 5, weapon: 'fists', attackClock: 0 });
  assert.equal(weapon.tick(s, C.attackInterval * 0.9, 1), 0);
  assert.equal(weapon.tick(s, C.attackInterval * 0.1, 1), 1);
  s.attackClock = 0;
  assert.equal(weapon.tick(s, C.attackInterval, 2), 2);
  const stone = (x, y) => ({ block: 0, x, y, hp: 10, maxHp: 10, kind: 'stone', neighbors: 0 });
  const front = stone(6, 5), side = stone(5, 6), back = stone(4, 5), diagonal = stone(7, 6);
  s.weapon = 'pick';
  weapon.strike(s, front, [front, side, back, diagonal], (target, damage) => { target.hp -= damage; });
  assert.equal(front.hp, 10 - C.baseMeleeDamage);
  assert.equal(side.hp, 10 - C.baseMeleeDamage);
  assert.equal(back.hp, 10);
  assert.ok(diagonal.hp > front.hp && diagonal.hp < 10);
  const center = stone(7, 5), up = stone(7, 4), down = stone(7, 6), left = stone(6, 5), right = stone(8, 5), corner = stone(8, 6);
  s.rangedWeapon = 'emitter';
  weapon.strike(s, center, [center, up, down, left, right, corner], (target, damage) => { target.hp -= damage; }, false, 'ranged');
  assert.equal(center.hp, 10 - C.rangedDamage);
  for (const neighbor of [up, down, left, right]) assert.equal(neighbor.hp, 10 - C.rangedDamage * splashMultiplier(1, 1, 0));
  assert.equal(corner.hp, 10);
});

test('collector unlocks weapons early; repeatables unlock at half a map and persist', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  assert.equal(s.weapon, 'fists');
  s.ore = 100;
  assert.equal(game.buy('pick'), false);
  assert.equal(game.buy('ranged'), false);
  game.click(); game.click(); game.click();
  assert.equal(game.buy('auto'), true);
  assert.equal(game.buy('melee'), false);
  assert.equal(game.buy('pick'), true);
  assert.equal(game.buy('ranged'), false);
  assert.equal(game.buy('needle'), true);
  assert.equal(s.rangedWeapon, 'needle');
  assert.equal(game.buy('ranged'), true);
  assert.equal(game.buy('penetration'), true);
  const remainingBeforeUnlock = Math.floor(s.size * s.size * (1 - C.repeatableUnlockFraction));
  const count = game.currentStones().length - remainingBeforeUnlock;
  for (const stone of [...game.currentStones()].slice(0, count - 1)) game.destroy(stone);
  assert.equal(s.repeatablesUnlocked, false);
  game.destroy(game.currentStones()[0]);
  assert.equal(s.repeatablesUnlocked, true);
  assert.equal(game.buy('speed'), true);
  game.save();
  assert.equal(new PreInfinityGame().state.repeatablesUnlocked, true);
});

test('emitter searches around rear stone independently of player and maximizes damage', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { x: 5, y: 5, penetration: 0, rangedWeapon: 'emitter' });
  const stone = (x, y, hp = 10, kind = 'stone') => ({ block: 0, x, y, hp, maxHp: hp, kind, neighbors: 0 });
  const weapons = new Weapons();
  const spread = [stone(5, 4), stone(4, 5), stone(6, 5), stone(5, 6)];
  assert.deepEqual(weapons.rangedTarget(s, spread), { x: 5, y: 5 });
  const immune = [...spread, stone(6, 6, 100, 'hard')];
  assert.deepEqual(weapons.rangedTarget(s, immune), { x: 5, y: 5 });
  const remote = [stone(10, 5), stone(10, 4), stone(10, 6)];
  assert.deepEqual(weapons.rangedTarget(s, remote), { x: 10, y: 5 });
  const tie = [stone(5, 3), stone(5, 7)];
  assert.deepEqual(weapons.rangedTarget(s, tie), { x: 5, y: 7 });
});

test('weapon upgrades are independent and ranged weapons switch without affecting melee', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, rangedUnlocked: true, ore: 1000 });
  assert.equal(game.buy('needle'), true);
  for (const upgrade of ['melee', 'pickDamage', 'rangedDamage', 'needleDamage']) assert.equal(game.buy(upgrade), true);
  assert.deepEqual([s.fistLevel, s.pickLevel, s.rangedLevel, s.needleLevel], [1, 1, 1, 1]);
  assert.equal(game.buy('needleDamage'), true);
  assert.deepEqual([s.fistLevel, s.pickLevel, s.rangedLevel, s.needleLevel], [1, 1, 1, 2]);
  game.equip('pick');
  game.equipRanged('needle');
  assert.equal(s.weapon, 'pick');
  assert.equal(s.rangedWeapon, 'needle');
  game.save();
  const restored = new PreInfinityGame().state;
  assert.equal(restored.rangedWeapon, 'needle');
  assert.equal(restored.needleLevel, 2);
  assert.equal(restored.pickLevel, 1);
});

test('unique weapon upgrades change their own attacks and survive save and reload', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, needleUnlocked: true, rangedUnlocked: true, ore: 1000, crystals: 100, x: 5, y: 5 });
  for (const upgrade of ['fistFinisher', 'pickReach', 'needlePierce', 'emitterSpread']) assert.equal(game.buy(upgrade), true);
  const weapons = new Weapons();
  const stone = (x, y, hp = 100, maxHp = 100) => ({ block: 0, x, y, hp, maxHp, kind: 'stone', neighbors: 0 });
  const hit = (target, damage) => { target.hp -= damage; };
  const weak = stone(6, 5, 50);
  s.weapon = 'fists';
  weapons.strike(s, weak, [weak], hit);
  assert.equal(weak.hp, 50 - C.fistDamage * (1 + C.fistFinisherBonus));
  const front = stone(6, 5), beyond = stone(5, 9);
  s.weapon = 'pick';
  s.pickReachLevel = 2;
  weapons.strike(s, front, [front, beyond], hit);
  assert.ok(beyond.hp < 100 && beyond.hp > front.hp);
  const rear = stone(6, 8), behind = stone(6, 7);
  s.rangedWeapon = 'needle';
  weapons.strike(s, rear, [rear, behind], hit, false, 'ranged');
  assert.equal(behind.hp, 100 - C.needleDamage * C.needlePierceBonus);
  const center = stone(6, 6), neighbor = stone(6, 5);
  s.rangedWeapon = 'emitter';
  weapons.strike(s, center, [center, neighbor], hit, false, 'ranged');
  assert.equal(neighbor.hp, 100 - C.rangedDamage * splashMultiplier(1, 1, 1));
  s.paused = true;
  game.save();
  const restored = new PreInfinityGame().state;
  assert.deepEqual([restored.fistFinisherLevel, restored.pickReachLevel, restored.needlePierceLevel, restored.emitterSpreadLevel], [1, 2, 1, 1]);
});

test('legacy melee and emitter upgrades migrate to individual weapons', () => {
  const game = new PreInfinityGame();
  game.save();
  const key = 'pioneer-breach-v1';
  const legacy = JSON.parse(storage.get(key));
  delete legacy.fistLevel; delete legacy.pickLevel; delete legacy.needleLevel;
  delete legacy.needleUnlocked; delete legacy.rangedWeapon;
  delete legacy.beamSpeedLevel;
  legacy.meleeLevel = 3; legacy.rangedLevel = 4; legacy.paused = true;
  storage.set(key, JSON.stringify(legacy));
  const state = new PreInfinityGame().state;
  assert.equal(state.fistLevel, 3);
  assert.equal(state.pickLevel, 3);
  assert.equal(state.rangedLevel, 4);
  assert.equal(state.rangedWeapon, 'emitter');
  assert.equal(state.beamSpeedLevel, 0);
});

test('older saves migrate stone balance without losing damage progress', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.paused = true;
  game.save();
  const key = 'pioneer-breach-v1';
  const legacy = JSON.parse(storage.get(key));
  delete legacy.balanceVersion;
  const stone = legacy.stones.find(item => item.block === 10 && item.kind === 'stone');
  stone.maxHp = 4; stone.hp = 2;
  storage.set(key, JSON.stringify(legacy));
  const restored = new PreInfinityGame().state;
  const same = restored.stones.find(item => item.block === stone.block && item.x === stone.x && item.y === stone.y);
  assert.equal(same.maxHp, 3 + Math.floor(10 * C.stoneHpPerBlock));
  assert.equal(same.hp / same.maxHp, 0.5);
});

test('old equipped emitter save restores melee and keeps ranged weapon', () => {
  const game = new PreInfinityGame();
  Object.assign(game.state, { weapon: 'ranged', pickUnlocked: true, rangedUnlocked: true, paused: true });
  game.save();
  const restored = new PreInfinityGame().state;
  assert.equal(restored.weapon, 'pick');
  assert.equal(restored.rangedUnlocked, true);
});

test('movement upgrade, pick interaction range and falloff', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, ore: 100, crystals: 10, x: 0, y: 0 });
  assert.equal(game.buy('movement'), true);
  new NearestStoneMovement().move(s, 20, 0, 1);
  assert.equal(s.x, C.movementSpeed * (1 + C.movementSpeedPerLevel));
  s.weapon = 'pick';
  const weapons = new Weapons();
  const before = weapons.interactionRange(s);
  assert.equal(game.buy('pickReach'), true);
  assert.ok(weapons.interactionRange(s) > before);
  Object.assign(s, { x: 5, y: 5, pickReachLevel: 0 });
  const near = { block: 0, x: 6, y: 5, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const far = { block: 0, x: 8, y: 5, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  weapons.strike(s, near, [near, far], (stone, damage) => { stone.hp -= damage; });
  assert.ok(100 - near.hp > 100 - far.hp);
  assert.ok(far.hp < 100);
});

test('needle fires rapidly and laser deals continuous damage with expandable area', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { rangedWeapon: 'needle', rangedClock: 0, x: 5, y: 5 });
  const weapons = new Weapons();
  assert.ok(weapons.tick(s, 1, 1, 'ranged') >= 5);
  s.rangedWeapon = 'emitter';
  const stone = (x, y) => ({ block: 0, x, y, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 });
  const hit = (target, damage) => { target.hp -= damage; };
  const one = stone(5, 5), many = stone(5, 5);
  weapons.laser(s, [one], 1, 1, hit);
  for (let i = 0; i < 10; i++) weapons.laser(s, [many], 0.1, 1, hit);
  assert.ok(Math.abs(one.hp - many.hp) < 1e-8);
  const close = stone(5, 5), far = stone(7, 5);
  s.emitterAreaLevel = 0;
  weapons.laser(s, [close, far], 1, 1, hit);
  assert.equal(far.hp, 100);
  s.emitterAreaLevel = 1;
  weapons.laser(s, [close, far], 1, 1, hit);
  assert.ok(far.hp < 100);
  s.paused = true;
  game.save();
  const restored = new PreInfinityGame().state;
  assert.equal(restored.emitterAreaLevel, 1);
});

test('beam speed is purchased separately, persists, and changes travel without changing beam damage', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, repeatablesUnlocked: true, rangedUnlocked: true, rangedWeapon: 'emitter', ore: 100, crystals: 0, x: 0, y: 0 });
  assert.equal(game.buy('beamSpeed'), false);
  s.crystals = 1;
  assert.equal(game.buy('beamSpeed'), true);
  assert.equal(s.beamSpeedLevel, 1);
  assert.equal(s.crystals, 0);
  const stone = { block: 0, x: 0, y: 20, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const slow = new Weapons(), fast = new Weapons();
  const hit = (target, damage) => { target.hp -= damage; };
  s.beamSpeedLevel = 0;
  slow.laser(s, [stone], 0.5, 1, hit);
  s.beamSpeedLevel = 1;
  fast.laser(s, [stone], 0.5, 1, hit);
  assert.ok(Math.abs(slow.beamPosition().y - C.beamMoveSpeed * 0.5) < 1e-8);
  assert.ok(Math.abs(fast.beamPosition().y - C.beamMoveSpeed * (1 + C.beamSpeedPerLevel) * 0.5) < 1e-8);
  assert.equal(stone.hp, 100);
  s.paused = true;
  game.save();
  assert.equal(new PreInfinityGame().state.beamSpeedLevel, 1);
});

test('milestones and special upgrades charge crystals and preserve ordinary resources on failure', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, needleUnlocked: true, pickUnlocked: true, repeatablesUnlocked: true, ore: 1000, crystals: 30, furthestBlock: 18 });
  assert.equal(game.buy('needleAlt'), false);
  assert.equal(game.buy('artifact'), false);
  s.furthestBlock = 19;
  assert.equal(game.buy('needleAlt'), true);
  assert.equal(s.crystals, 5);
  assert.equal(game.buy('pickReach'), true);
  assert.equal(s.crystals, 4);
  s.furthestBlock = 24;
  assert.equal(game.buy('artifact'), true);
  assert.equal(s.crystals, 2);
  s.crystals = 0;
  const ore = s.ore;
  assert.equal(game.buy('pickReach'), false);
  assert.equal(s.ore, ore);
});

test('needle projectiles travel before impact and reserve only necessary damage', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { x: 0, y: 0, needleUnlocked: true });
  const target = { block: 0, x: 0, y: 20, hp: 2, maxHp: 2, kind: 'stone', neighbors: 0 };
  s.stones = [target];
  game.rebuildIndex();
  assert.equal(game.launchNeedle(), true);
  assert.equal(game.launchNeedle(), true);
  assert.equal(game.launchNeedle(), false);
  assert.ok(Math.abs(s.projectiles.reduce((sum, shot) => sum + shot.damage, 0) - target.hp) < 1e-8);
  game.advanceProjectiles(0.4);
  assert.equal(target.hp, 2);
  game.advanceProjectiles(1);
  assert.ok(!s.stones.includes(target));
  assert.equal(s.projectiles.length, 0);
});

test('background needle uses one quarter rate while emitter is selected', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: false, needleUnlocked: true, rangedUnlocked: true, needleAltUnlocked: true, rangedWeapon: 'emitter', x: 0, y: 0 });
  const target = { block: 0, x: 0, y: 20, hp: 1000, maxHp: 1000, kind: 'stone', neighbors: 0 };
  s.stones = [target];
  game.rebuildIndex();
  let count = 0;
  game.launchNeedle = () => { count++; return true; };
  game.advance(1.44);
  assert.equal(count, 2);
  count = 0;
  s.rangedWeapon = 'needle'; s.rangedClock = 0; s.needleAltClock = 0;
  game.advance(1.44);
  assert.equal(count, 8);
});

test('splash easing, travelling beam, deterministic noise and reset animation', () => {
  assert.ok(splashMultiplier(0, 2, 0) > splashMultiplier(1, 2, 0));
  assert.ok(splashMultiplier(1, 2, 0) > splashMultiplier(2, 2, 0));
  assert.equal(splashMultiplier(3, 2, 0), 0);
  assert.equal(stoneNoise(1.2, 2.3, 7), stoneNoise(1.2, 2.3, 7));
  assert.notEqual(stoneNoise(1.2, 2.3, 7), stoneNoise(1.3, 2.3, 7));
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { x: 0, y: 0, rangedWeapon: 'emitter' });
  const target = { block: 0, x: 0, y: 20, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  game.weapons.laser(s, [target], 0.1, 1, (stone, damage) => { stone.hp -= damage; });
  assert.equal(target.hp, 100);
  game.fail();
  assert.ok(game.resetEffect);
  const start = { x: s.x, y: s.y };
  game.advance(0.4);
  assert.ok(game.resetEffect.elapsed > 0);
  assert.deepEqual({ x: s.x, y: s.y }, start);
  const elapsed = game.resetEffect.elapsed;
  s.paused = true; game.advance(3);
  assert.equal(game.resetEffect.elapsed, elapsed);
  s.paused = false; game.advance(C.resetAnimationSeconds);
  assert.equal(game.resetEffect, null);
});

test('mineral deposits follow continuous noise across block boundaries and preserve the tutorial', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  const cells = new Map(s.stones.map(stone => [`${stone.block}:${stone.x}:${stone.y}`, stone]));
  for (const stone of s.stones) {
    if (stone.block < 2) assert.equal(stone.kind, 'stone');
    if (stone.block === 2) assert.equal(stone.kind, 'hard');
    if (stone.block < 3) continue;
    const worldY = stone.block * s.size + s.size - 1 - stone.y;
    const nx = (stone.x + C.mineralNoiseOffsetX) / C.mineralNoiseScale;
    const ny = (worldY + C.mineralNoiseOffsetY) / C.mineralNoiseScale;
    const elemental = stoneNoise(nx, ny, C.elementalMineralSeed) > C.elementalMineralThreshold;
    const hard = stoneNoise(nx, ny, C.hardMineralSeed) > C.hardMineralThreshold;
    assert.equal(stone.kind, elemental ? 'elemental' : hard ? 'hard' : 'stone');
  }
  for (const kind of ['hard', 'elemental']) {
    const count = s.stones.filter(stone => stone.block >= 3 && stone.kind === kind).length;
    const available = (C.blockCount - 3) * s.size ** 2;
    assert.ok(count > available * 0.02 && count < available * 0.2);
    let crossBoundary = 0;
    for (let block = 3; block < C.blockCount - 1; block++) {
      for (let x = 0; x < s.size; x++) {
        if (cells.get(`${block}:${x}:0`)?.kind === kind && cells.get(`${block + 1}:${x}:${s.size - 1}`)?.kind === kind) crossBoundary++;
      }
    }
    assert.ok(crossBoundary > 0, `${kind} deposits should span block boundaries`);
  }
});

test('challenge 1 unlocks on arrival at block 35 and stays unlocked after reset and reload', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { tutorial: 'done', block: 33, furthestBlock: 33, y: -0.5, boundary: null, stones: [] });
  game.rebuildIndex();
  assert.equal(game.challenge1Unlocked, false);
  game.advance(0.1);
  assert.equal(s.block, 34);
  assert.equal(game.challenge1Unlocked, true);
  game.fail();
  assert.equal(s.block, 0);
  assert.equal(game.challenge1Unlocked, true);
  s.paused = true;
  game.save();
  assert.equal(new PreInfinityGame().challenge1Unlocked, true);
});
