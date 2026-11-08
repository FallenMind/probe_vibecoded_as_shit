import type { BreachStoneKind } from '../world/breachWorld';

export interface BreachDamageConfig {
  hardSplashMultiplier: number; elementalResistance: number; elementalPierceEfficiency: number;
  earthPerStone: number; unoptimizedEarthMultiplier: number; earthDamageMultiplier: number;
  stoneWeights: Readonly<Record<BreachStoneKind, number>>;
}
export interface BreachDamageContext {
  kind: BreachStoneKind; amount: number; splash: boolean; weaponHit: boolean; elementalPierce: boolean;
  armorPenetration: number; earthHit: boolean; earthEnabled: boolean; earthAvailable: number; earthOptimized: boolean;
  challengeMultiplier: number; hardBonus: number; elementalBonus: number; globalBonus: number;
}
export interface BreachDamageResult { damage: number; empowered: boolean; earthCost: number }

/** Числовые правила попадания; состояние, эффекты и оплата принадлежат вызвавшему модулю. */
export class BreachDamagePolicy {
  constructor(private readonly config: BreachDamageConfig) {}
  calculate(c: BreachDamageContext): BreachDamageResult {
    const rules = this.config;
    const earthCost = rules.earthPerStone * (c.earthOptimized ? 1 : rules.unoptimizedEarthMultiplier) * rules.stoneWeights[c.kind];
    const empowered = c.earthHit && c.earthEnabled && c.earthAvailable >= earthCost;
    let damage = c.amount * c.challengeMultiplier;
    damage *= 1 + (c.kind === 'hard' ? c.hardBonus : 0) + (c.kind === 'elemental' ? c.elementalBonus : 0) + c.globalBonus;
    if (empowered) damage *= rules.earthDamageMultiplier;
    if (c.kind === 'hard' && c.splash && c.armorPenetration <= 0) damage *= rules.hardSplashMultiplier;
    if (c.weaponHit && c.kind === 'elemental') damage *= empowered ? 1 : c.elementalPierce ? rules.elementalPierceEfficiency : 1 / rules.elementalResistance;
    return { damage, empowered, earthCost };
  }
}
