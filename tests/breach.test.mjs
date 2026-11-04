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
const { ALCHEMY_CONFIG: A, ALCHEMY_UPGRADES, alchemyCapacity } = await server.ssrLoadModule('/src/game/alchemy.ts');
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
  assert.equal(game.buy('pick'), false);
  for (let i = 0; i < 3000 && s.tutorial !== 'penetration'; i++) game.advance(1);
  assert.equal(s.block, 2);
  assert.equal(s.tutorial, 'penetration');
  assert.equal(s.boundary, null);
  s.ore = C.costs.pick + C.costs.penetration;
  assert.equal(game.buy('pick'), true);
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

test('старые заряды не усиливают элементальную породу после перехода на алхимию', () => {
  const game = new PreInfinityGame();
  finishTutorial(game);
  const s = game.state;
  s.auto = false;
  game.advance(C.reagentInterval);
  assert.equal(s.reagent, 0);
  const stone = s.stones.find((item) => item.block === s.block && item.kind === 'stone');
  stone.kind = 'elemental';
  stone.hp = 10;
  s.x = stone.x;
  s.y = stone.y;
  game.click();
  assert.ok(Math.abs(stone.hp - 9.8) < 1e-8);
  s.charges = 1;
  game.click();
  assert.ok(Math.abs(stone.hp - 9.6) < 1e-8);
  assert.equal(s.charges, 1);
});

test('прохождение выдаёт очко, а расширение применяется в следующей попытке', () => {
  const game = new PreInfinityGame();
  finishTutorial(game);
  const s = game.state;
  s.block = C.blockCount - 1;
  s.stones = [];
  game.rebuildIndex();
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

test('collector unlocks weapons early; repeatables unlock at 30% of a map and persist', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  assert.equal(s.weapon, 'fists');
  s.ore = 100;
  assert.equal(game.buy('pick'), false);
  assert.equal(game.buy('ranged'), false);
  game.click(); game.click(); game.click();
  assert.equal(game.buy('auto'), true);
  assert.equal(game.buy('melee'), false);
  assert.equal(game.buy('pick'), false);
  assert.equal(game.buy('ranged'), false);
  assert.equal(game.buy('needle'), true);
  assert.equal(s.rangedWeapon, 'needle');
  assert.equal(game.buy('ranged'), true);
  assert.equal(game.buy('penetration'), true);
  const remainingBeforeUnlock = Math.floor(s.size * s.size * (1 - C.repeatableUnlockFraction));
  assert.equal(C.repeatableUnlockFraction, 0.3);
  assert.equal(s.size * s.size - remainingBeforeUnlock, 188);
  const count = game.currentStones().length - remainingBeforeUnlock;
  for (const stone of [...game.currentStones()].slice(0, count - 1)) game.destroy(stone);
  assert.equal(s.repeatablesUnlocked, false);
  game.destroy(game.currentStones()[0]);
  assert.equal(s.repeatablesUnlocked, true);
  assert.equal(game.buy('speed'), true);
  game.save();
  assert.equal(new PreInfinityGame().state.repeatablesUnlocked, true);
});

test('existing saves unlock repeatables after the new 30% threshold', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  const count = Math.ceil(s.size * s.size * C.repeatableUnlockFraction);
  for (const stone of [...game.currentStones()].slice(0, count)) game.destroy(stone);
  s.repeatablesUnlocked = false;
  s.paused = true;
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
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, rangedUnlocked: true, ore: 10000 });
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
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, needleUnlocked: true, rangedUnlocked: true, ore: 10000, crystals: 100, x: 5, y: 5 });
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
  assert.equal(same.maxHp, 3 + 3 * C.stoneHpEarlyPerLevel + 7 * C.stoneHpLatePerLevel);
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
  Object.assign(s, { auto: true, repeatablesUnlocked: true, pickUnlocked: true, ore: 10000, crystals: 10, x: 0, y: 0 });
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
  Object.assign(s, { auto: true, needleUnlocked: true, pickUnlocked: true, repeatablesUnlocked: true, ore: 10000, crystals: 30, furthestBlock: 18 });
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

