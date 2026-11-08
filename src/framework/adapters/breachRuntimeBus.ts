import { alchemyCapacity } from '../../game/alchemy';
import type { AlchemySwitch } from '../../game/alchemy';
import type { BreachState, WeaponId, RangedWeaponId } from '../../game/breachTypes';
import { StateBus } from '../core/stateBus';
import { UpgradeModule } from '../upgrades/upgradeModule';
import { bindBreachStatLevels, createBreachStatUpgrades } from './breachStatUpgrades';
import { bindBreachSpecialLevels, createBreachSpecialUpgrades } from './breachSpecialUpgrades';
import { bindBreachAlchemyLevels, createBreachAlchemyUpgrades, isAlchemyUpgradeActive } from './breachAlchemyUpgrades';
import { bindBreachSpectraLevels, createBreachSpectraUpgrades } from './breachSpectraUpgrades';
import type { BreachWorldAccess } from './breachWorldAccess';
import type { Stone } from '../../game/breachTypes';
import type { TileArea } from '../world/area';
import type { BreachHitOptions } from './breachCombat';

export interface BreachRuntimeHost {
  readonly state: BreachState;
  readonly world: BreachWorldAccess;
  hit(stone: Stone, amount: number, options: BreachHitOptions): void;
  move(x: number, y: number, seconds: number): void;
  teleport(x: number, y: number): void;
  tickControlledWeapon(seconds: number, target: Stone | undefined): void;
  tickAutonomousWeapon(seconds: number, target: Stone | undefined): void;
  tickProjectiles(seconds: number): void;
  tickArtifact(seconds: number): void;
  step(seconds: number): void;
  click(): boolean;
  tickInput(seconds: number): void;
  buy(id: string): boolean;
  buyCycle(id: string): boolean;
  buySpectra(id: string): boolean;
  unlockSpectra(): boolean;
  buyAlchemy(id: string): boolean;
  advanceAlchemy(seconds: number): void;
  advanceAutoCrystallize(seconds: number): void;
  advanceAlchemyEffects(seconds: number): void;
  toggleAlchemy(name: AlchemySwitch): boolean;
  craftWater(): boolean;
  crystallize(): boolean;
  toggleAutoCrystallize(): boolean;
  overload(): boolean;
  equip(weapon: WeaponId): boolean;
  equipRanged(weapon: RangedWeaponId): boolean;
  burst(): boolean;
  toggleCombo(): boolean;
  enterChallenge(number: 1 | 2 | 3 | 4): boolean;
  leaveChallenge(): boolean;
  challengeModifier(kind: 'stone' | 'damage' | 'range'): boolean;
  tickChallengeTimer(seconds: number): void;
  tickChallengeRegeneration(seconds: number): void;
  tickProgression(kind: 'boss' | 'compress' | 'cleared' | 'boundary', seconds: number): boolean;
}

