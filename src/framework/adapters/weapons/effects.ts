import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { WeaponId } from '../../../game/breachTypes';
import type { DashPath } from './contracts';
import type { BreachDashAnimation, BreachWeaponAnimation } from './renderer';

/** Визуальные таймеры оружия не меняют игровые результаты ударов. */
export class BreachWeaponEffects {
  private activeAttacks: BreachWeaponAnimation[] = [];
  private activeDashes: BreachDashAnimation[] = [];
  get animations(): readonly BreachWeaponAnimation[] { return this.activeAttacks; }
  get dashes(): readonly BreachDashAnimation[] { return this.activeDashes; }

  tick(seconds: number): void {
    for (const effect of this.activeAttacks) effect.remaining -= seconds;
    this.activeAttacks = this.activeAttacks.filter(effect => effect.remaining > 0);
    for (const effect of this.activeDashes) effect.remaining -= seconds;
    this.activeDashes = this.activeDashes.filter(effect => effect.remaining > 0);
  }
  dash(path: DashPath): void { this.activeDashes.push({ ...path, remaining: C.dashEffectSeconds }); }
  attack(weapon: WeaponId, angle: number, x: number, y: number, special: boolean, spearDashPath?: DashPath | null): void {
    this.activeAttacks = this.activeAttacks.filter(effect => (effect.weapon === 'ranged') !== (weapon === 'ranged'));
    this.activeAttacks.push({ weapon, angle, x, y, remaining: special ? C.chargedAttackSeconds : C.animationSeconds, charged: special,
      ...(weapon === 'spear' && spearDashPath ? { dashFromX: spearDashPath.fromX, dashFromY: spearDashPath.fromY, dashToX: spearDashPath.toX, dashToY: spearDashPath.toY } : {}) });
  }
  spearActorPosition(offset: number): { x: number; y: number } | null {
    const effect = this.activeAttacks.find(item => item.weapon === 'spear' && item.charged && item.dashFromX !== undefined && item.dashToX !== undefined);
    if (!effect) return null;
    const progress = Math.max(0, Math.min(1, 1 - (effect.remaining - offset) / C.chargedAttackSeconds));
    return progress < 0.68 ? { x: effect.dashFromX!, y: effect.dashFromY! } : { x: effect.dashToX!, y: effect.dashToY! };
  }
}