test('alchemy nodes use furthest progress and do not open unimplemented challenges', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = A.earthUnlockBlock - 1;
  assert.equal(game.alchemyNodeUnlocked('earth'), false);
  assert.equal(game.toggleAlchemy('earthEnabled'), false);
  s.furthestBlock = A.earthUnlockBlock;
  assert.equal(game.alchemyNodeUnlocked('earth'), true);
  assert.equal(game.alchemyNodeUnlocked('water'), false);
  s.furthestBlock = A.waterUnlockBlock;
  assert.equal(game.alchemyNodeUnlocked('water'), true);
  s.furthestBlock = 49;
  assert.equal(game.challenge1Unlocked, true);
  assert.equal(game.alchemyNodeUnlocked('fire'), false);
  assert.equal(game.alchemyNodeUnlocked('air'), false);
});

test('stone weights supply separate materials for earth and water', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  const makeStone = (x, kind) => ({ block: 0, x, y: 1, hp: 1, maxHp: 1, kind, neighbors: 0 });
  const [normal, hard, elemental] = [makeStone(0, 'stone'), makeStone(1, 'hard'), makeStone(2, 'elemental')];
  s.stones = [normal, hard, elemental]; game.rebuildIndex();
  for (const stone of [normal, hard, elemental]) game.destroy(stone);
  assert.equal(s.alchemy.stone, 6);
  assert.equal(s.alchemy.elementalStone, 1);
  game.destroy(normal);
  assert.equal(s.alchemy.stone, 6);
});

test('alchemy runs in background with costs, limits, and pause', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = A.waterUnlockBlock;
  Object.assign(s.alchemy, { stone: 50, elementalStone: 100, earth: 20 });
  assert.equal(game.toggleAlchemy('earthEnabled'), true);
  assert.equal(game.toggleAlchemy('waterEnabled'), true);
  game.advance(A.waterRecipe.seconds);
  assert.equal(s.alchemy.stone, 20);
  assert.equal(s.alchemy.earth, 45);
  assert.equal(s.alchemy.elementalStone, 90);
  assert.equal(s.alchemy.water, 5);
  s.alchemy.earth = alchemyCapacity(s.alchemy, 'earth');
  s.alchemy.waterEnabled = false;
  const remaining = s.alchemy.stone;
  game.advance(1);
  assert.equal(s.alchemy.stone, remaining);
  s.paused = true;
  const before = structuredClone(s.alchemy);
  game.advance(10);
  assert.deepEqual(s.alchemy, before);
});

test('water can be exchanged repeatedly without exceeding capacity or available ingredients', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = A.waterUnlockBlock;
  Object.assign(s.alchemy, { earth: 100, elementalStone: 200 });
  assert.equal(game.craftWater(), true);
  assert.equal(game.craftWater(), true);
  assert.equal(s.alchemy.water, 19);
  assert.equal(s.alchemy.earth, 81);
  assert.equal(s.alchemy.elementalStone, 162);
  Object.assign(s.alchemy, { earth: 10, elementalStone: 20, water: alchemyCapacity(s.alchemy, 'water') });
  assert.equal(game.craftWater(), false);
  assert.equal(s.alchemy.earth, 10);
});

test('earth pick enhancement costs two per weighted destroyed stone only', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: A.earthUnlockBlock, pickUnlocked: true, penetration: 1, buffRemaining: 5 });
  s.alchemy.earth = 20;
  assert.equal(game.toggleAlchemy('pickEnabled'), true);
  const makeStone = (x, kind, hp) => ({ block: 0, x, y: 1, hp, maxHp: hp, kind, neighbors: 0 });
  const [normal, hard, elemental, unbroken] = [makeStone(0, 'stone', 1), makeStone(1, 'hard', 1), makeStone(2, 'elemental', 1), makeStone(3, 'stone', 100)];
  s.stones = [normal, hard, elemental, unbroken]; game.rebuildIndex();
  for (const stone of [normal, hard, elemental]) game.hit(stone, 1, true, true);
  assert.equal(s.alchemy.earth, 20 - A.pickEarthPerStone * (1 + 3 + 2));
  const hp = unbroken.hp;
  game.hit(unbroken, 1, true, true);
  assert.equal(unbroken.hp, hp - A.pickDamageMultiplier);
  assert.equal(s.alchemy.earth, 8);
  s.alchemy.earth = 0;
  game.hit(unbroken, 1, true, true);
  assert.equal(unbroken.hp, hp - A.pickDamageMultiplier - 1);
});

