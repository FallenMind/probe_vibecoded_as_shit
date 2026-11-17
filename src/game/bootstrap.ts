import { AlchemyRecipe } from './alchemy/recipe';
import { AlchemyActions } from './alchemy/actions';
import { DEFAULT_CONFIG } from './config/defaults';
import type { FrameworkConfig } from './config/schema';
import { addCharacter } from './core/characters';
import { StateBus } from './core/stateBus';
import { DirectMovement, MovementModule } from './movement/nearest';
import { exampleUpgrades } from './upgrades/examples';
import { UpgradeModule } from './upgrades/upgradeModule';
import { Bombarda } from './weapons/bombarda';
import { Emitter } from './weapons/emitter';
import { Fists } from './weapons/fists';
import { NeedleGun } from './weapons/needle';
import { Pick } from './weapons/pick';
import { Spear } from './weapons/spear';
import { WeaponModule } from './weapons/weaponModule';
import type { GameState } from './core/model';

/** Изолированная сборка модулей для примеров и проверок; не читает игровые сохранения. */
export function createDraftFramework(source: FrameworkConfig = DEFAULT_CONFIG, initial?: GameState): { bus: StateBus; config: FrameworkConfig } {
  const config = structuredClone(source);
  const bus = new StateBus(initial);
  for (const [id, resource] of Object.entries(config.alchemy.resources)) if (!bus.read().resources[id]) bus.registerResource(id, resource);
  if (config.modules.movement) bus.register(new MovementModule(new DirectMovement()));
  if (config.modules.weapons) bus.register(new WeaponModule([
    new Fists(config.weapons.fists), new Pick(config.weapons.pick), new Spear(config.weapons.spear),
    new NeedleGun(config.weapons.needle), new Emitter(config.weapons.emitter), new Bombarda(config.weapons.bombarda),
  ], config.input, config.alchemy.buffs.earthDamageMultiplier, config.world));
  if (config.modules.alchemy) {
    bus.register(new AlchemyRecipe(config.alchemy.recipes.earth));
    bus.register(new AlchemyRecipe(config.alchemy.recipes.water));
    bus.register(new AlchemyRecipe(config.alchemy.recipes.air));
    bus.register(new AlchemyRecipe(config.alchemy.recipes.fire));
    bus.register(new AlchemyRecipe(config.alchemy.recipes.vulcanization));
    bus.register(new AlchemyRecipe(config.alchemy.recipes.decomposition));
    bus.register(new AlchemyActions(config.alchemy.actions));
  }
  if (config.modules.upgrades) bus.register(new UpgradeModule(exampleUpgrades));
  const created = addCharacter(bus, { id: 'main', mapId: 'start', position: { x: config.characters.spawnX, y: config.characters.spawnY },
    movementSpeed: config.characters.baseMovementSpeed, attackSpeed: config.characters.baseAttackSpeed, enabled: true,
    controlledWeapon: null, autonomousWeapons: [], weaponStates: {}, tags: ['primary'] }, config.characters.maxCount, true);
  if (created && config.modules.weapons) bus.invoke('weapons', { type: 'equip', payload: { characterId: 'main', weaponId: 'fists' } });
  return { bus, config };
}
