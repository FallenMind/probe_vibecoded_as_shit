import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState } from '../../game/breachTypes';
import { BreachBoundUpgrade } from './breachBoundUpgrade';

export type StatUpgradeField = 'fistLevel' | 'pickLevel' | 'spearLevel' | 'needleLevel' | 'rangedLevel' | 'fistSpeedLevel' | 'pickSpeedLevel' | 'spearSpeedLevel' | 'needleSpeedLevel' | 'emitterSpeedLevel' | 'movementLevel' | 'fistComboRadiusLevel' | 'fistFinisherLevel' | 'pickReachLevel' | 'spearReachLevel' | 'needlePierceLevel' | 'emitterSpreadLevel' | 'emitterAreaLevel' | 'beamSpeedLevel' | 'penetration' | 'expansion';
export interface BreachStatUpgradeBinding { id: string; field: StatUpgradeField; stat: string; perLevel: number; category: 'melee' | 'ranged' | 'movement' | 'world' | 'all'; group: 'damage' | 'speed' | 'area' | 'effect' }

/** Первая группа реальных характеристик, подключённых к общему пайплайну баффов. */
export const BREACH_STAT_UPGRADE_BINDINGS: readonly BreachStatUpgradeBinding[] = [
  { id: 'melee', field: 'fistLevel', stat: 'weapon.fists.baseDamage', perLevel: C.fistDamagePerLevel, category: 'melee', group: 'damage' },
  { id: 'pickDamage', field: 'pickLevel', stat: 'weapon.pick.baseDamage', perLevel: 1, category: 'melee', group: 'damage' },
  { id: 'spearDamage', field: 'spearLevel', stat: 'weapon.spear.baseDamage', perLevel: C.spearDamagePerLevel, category: 'melee', group: 'damage' },
  { id: 'needleDamage', field: 'needleLevel', stat: 'weapon.needle.baseDamage', perLevel: C.needleDamagePerLevel, category: 'ranged', group: 'damage' },
  { id: 'rangedDamage', field: 'rangedLevel', stat: 'weapon.emitter.baseDamage', perLevel: C.rangedDamagePerLevel, category: 'ranged', group: 'damage' },
  { id: 'fistSpeed', field: 'fistSpeedLevel', stat: 'weapon.fists.speed', perLevel: C.fistAttackSpeedPerLevel, category: 'melee', group: 'speed' },
  { id: 'pickSpeed', field: 'pickSpeedLevel', stat: 'weapon.pick.speed', perLevel: C.pickAttackSpeedPerLevel, category: 'melee', group: 'speed' },
  { id: 'spearSpeed', field: 'spearSpeedLevel', stat: 'weapon.spear.speed', perLevel: C.spearAttackSpeedPerLevel, category: 'melee', group: 'speed' },
  { id: 'needleSpeed', field: 'needleSpeedLevel', stat: 'weapon.needle.speed', perLevel: C.needleAttackSpeedPerLevel, category: 'ranged', group: 'speed' },
  { id: 'emitterSpeed', field: 'emitterSpeedLevel', stat: 'weapon.emitter.speed', perLevel: C.emitterAttackSpeedPerLevel, category: 'ranged', group: 'speed' },
  { id: 'movement', field: 'movementLevel', stat: 'character.movement.speed', perLevel: C.movementSpeedPerLevel, category: 'movement', group: 'speed' },
  { id: 'fistComboRadius', field: 'fistComboRadiusLevel', stat: 'weapon.fists.comboLevel', perLevel: 1, category: 'melee', group: 'area' },
  { id: 'fistFinisher', field: 'fistFinisherLevel', stat: 'weapon.fists.finisherLevel', perLevel: 1, category: 'melee', group: 'effect' },
  { id: 'pickReach', field: 'pickReachLevel', stat: 'weapon.pick.radius', perLevel: C.pickRadiusPerLevel, category: 'melee', group: 'area' },
  { id: 'spearReach', field: 'spearReachLevel', stat: 'weapon.spear.radius', perLevel: C.spearRadiusPerLevel, category: 'melee', group: 'area' },
  { id: 'needlePierce', field: 'needlePierceLevel', stat: 'weapon.needle.pierceLevel', perLevel: 1, category: 'ranged', group: 'effect' },
  { id: 'emitterSpread', field: 'emitterSpreadLevel', stat: 'weapon.emitter.spreadLevel', perLevel: 1, category: 'ranged', group: 'area' },
  { id: 'emitterArea', field: 'emitterAreaLevel', stat: 'weapon.emitter.radius', perLevel: 1, category: 'ranged', group: 'area' },
  { id: 'beamSpeed', field: 'beamSpeedLevel', stat: 'weapon.emitter.beamSpeedLevel', perLevel: 1, category: 'ranged', group: 'speed' },
  { id: 'penetration', field: 'penetration', stat: 'weapon.armorPenetration', perLevel: 1, category: 'all', group: 'effect' },
  { id: 'expansion', field: 'expansion', stat: 'world.expansion', perLevel: 1, category: 'world', group: 'area' },
];