test('earth enhancement lets the pick overcome elemental resistance', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: A.earthUnlockBlock, pickUnlocked: true, penetration: 1, buffRemaining: 0, charges: 0 });
  Object.assign(s.alchemy, { earth: 20, pickEnabled: true });
  const stone = { block: 0, x: 0, y: 1, hp: 100, maxHp: 100, kind: 'elemental', neighbors: 0 };
  s.stones = [stone]; game.rebuildIndex();
  game.hit(stone, 1, true, true);
  assert.equal(stone.hp, 100 - A.pickDamageMultiplier);
  s.alchemy.earth = 0;
  game.hit(stone, 1, true, true);
  assert.equal(stone.hp, 100 - A.pickDamageMultiplier - 1 / C.elementalMultiplier);
});

test('alchemy speed upgrades are one-time, paid by their elements, and persist', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = A.waterUnlockBlock;
  Object.assign(s.alchemy, { earth: 500, water: 50, stone: 100, earthEnabled: true });
  assert.equal(game.buyAlchemyUpgrade('earthSpeed'), true);
  assert.equal(game.buyAlchemyUpgrade('earthSpeed'), false);
  assert.equal(game.buyAlchemyUpgrade('waterSpeed'), true);
  game.advance(A.earthRecipe.seconds / 2);
  assert.equal(s.alchemy.earth, 10);
  assert.equal(s.alchemy.water, 0);
  s.paused = true; game.save();
  const restored = new PreInfinityGame();
  assert.equal(restored.state.alchemy.upgrades.earthSpeed, true);
  assert.equal(restored.state.alchemy.upgrades.waterSpeed, true);
});

test('needle schedules one follow-up on a survivor after half a second', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { x: 0, y: 0, needleUnlocked: true });
  const stone = { block: 0, x: 0, y: 1, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  s.stones = [stone]; game.rebuildIndex();
  assert.equal(game.launchNeedle(), true);
  game.advanceProjectiles(s.projectiles[0].duration);
  assert.equal(s.needleFollowUps.length, 1);
  game.advanceProjectiles(C.needleFollowUpDelay - 0.01);
  assert.equal(s.projectiles.length, 0);
  game.advanceProjectiles(0.01);
  assert.equal(s.projectiles.length, 1);
  assert.equal(s.projectiles[0].followUp, true);
  game.advanceProjectiles(s.projectiles[0].remaining);
  assert.equal(s.needleFollowUps.length, 0);
});

test('needle spread can select adjacent stones without exceeding their remaining health', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { x: 0, y: 0, needleUnlocked: true });
  const stones = [0, 1].map(x => ({ block: 0, x, y: 1, hp: 1, maxHp: 1, kind: 'stone', neighbors: 0 }));
  s.stones = stones; game.rebuildIndex();
  const random = Math.random;
  try {
    Math.random = () => 0.99;
    assert.equal(game.launchNeedle(), true);
    assert.equal(s.projectiles[0].x, 1);
    assert.equal(game.launchNeedle(), true);
    assert.equal(s.projectiles[1].x, 0);
    assert.equal(game.launchNeedle(), false);
  } finally { Math.random = random; }
});

test('click buffer helps movement away from a target and drains while unpaused', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { auto: true, tutorial: 'done', x: 0, y: 0 });
  s.stones = [];
  game.rebuildIndex();
  for (let i = 0; i < 15; i++) game.click();
  assert.equal(s.clickBuffer, 15);
  new NearestStoneMovement().move(s, 20, 0, 1);
  assert.ok(Math.abs(s.x - C.movementSpeed * 1.4) < 1e-8);
  s.paused = true; game.advance(1); assert.equal(s.clickBuffer, 15);
  s.paused = false; game.advance(1); assert.ok(s.clickBuffer < 15);
});

test('fist combo hits surrounding stones every third strike', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { ore: C.costs.fistCombo, x: 5, y: 5 });
  assert.equal(game.buy('fistCombo'), true);
  const weapons = new Weapons();
  const target = { block: 0, x: 6, y: 5, hp: 50, maxHp: 50, kind: 'stone', neighbors: 0 };
  const nearby = { ...target, x: 9 };
  const hit = (stone, damage) => { stone.hp -= damage; };
  weapons.strike(s, target, [target, nearby], hit);
  weapons.strike(s, target, [target, nearby], hit);
  assert.equal(nearby.hp, 50);
  weapons.strike(s, target, [target, nearby], hit);
  assert.equal(nearby.hp, 50 - C.fistDamage);
});

