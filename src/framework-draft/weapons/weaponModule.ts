import type { GameModule, StateAccess, Weapon } from '../core/contracts';
import type { GameCommand, WeaponRuntimeState } from '../core/model';

/** У каждого персонажа своё состояние оружия; объекты оружия хранят только правила. */
export class WeaponModule implements GameModule {
  readonly id = 'weapons';
  readonly priority = 20;
  private readonly weapons = new Map<string, Weapon>();
  constructor(weapons: readonly Weapon[]) { for (const weapon of weapons) this.addWeapon(weapon); }
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
    const tiles = Object.values(bus.read().tiles);
    for (const actor of Object.values(bus.read().characters)) {
      if (!actor.enabled) continue;
      const equipped = [actor.controlledWeapon, ...actor.autonomousWeapons].filter((id): id is string => id !== null);
      for (const id of new Set(equipped)) {
        const weapon = this.weapons.get(id);
        if (!weapon || (weapon.control === 'movement' && actor.controlledWeapon !== id) ||
          (weapon.control === 'autonomous' && !actor.autonomousWeapons.includes(id))) continue;
        const runtime: WeaponRuntimeState = actor.weaponStates[id] ?? { elapsed: 0, attacks: 0, enabled: true, comboEnabled: false };
        const resolveStat = (base: number, keys: readonly string[]): number => {
          const value = bus.query('upgrades', { type: 'stat', payload: { base, keys } });
          return typeof value === 'number' && Number.isFinite(value) ? value : base;
        };
        const result = weapon.tick({ character: actor, tiles, runtime, seconds, resolveStat });
        bus.update(state => { state.characters[actor.id].weaponStates[id] = result.runtime; });
        if (result.movement) {
          bus.emit({ type: 'movement.requested', source: this.id, payload: result.movement });
          bus.invoke('movement', { type: 'move', payload: { intent: result.movement, seconds } });
        }
        for (const attack of result.attacks) bus.emit({ type: 'combat.attack-planned', source: this.id, payload: attack });
      }
    }
  }
}
