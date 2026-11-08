import { isCycleUpgradeActive } from './breachCycleEffects';
import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState } from '../../game/breachTypes';

type LevelField = 'fistComboRadiusLevel' | 'spearLevel' | 'spearReachLevel' | 'spearSpeedLevel' | 'fistLevel' | 'fistSpeedLevel' | 'pickLevel' | 'pickSpeedLevel' | 'rangedLevel' | 'needleLevel' | 'needleSpeedLevel' | 'emitterSpeedLevel' | 'fistFinisherLevel' | 'pickReachLevel' | 'needlePierceLevel' | 'emitterSpreadLevel' | 'emitterAreaLevel' | 'beamSpeedLevel' | 'movementLevel';
export interface BreachRepeatableDefinition {
  id: string;
  levelField: LevelField;
  available?: (state: BreachState, level: number) => boolean;
  onPurchase?: (state: BreachState) => void;
}

/** Магазин повторяемых улучшений в действующем сохранении; состав задаётся данными. */
export class BreachRepeatableShop {
  private readonly definitions = new Map<string, BreachRepeatableDefinition>();
  constructor(definitions: readonly BreachRepeatableDefinition[], private readonly oreCost: (id: string, level: number) => number,
    private readonly crystalCost: (id: string, level: number) => number) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) throw new Error(`Повторное улучшение: ${definition.id}`);
      this.definitions.set(definition.id, definition);
    }
  }
  buy(state: BreachState, id: string): boolean {
    const def = this.definitions.get(id);
    if (!def || state.paused) return false;
    const level = state[def.levelField];
    if (def.available && !def.available(state, level)) return false;
    const ore = Math.ceil(this.oreCost(id, level) * (isCycleUpgradeActive(state, 'cycle16') ? 0.97 : 1));
    const crystals = this.crystalCost(id, level);
    if (state.ore < ore || state.crystals < crystals) return false;
    state.ore -= ore;
    state.crystals -= crystals;
    state[def.levelField]++;
    def.onPurchase?.(state);
    return true;
  }
}

const extraRadius = (state: BreachState): number => isCycleUpgradeActive(state, 'cycle3') ? 2 : 0;
export const BREACH_REPEATABLES: readonly BreachRepeatableDefinition[] = [
  { id: 'fistComboRadius', levelField: 'fistComboRadiusLevel', available: (s, level) => s.fistComboUnlocked && level < C.comboFistRadiusMaxLevel + extraRadius(s) && (level < 3 || s.furthestBlock > C.comboFistRadiusLevel4UnlockBlock), onPurchase: s => {
    if (s.fistComboRadiusLevel <= 3 && s.fistComboRadiusRewardedLevels < s.fistComboRadiusLevel) {
      s.crystals += s.fistComboRadiusLevel - s.fistComboRadiusRewardedLevels;
      s.fistComboRadiusRewardedLevels = s.fistComboRadiusLevel;
    }
  } },
  { id: 'melee', levelField: 'fistLevel' }, { id: 'fistSpeed', levelField: 'fistSpeedLevel' },
  { id: 'fistFinisher', levelField: 'fistFinisherLevel' }, { id: 'movement', levelField: 'movementLevel' },
  { id: 'pickDamage', levelField: 'pickLevel', available: s => s.pickUnlocked },
  { id: 'pickSpeed', levelField: 'pickSpeedLevel', available: s => s.pickUnlocked },
  { id: 'pickReach', levelField: 'pickReachLevel', available: (s, level) => s.pickUnlocked && level < C.pickReachMaxLevel + extraRadius(s) },
  { id: 'spearDamage', levelField: 'spearLevel', available: s => s.spearUnlocked },
  { id: 'spearSpeed', levelField: 'spearSpeedLevel', available: s => s.spearUnlocked },
  { id: 'spearReach', levelField: 'spearReachLevel', available: (s, level) => s.spearUnlocked && level < C.spearReachMaxLevel + extraRadius(s) },
  { id: 'rangedDamage', levelField: 'rangedLevel', available: s => s.rangedUnlocked },
  { id: 'emitterSpeed', levelField: 'emitterSpeedLevel', available: s => s.rangedUnlocked },
  { id: 'emitterSpread', levelField: 'emitterSpreadLevel', available: (s, level) => s.rangedUnlocked && level < C.emitterSpreadMaxLevel },
  { id: 'emitterArea', levelField: 'emitterAreaLevel', available: (s, level) => s.rangedUnlocked && level < C.emitterAreaMaxLevel },
  { id: 'beamSpeed', levelField: 'beamSpeedLevel', available: s => s.rangedUnlocked },
  { id: 'needleDamage', levelField: 'needleLevel', available: s => s.needleUnlocked },
  { id: 'needleSpeed', levelField: 'needleSpeedLevel', available: s => s.needleUnlocked },
  { id: 'needlePierce', levelField: 'needlePierceLevel', available: (s, level) => s.needleUnlocked && level < C.needlePierceMaxLevel },
];