test('spear requires square 25 and crystals, equips and hits in a circle', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: 23, ore: C.costs.spear, crystals: C.costs.spearCrystals, x: 5, y: 5 });
  assert.equal(game.buy('spear'), false);
  s.furthestBlock = 24;
  assert.equal(game.buy('spear'), true);
  game.equip('spear');
  assert.equal(s.weapon, 'spear');
  const near = { block: 0, x: 5, y: 6, hp: 50, maxHp: 50, kind: 'stone', neighbors: 0 };
  const behind = { ...near, y: 4 };
  game.weapons.strike(s, near, [near, behind], (stone, damage) => { stone.hp -= damage; });
  assert.equal(near.hp, 50 - C.spearDamage);
  assert.equal(behind.hp, 50 - C.spearDamage);
});

test('pick combo is gated by challenge and grants a dash after its third hit', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { weapon: 'pick', x: 5, y: 5, pickUnlocked: true });
  s.combos.pick = true;
  const stone = { block: 0, x: 6, y: 5, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  const hit = (target, damage) => { target.hp -= damage; };
  for (let i = 0; i < 3; i++) game.weapons.strike(s, stone, [stone], hit);
  assert.equal(s.pickDash, false);
  s.challenge1Completed = true;
  for (let i = 0; i < 3; i++) game.weapons.strike(s, stone, [stone], hit);
  assert.equal(s.pickDash, true);
  const hp = stone.hp;
  game.weapons.strike(s, stone, [stone], hit);
  assert.equal(s.pickDash, false);
  assert.ok(hp - stone.hp < 3 * C.baseMeleeDamage);
});

test('earth empowers direct fist hits while fist combo area bypasses the earth multiplier', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: A.earthUnlockBlock, pickUnlocked: true });
  Object.assign(s.alchemy, { earth: 20, pickEnabled: true });
  const direct = { block: 0, x: 5, y: 5, hp: 1, maxHp: 10, kind: 'stone', neighbors: 0 };
  s.stones = [direct]; game.rebuildIndex();
  game.hit(direct, 1, true, true, false, false, false);
  assert.equal(s.alchemy.earth, 18);
  const area = { ...direct, x: 6, hp: 1 };
  s.stones = [area]; game.rebuildIndex();
  game.hit(area, 1, true, true, false, false, true);
  assert.equal(s.alchemy.earth, 18);
});

test('spear receives a wind bonus and spends air on its destroyed target', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: C.challenge1UnlockBlock, spearUnlocked: true, spearEnchant: true, challenge1Completed: true, weapon: 'spear' });
  Object.assign(s.alchemy, { air: 2, airEnabled: true });
  const stone = { block: 0, x: 5, y: 5, hp: 1, maxHp: 10, kind: 'stone', neighbors: 0 };
  s.stones = [stone]; game.rebuildIndex();
  game.hit(stone, 1, true, false, false, true, false);
  assert.equal(s.alchemy.air, 1);
});

test('Challenge 1 is an isolated 2x2 arena with four-times-health rocks', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = C.challenge1UnlockBlock;
  const original = s.stones;
  assert.equal(game.enterChallenge1(), true);
  assert.equal(s.stones.length, 4);
  assert.equal(s.stones[0].maxHp, 3 * C.challengeStoneMultiplier);
  for (const stone of [...s.stones]) game.destroy(stone);
  assert.equal(s.challengeWon, true);
  assert.equal(s.challenge1Completed, true);
  assert.equal(s.alchemy.air, 10);
  assert.equal(game.leaveChallenge1(), true);
  assert.equal(s.stones, original);
  assert.equal(s.challengeArena, false);
});

test('manual click spends stored buffer only to cancel a pending hit cooldown', () => {
  const game = new PreInfinityGame();
  game.state.tutorial = 'done';
  const s = game.state;
  const target = { block: 0, x: 12, y: 24, hp: 100, maxHp: 100, kind: 'stone', neighbors: 0 };
  Object.assign(s, { auto: true, tutorial: 'done', x: 12, y: 24, attackClock: 0.2 });
  s.stones = [target]; game.rebuildIndex();
  s.clickBuffer = 2;
  game.click();
  assert.equal(s.attackClock, 0);
  assert.equal(s.clickBuffer, 2);
  s.attackClock = 1; s.clickBuffer = 2; const before = target.hp;
  game.click();
  assert.equal(s.clickBuffer, 3);
  assert.equal(target.hp, before - C.fistDamage);
});

