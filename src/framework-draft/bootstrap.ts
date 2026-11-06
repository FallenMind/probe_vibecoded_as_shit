import { AirRecipe } from './alchemy/air';
import { AlchemyActions } from './alchemy/actions';
import { EarthRecipe } from './alchemy/earth';
import { FireRecipe } from './alchemy/fire';
import { WaterRecipe } from './alchemy/water';
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

/** Изолированный пример сборки. Он не создаёт Phaser-сцену и не читает игровые сохранения. */
export function createDraftFramework(source: FrameworkConfig = DEFAULT_CONFIG): { bus: StateBus; config: FrameworkConfig } {
  const config = structuredClone(source);
  const bus = new StateBus();
  for (const [id, resource] of Object.entries(config.alchemy.resources)) bus.registerResource(id, resource);
  if (config.modules.movement) bus.register(new MovementModule(new DirectMovement()));
  if (config.modules.weapons) bus.register(new WeaponModule([
    new Fists(config.weapons.fists), new Pick(config.weapons.pick), new Spear(config.weapons.spear),
    new NeedleGun(config.weapons.needle), new Emitter(config.weapons.emitter), new Bombarda(config.weapons.bombarda),
  ]));
  if (config.modules.alchemy) {
    bus.register(new EarthRecipe(config.alchemy.recipes.earth));
    bus.register(new WaterRecipe(config.alchemy.recipes.water));
    bus.register(new AirRecipe(config.alchemy.recipes.air));
    bus.register(new FireRecipe(config.alchemy.recipes.fire));
    bus.register(new AlchemyActions(config.alchemy.actions));
  }
  if (config.modules.upgrades) bus.register(new UpgradeModule(exampleUpgrades));
  addCharacter(bus, { id: 'main', mapId: 'start', position: { x: config.characters.spawnX, y: config.characters.spawnY },
    movementSpeed: config.characters.baseMovementSpeed, attackSpeed: config.characters.baseAttackSpeed, enabled: true,
    controlledWeapon: null, autonomousWeapons: [], weaponStates: {}, tags: ['primary'] }, config.characters.maxCount, true);
  if (config.modules.weapons) bus.invoke('weapons', { type: 'equip', payload: { characterId: 'main', weaponId: 'fists' } });
  return { bus, config };
}