export function createBreachStatUpgrades(): BreachBoundUpgrade[] {
  const numeric = BREACH_STAT_UPGRADE_BINDINGS.map(binding => new BreachBoundUpgrade({
    id: binding.id, name: binding.id, description: '', maxLevel: Number.MAX_SAFE_INTEGER,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {},
    tags: binding.category === 'movement' ? ['character', 'movement', binding.group] : binding.category === 'world' ? ['game', 'progression', binding.group] : binding.category === 'all' ? ['weapon', binding.group] : ['weapon', binding.category, binding.group],
    effects: [{ type: 'stat', key: binding.stat, stage: 'baseFlat', value: binding.perLevel }],
  }));
  const cycle = (id: string, stat: string) => new BreachBoundUpgrade({ id, name: id, description: '', maxLevel: 1,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle', 'damage'],
    effects: [{ type: 'stat', key: stat, stage: 'outputMult', value: 1.5 }],
  });
  const mechanics = Array.from({ length: 16 }, (_, index) => `cycle${index + 1}`)
    .filter(id => id !== 'cycle1' && id !== 'cycle5')
    .map(id => new BreachBoundUpgrade({ id, name: id, description: '', maxLevel: 1,
      baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['cycle'], effects: [],
      mechanicEffects: [{ key: id, target: { kind: 'game' as const }, parameters: { enabled: true }, priority: 0 }],
    }));
  const mastery = (['fist', 'pick', 'spear', 'needle', 'emitter'] as const).map(weapon => new BreachBoundUpgrade({
    id: `${weapon}Mastery`, name: `${weapon}Mastery`, description: '', maxLevel: 1,
    baseCost: {}, costMultiplier: 1, requiresUpgrades: {}, requiresResources: {}, tags: ['weapon', 'mastery'], effects: [],
    mechanicEffects: [{ key: 'weapon.mastery', target: { kind: 'weapon' as const, id: weapon },
      parameters: { multiplier: C.weaponMasteries[weapon].damageMultiplier }, priority: 0 }],
  }));
  return [...numeric, cycle('cycle1', 'weapon.melee.output'), cycle('cycle5', 'weapon.ranged.output'), ...mechanics, ...mastery];
}

export function bindBreachStatLevels(levels: Record<string, number>, state: BreachState): void {
  for (const binding of BREACH_STAT_UPGRADE_BINDINGS) Object.defineProperty(levels, binding.id, {
    enumerable: true, configurable: true,
    get: () => state[binding.field], set: (level: number) => { state[binding.field] = level; },
  });
  for (const id of Array.from({ length: 16 }, (_, index) => `cycle${index + 1}`)) Object.defineProperty(levels, id, {
    enumerable: true, configurable: true,
    get: () => state.cycleUpgrades[id] ? 1 : 0, set: (level: number) => { state.cycleUpgrades[id] = level > 0; },
  });
  for (const weapon of ['fist', 'pick', 'spear', 'needle', 'emitter'] as const) Object.defineProperty(levels, `${weapon}Mastery`, {
    enumerable: true, configurable: true,
    get: () => state.weaponMasteries[weapon] ? 1 : 0, set: (level: number) => { state.weaponMasteries[weapon] = level > 0; },
  });
}
