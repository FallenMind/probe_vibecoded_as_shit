import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const { DEFAULT_CONFIG, StateBus, AlchemyRecipe } = await server.ssrLoadModule('/src/game/index.ts');
after(() => server.close());

function createAlchemyBus() {
  const bus = new StateBus();
  for (const [id, resource] of Object.entries(DEFAULT_CONFIG.alchemy.resources)) bus.registerResource(id, resource);
  bus.update(state => {
    state.moduleData.run = { challengeDone: { '3': true } };
    state.upgradeLevels['alchemy.vulcanization-unlock'] = 1;
    state.upgradeLevels['alchemy.decomposition-unlock'] = 1;
  });
  return bus;
}

test('vulcanization keeps producing elemental stone when the regular stone cap is full', () => {
  const bus = createAlchemyBus();
  bus.update(state => {
    state.resources.stone.amount = state.resources.stone.capacity;
    state.resources.fire.amount = 20;
    state.resources.air.amount = 20;
    state.resources.water.amount = 20;
  });
  const recipe = new AlchemyRecipe(DEFAULT_CONFIG.alchemy.recipes.vulcanization);
  bus.register(recipe);
  assert.equal(bus.invoke(recipe.id, { type: 'set-enabled', payload: true }), true);
  bus.tick(1);
  const resources = bus.read().resources;
  assert.equal(resources.stone.amount, resources.stone.capacity);
  assert.equal(resources.elementalStone.amount, 18);
  assert.equal(resources.fire.amount, 19.8);
});

test('decomposition keeps producing uncapped resources when one output resource is full', () => {
  const bus = createAlchemyBus();
  bus.update(state => {
    state.resources.elementalStone.amount = 100;
    state.resources.stone.amount = state.resources.stone.capacity;
  });
  const recipe = new AlchemyRecipe(DEFAULT_CONFIG.alchemy.recipes.decomposition);
  bus.register(recipe);
  assert.equal(bus.invoke(recipe.id, { type: 'set-enabled', payload: true }), true);
  bus.tick(6);
  const resources = bus.read().resources;
  assert.equal(resources.stone.amount, resources.stone.capacity);
  assert.equal(resources.elementalStone.amount, 90);
  assert.equal(resources.earth.amount, 20);
  assert.equal(resources.water.amount, 2);
});