/** Шина переходного режима: ресурсы ссылаются на единственное игровое состояние. */
export class BreachRuntimeBus extends StateBus {
  constructor(host: BreachRuntimeHost) {
    super();
    const state = host.state;
    this.update(root => {
      root.moduleData.breach = state;
      root.upgradeEnabled = state.frameworkUpgradeEnabled;
      root.upgradeSuppressions = state.frameworkUpgradeSuppressions;
      bindBreachStatLevels(root.upgradeLevels, state);
      bindBreachSpecialLevels(root.upgradeLevels, state);
      bindBreachAlchemyLevels(root.upgradeLevels, state);
      bindBreachSpectraLevels(root.upgradeLevels, state);
    });
    const upgrades = new UpgradeModule([...createBreachStatUpgrades(), ...createBreachSpecialUpgrades(), ...createBreachAlchemyUpgrades(), ...createBreachSpectraUpgrades()]);
    this.bindPaused(() => state.paused, value => { state.paused = value; });
    for (const id of ['ore', 'crystals', 'breakthrough'] as const) {
      this.bindResource(id, { amount: () => state[id], setAmount: amount => { state[id] = amount; }, capacity: () => null });
    }
    for (const id of ['stone', 'elementalStone', 'earth', 'water', 'air', 'fire'] as const) {
      this.bindResource(id, { amount: () => state.alchemy[id], setAmount: amount => { state.alchemy[id] = amount; },
        capacity: () => id === 'earth' || id === 'water' || id === 'air' || id === 'fire' ? alchemyCapacity(state.alchemy, id, key => isAlchemyUpgradeActive(state, key)) : null });
    }
    this.register({ id: 'gameplay', tick: (_bus, seconds) => host.step(seconds), command: (_bus, command) => {
      if (command.type !== 'click') return false;
      return _bus.invoke('input', { type: 'click', payload: null });
    } });
    this.register({ id: 'input', command: (_bus, command) => {
      if (command.type === 'click') return host.click();
      if (command.type === 'tick' && typeof command.payload === 'number' && Number.isFinite(command.payload) && command.payload >= 0) {
        host.tickInput(command.payload); return true;
      }
      return false;
    } });
    this.register({ id: 'combat', command: (_bus, command) => {
      if (command.type !== 'hit' || !command.payload || typeof command.payload !== 'object') return false;
      const { stone, amount, options } = command.payload as { stone: Stone; amount: number; options: BreachHitOptions };
      if (!stone || typeof stone !== 'object' || !Number.isFinite(amount) || amount < 0 || !options || typeof options !== 'object' ||
          ![options.weaponHit, options.earthHit, options.ignoreArmor, options.splash, options.elementalPierce].every(value => typeof value === 'boolean') ||
          !Number.isFinite(options.flashColor)) return false;
      host.hit(stone, amount, options);
      return true;
    } });
    this.register({ id: 'movement', query: (_bus, query) => query.type === 'character' && query.payload === 'main'
      ? { id: 'main', block: state.block, position: { x: state.x, y: state.y }, weapon: state.weapon } : undefined,
    command: (_bus, command) => {
      if ((command.type !== 'move' && command.type !== 'teleport') || !command.payload || typeof command.payload !== 'object') return false;
      const { characterId, x, y, seconds } = command.payload as { characterId: string; x: number; y: number; seconds: number };
      if (characterId !== 'main' || ![x, y].every(Number.isFinite)) return false;
      if (command.type === 'teleport') { host.teleport(x, y); return true; }
      if (!Number.isFinite(seconds) || seconds < 0) return false;
      host.move(x, y, seconds);
      return true;
    } });
    this.register({ id: 'upgrades', command: (_bus, command) => {
      if (command.type === 'buy' && typeof command.payload === 'string') return host.buy(command.payload);
      if (command.type === 'buy-cycle' && typeof command.payload === 'string') return host.buyCycle(command.payload);
      if (command.type === 'buy-spectra' && typeof command.payload === 'string') return host.buySpectra(command.payload);
      return upgrades.command(_bus, command);
    }, query: (bus, query) => upgrades.query(bus, query) });
    this.register({ id: 'spectra', command: (_bus, command) => command.type === 'unlock' && host.unlockSpectra() });
    this.register({ id: 'world', query: (_bus, query) => {
      if (query.type === 'current-block') return { block: state.block, size: state.size };
      if (query.type === 'stones' && Number.isInteger(query.payload)) return host.world.stonesInBlock(query.payload as number).map(stone => ({ ...stone }));
      if (query.type === 'stone' && query.payload && typeof query.payload === 'object') {
        const { block, x, y } = query.payload as { block: number; x: number; y: number };
        if (![block, x, y].every(Number.isInteger)) return undefined;
        const stone = host.world.getStone(block, x, y);
        return stone ? { ...stone } : undefined;
      }
      if (query.type === 'area' && query.payload && typeof query.payload === 'object') {
        const { block, area } = query.payload as { block: number; area: TileArea };
        if (!Number.isInteger(block) || !area) return undefined;
        try { return host.world.selectArea(block, area).map(stone => ({ ...stone })); } catch { return undefined; }
      }
      return undefined;
    }, command: (_bus, command) => {
      if (command.type === 'add-stones' && Array.isArray(command.payload)) return host.world.addStones(command.payload as Stone[]);
      if (command.type === 'remove-stone' && command.payload && typeof command.payload === 'object') {
        const { block, x, y } = command.payload as { block: number; x: number; y: number };
        if (![block, x, y].every(Number.isInteger)) return false;
        const stone = host.world.getStone(block, x, y);
        return !!stone && host.world.removeStone(stone);
      }
      return false;
    } });
    this.register({ id: 'alchemy', command: (_bus, command) => {
      if ((command.type === 'auto-crystallize-tick' || command.type === 'effects-tick') && typeof command.payload === 'number' && Number.isFinite(command.payload) && command.payload >= 0) {
        if (command.type === 'auto-crystallize-tick') host.advanceAutoCrystallize(command.payload);
        else host.advanceAlchemyEffects(command.payload);
        return true;
      }
      if (command.type === 'tick' && typeof command.payload === 'number' && Number.isFinite(command.payload) && command.payload >= 0) {
        host.advanceAlchemy(command.payload); return true;
      }
      if (command.type === 'craft-water') return host.craftWater();
      if (command.type === 'crystallize') return host.crystallize();
      if (command.type === 'auto-crystallize') return host.toggleAutoCrystallize();
      if (command.type === 'overload') return host.overload();
      if (command.type === 'buy' && typeof command.payload === 'string') return host.buyAlchemy(command.payload);
      if (command.type === 'toggle' && typeof command.payload === 'string' &&
          ['earthEnabled', 'waterEnabled', 'pickEnabled', 'airProductionEnabled', 'elementalizationEnabled'].includes(command.payload)) return host.toggleAlchemy(command.payload as AlchemySwitch);
      return false;
    } });
    this.register({ id: 'weapons', command: (_bus, command) => {
      if (command.type === 'burst') return _bus.invoke('autonomous-weapon', { type: 'burst', payload: null });
      if (command.type === 'toggle-combo') return host.toggleCombo();
      if (command.type === 'equip' && typeof command.payload === 'string' && ['fists', 'pick', 'spear', 'bombarda'].includes(command.payload)) return host.equip(command.payload as WeaponId);
      if (command.type === 'equip-ranged' && (command.payload === 'needle' || command.payload === 'emitter')) return host.equipRanged(command.payload);
      return false;
    } });
    for (const [id, tick] of [
      ['controlled-weapon', host.tickControlledWeapon], ['autonomous-weapon', host.tickAutonomousWeapon],
    ] as const) this.register({ id, command: (_bus, command) => {
      if (id === 'autonomous-weapon' && command.type === 'burst') return host.burst();
      if (command.type !== 'tick' || !command.payload || typeof command.payload !== 'object') return false;
      const { seconds, target } = command.payload as { seconds: number; target?: Stone };
      if (!Number.isFinite(seconds) || seconds < 0 || (target !== undefined && (!target || typeof target !== 'object'))) return false;
      tick(seconds, target);
      return true;
    } });
    for (const [id, tick] of [['projectiles', host.tickProjectiles], ['artifact', host.tickArtifact]] as const) {
      this.register({ id, command: (_bus, command) => {
        if (command.type !== 'tick' || typeof command.payload !== 'number' || !Number.isFinite(command.payload) || command.payload < 0) return false;
        tick(command.payload);
        return true;
      } });
    }
    this.register({ id: 'challenges', command: (_bus, command) => {
      if ((command.type === 'timer' || command.type === 'regenerate') && typeof command.payload === 'number' && Number.isFinite(command.payload) && command.payload >= 0) {
        if (command.type === 'timer') host.tickChallengeTimer(command.payload);
        else host.tickChallengeRegeneration(command.payload);
        return true;
      }
      if (command.type === 'leave') return host.leaveChallenge();
      if (command.type === 'modifier' && (command.payload === 'stone' || command.payload === 'damage' || command.payload === 'range')) return host.challengeModifier(command.payload);
      if (command.type === 'enter' && (command.payload === 1 || command.payload === 2 || command.payload === 3 || command.payload === 4)) return host.enterChallenge(command.payload);
      return false;
    } });
    let progressionStopped = false;
    this.register({ id: 'progression', query: (_bus, query) => query.type === 'stopped' ? progressionStopped : undefined,
    command: (_bus, command) => {
      if (!['boss', 'compress', 'cleared', 'boundary'].includes(command.type) || typeof command.payload !== 'number' ||
        !Number.isFinite(command.payload) || command.payload < 0) return false;
      progressionStopped = host.tickProgression(command.type as 'boss' | 'compress' | 'cleared' | 'boundary', command.payload);
      return true;
    } });
  }
}
