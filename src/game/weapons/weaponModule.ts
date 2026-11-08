import type { GameModule, StateAccess, Weapon } from '../core/contracts';
import { EARTH_MARKED_TAG, type DeepReadonly, type GameCommand, type TileState, type WeaponRuntimeState } from '../core/model';
import type { FrameworkConfig } from '../config/schema';
import { isUpgradeActive } from '../upgrades/upgrade';

/** У каждого персонажа своё состояние оружия; объекты оружия хранят только правила. */
export class WeaponModule implements GameModule {
  readonly id = 'weapons';
  readonly priority = 20;
  private readonly weapons = new Map<string, Weapon>();
  constructor(weapons: readonly Weapon[], private readonly input?: FrameworkConfig['input'], private readonly earthDamageMultiplier = 2) { for (const weapon of weapons) this.addWeapon(weapon); }
  addWeapon(weapon: Weapon): void {
    if (this.weapons.has(weapon.id)) throw new Error(`Оружие уже зарегистрировано: ${weapon.id}`);
    this.weapons.set(weapon.id, weapon);
  }
  replaceWeapon(weapon: Weapon): void {
    if (!this.weapons.has(weapon.id)) throw new Error(`Оружие не зарегистрировано: ${weapon.id}`);
    this.weapons.set(weapon.id, weapon);
  }
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type !== 'equip' && command.type !== 'set-combo') return false;
    const value = command.payload as { characterId: string; weaponId: string; enabled?: unknown };
    const weapon = this.weapons.get(value?.weaponId);
    const character = bus.read().characters[value?.characterId];
    if (!weapon || !character) return false;
    if (command.type === 'set-combo') {
      if (typeof value.enabled !== 'boolean' || !character.weaponStates[weapon.id] || (value.enabled && !weapon.comboAvailable)) return false;
      bus.update(state => { state.characters[value.characterId].weaponStates[weapon.id].comboEnabled = value.enabled as boolean; });
      return true;
    }
    bus.update(state => {
      const actor = state.characters[value.characterId];
      if (weapon.control === 'movement') actor.controlledWeapon = weapon.id;
      else if (!actor.autonomousWeapons.includes(weapon.id)) actor.autonomousWeapons.push(weapon.id);
      actor.weaponStates[weapon.id] ??= { elapsed: 0, attacks: 0, enabled: true, comboEnabled: false };
    });
    return true;
  }
  tick(bus: StateAccess, seconds: number): void {
    const tilesByMap = new Map<string, DeepReadonly<TileState>[]>();
    for (const tile of Object.values(bus.read().tiles)) {
      let mapTiles = tilesByMap.get(tile.mapId);
      if (!mapTiles) { mapTiles = []; tilesByMap.set(tile.mapId, mapTiles); }
      mapTiles.push(tile);
    }
    for (const actor of Object.values(bus.read().characters)) {
      if (!actor.enabled) continue;
      const tiles = tilesByMap.get(actor.mapId) ?? [];
      const equipped = [actor.controlledWeapon, ...actor.autonomousWeapons].filter((id): id is string => id !== null);
      for (const id of new Set(equipped)) {
        const weapon = this.weapons.get(id);
        if (!weapon || (weapon.control === 'movement' && actor.controlledWeapon !== id) ||
          (weapon.control === 'autonomous' && !actor.autonomousWeapons.includes(id))) continue;
        const runtime: WeaponRuntimeState = actor.weaponStates[id] ?? { elapsed: 0, attacks: 0, enabled: true, comboEnabled: false };
        const resolveStat = (base: number, keys: readonly string[]): number => {
          const value = bus.query('upgrades', { type: 'stat', payload: { base, keys } });
          const result = typeof value === 'number' && Number.isFinite(value) ? value : base;
          if (id !== 'emitter' || !this.input || !isUpgradeActive('emitter.elemental', bus.read(), ['unique', 'emitter'])) return result;
          const run = bus.read().moduleData.run as { clicks?: number } | undefined;
          const capacity = this.input.clickBufferCapacity * (isUpgradeActive('cycle.15', bus.read(), ['cycle']) ? 1.1 : 1);
          const fill = Math.min(1, Math.max(0, (run?.clicks ?? 0) / capacity));
          return result * (1 + fill * this.input.emitterSpeedMaxBonus);
        };
        const predictedDamage = id === 'needle'
          ? bus.query('combat', { type: 'projectile-reservations', payload: actor.id }) as Record<string, number> ?? {}
          : undefined;
        const fireMode = id === 'needle' && isUpgradeActive('needle.elemental', bus.read(), ['unique', 'needle']);
        const reservedFireTargets = fireMode
          ? new Set(bus.query('combat', { type: 'fire-target-reservations', payload: actor.id }) as string[] ?? [])
          : undefined;
        const run = bus.read().moduleData.run as { earthBuff?: boolean; challenge?: number; stimpackRemaining?: number } | undefined;
        const predictProjectileDamage = id === 'needle' ? (plan: import('../core/contracts').AttackPlan, target: import('../core/model').DeepReadonly<import('../core/model').TileState>) => {
          const alreadyMarked = target.tags.includes(EARTH_MARKED_TAG);
          const empowered = !!run?.earthBuff && alreadyMarked;
          const elementalFactor = target.kind === 'elemental'
            ? empowered ? 1 : Math.max(0.2, Math.min(1, plan.direct.elementalPenetration)) : 1;
          const elementalBonus = target.kind === 'elemental' && isUpgradeActive('cycle.14', bus.read(), ['cycle']) ? 1.1 : 1;
          const stimpackBonus = run?.challenge === 4 && (run.stimpackRemaining ?? 0) > 0 ? 1.5 : 1;
          return plan.direct.damage * elementalFactor * (empowered ? this.earthDamageMultiplier : 1) * elementalBonus * stimpackBonus;
        } : undefined;
        const result = weapon.tick({ character: actor, tiles, runtime, seconds, predictedDamage, predictProjectileDamage,
          prioritizeUnburned: fireMode, reservedFireTargets, resolveStat });
        bus.update(state => { state.characters[actor.id].weaponStates[id] = result.runtime; });
        const move = () => {
          if (!result.movement) return;
          bus.emit({ type: 'movement.requested', source: this.id, payload: result.movement });
          bus.invoke('movement', { type: 'move', payload: { intent: result.movement, seconds } });
        };
        const attack = () => {
          for (const plan of result.attacks) {
            bus.emit({ type: 'combat.attack-planned', source: this.id, payload: plan });
            bus.invoke('combat', { type: 'attack', payload: plan });
          }
        };
        // Для кирки попадание рассчитывается из текущей позиции, затем тот же тик двигает её вперёд.
        if (weapon.control === 'movement') { attack(); move(); } else { move(); attack(); }
      }
    }
  }
}