test('late square resource bonuses add one ore at 5, 15 and 35', () => {
  const game = new PreInfinityGame();
  game.state.tutorial = 'done';
  for (const block of [4, 5, 14, 15, 34, 35]) {
    const stone = { block, x: 0, y: 1, hp: 1, maxHp: 1, kind: 'stone', neighbors: 0 };
    game.state.stones = [stone]; game.state.block = block; game.rebuildIndex();
    const before = game.state.ore;
    game.destroy(stone);
    assert.equal(game.state.ore - before, 1 + Number(block >= 5) + Number(block >= 15) + Number(block >= 35));
  }
});

test('configurable capacity upgrades, repeatable exchange and persistent upgrades', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  s.furthestBlock = A.waterUnlockBlock;
  s.alchemy.earth = 2000; s.crystals = 70;
  for (const id of ['earth1', 'earth2', 'water1']) assert.equal(game.buyAlchemyUpgrade(id), true);
  assert.equal(s.alchemy.earth, 0);
  assert.equal(s.crystals, 0);
  assert.equal(alchemyCapacity(s.alchemy, 'earth'), 6000);
  assert.equal(alchemyCapacity(s.alchemy, 'water'), 200);
  assert.equal(game.buyAlchemyUpgrade('earth1'), false);
  s.alchemy.water = 100;
  assert.equal(game.crystallizeWater(), true);
  assert.equal(game.crystallizeWater(), true);
  assert.equal(game.crystallizeWater(), false);
  assert.equal(s.crystals, 2);
  s.alchemy.earthEnabled = true;
  s.paused = true; game.save();
  const restored = new PreInfinityGame();
  assert.equal(restored.state.alchemy.earthEnabled, true);
  assert.equal(alchemyCapacity(restored.state.alchemy, 'earth'), 6000);
  Object.assign(restored.state.alchemy, { stone: 10, earth: 10, water: 10, elementalStone: 10 });
  restored.fail();
  assert.deepEqual([restored.state.alchemy.stone, restored.state.alchemy.earth, restored.state.alchemy.water, restored.state.alchemy.elementalStone], [0, 0, 0, 0]);
  assert.equal(alchemyCapacity(restored.state.alchemy, 'earth'), 6000);
  assert.equal(restored.state.alchemy.earthEnabled, true);
});

test('alchemy upgrade requirements are data driven', () => {
  const game = new PreInfinityGame();
  const s = game.state;
  Object.assign(s, { furthestBlock: 29, crystals: 10 });
  s.alchemy.earth = 20;
  const custom = { id: 'future', node: 'earth', name: 'Future', description: '', cost: { earth: 10, crystals: 5 }, capacity: { earth: 50 }, minBlock: 30, requires: ['earth1'] };
  assert.equal(game.canBuyAlchemyUpgrade(custom), false);
  s.furthestBlock = 30;
  assert.equal(game.canBuyAlchemyUpgrade(custom), false);
  s.alchemy.upgrades.earth1 = true;
  assert.equal(game.canBuyAlchemyUpgrade(custom), true);
  assert.equal(game.canBuyAlchemyUpgrade({ ...custom, challenge: 1 }), false);
});

test('old saves get alchemy defaults without losing existing progression', () => {
  const game = new PreInfinityGame();
  Object.assign(game.state, { ore: 77, crystals: 12, furthestBlock: 21, paused: true });
  game.save();
  const legacy = JSON.parse(storage.get('pioneer-breach-v1'));
  delete legacy.alchemy;
  storage.set('pioneer-breach-v1', JSON.stringify(legacy));
  const restored = new PreInfinityGame();
  assert.equal(restored.state.ore, 77);
  assert.equal(restored.state.crystals, 12);
  assert.equal(restored.alchemyNodeUnlocked('earth'), true);
  assert.equal(restored.state.alchemy.earth, 0);
  assert.deepEqual(restored.state.alchemy.upgrades, {});
});

test('enabled alchemy recipes continue during offline simulation', () => {
  const game = new PreInfinityGame();
  Object.assign(game.state, { furthestBlock: A.earthUnlockBlock, paused: false });
  Object.assign(game.state.alchemy, { stone: 100, earthEnabled: true });
  game.save();
  const saved = JSON.parse(storage.get('pioneer-breach-v1'));
  saved.savedAt = Date.now() - 2000;
  storage.set('pioneer-breach-v1', JSON.stringify(saved));
  const restored = new PreInfinityGame();
  assert.ok(restored.state.alchemy.earth >= 10);
  assert.equal(restored.state.alchemy.stone + restored.state.alchemy.earth, 100);
});
