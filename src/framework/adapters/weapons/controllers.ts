import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachState, Stone } from '../../../game/breachTypes';
import type { Weapons } from '../../../game/weapons';
import { isCycleUpgradeActive } from '../breachCycleEffects';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';
import type { DashPath } from './contracts';

/** Оба контроллера имеют общий контракт, но могут заменяться независимо. */
export interface BreachWeaponController { tick(seconds: number, target: Stone | undefined): void }
export type BreachWeaponOperations = Pick<Weapons, 'interactionRange' | 'speedMultiplier' | 'tick' | 'stopBeam' | 'laser' | 'needleSpeedMultiplier'>;
export interface BreachWeaponControllerHost {
  readonly state: BreachState;
  readonly weapons: BreachWeaponOperations;
  stones(): readonly Stone[];
  target(): Stone | undefined;
  move(x: number, y: number, seconds: number): void;
  strike(target: Stone, spear: DashPath | null, pick: DashPath | null): void;
  spearWindup(): void;
  spearDash(): DashPath | null;
  pickDash(target: Stone): DashPath | null;
  launchNeedle(): boolean;
  laserHit(stone: Stone, damage: number): void;
}

/** Оружие, которое выбирает цель и ведёт к ней персонажа. */
export class BreachControlledWeaponController implements BreachWeaponController {
  constructor(private readonly host: BreachWeaponControllerHost) {}
  tick(dt: number, target: Stone | undefined): void {
    const { state: s, weapons } = this.host;
    const comboEnabled = ((s.weapon === 'pick' && s.combos.pick) || (s.weapon === 'spear' && s.combos.spear)) && s.challenge2Completed;
    const mining = !!target && Math.hypot(target.x - s.x, target.y - s.y) <= weapons.interactionRange(s);
    if (comboEnabled && !mining) {
      const speed = weapons.speedMultiplier(s, s.weapon);
      if (s.weapon === 'pick') s.pickDashCharge = Math.min(1, s.pickDashCharge + dt * speed / C.pickDashChargeSeconds);
      else s.spearDashCharge = Math.min(1, s.spearDashCharge + dt * speed / C.spearDashChargeSeconds);
    }
    if (!target) return;
    if (s.tutorial === 'second' && s.block === 2 && target.kind === 'hard') s.tutorial = 'penetration';
    const range = weapons.interactionRange(s);
    if (Math.hypot(target.x - s.x, target.y - s.y) > range) this.host.move(target.x, target.y, dt);
    const canAttack = isSpecialUpgradeActive(s, 'auto') || s.tutorial === 'click';
    if (!canAttack || s.tutorial === 'auto' || Math.hypot(target.x - s.x, target.y - s.y) > range) return;
    const attacks = weapons.tick(s, dt, weapons.speedMultiplier(s, s.weapon));
    for (let i = 0; i < attacks; i++) {
      const next = this.host.target();
      if (!next || Math.hypot(next.x - s.x, next.y - s.y) > range) break;
      const cadence = C.comboAttackCount - (isCycleUpgradeActive(s, 'cycle6') ? 2 : 0);
      const pickCombo = s.weapon === 'pick' && s.challenge2Completed && s.combos.pick && (s.comboCounts.pick % cadence === cadence - 1 || s.pickDashCharge >= 1);
      const spearCombo = s.weapon === 'spear' && s.challenge2Completed && s.combos.spear && (s.comboCounts.spear % cadence === cadence - 1 || s.spearDashCharge >= 1);
      const pickDash = pickCombo ? this.host.pickDash(next) : null;
      if (spearCombo) this.host.spearWindup();
      const spearDash = spearCombo ? this.host.spearDash() : null;
      const impact = spearCombo ? this.host.target() : next;
      if (!impact) continue;
      this.host.strike(impact, spearDash, pickDash);
      if (spearCombo) { s.attackClock = 0; break; }
      if (s.challengeArena && s.challengeWon) break;
    }
  }
}

/** Дальнее оружие действует параллельно основному и не выбирает движение. */
export class BreachAutonomousWeaponController implements BreachWeaponController {
  constructor(private readonly host: BreachWeaponControllerHost) {}
  tick(dt: number, target: Stone | undefined): void {
    const { state: s, weapons } = this.host;
    if (!target) return;
    if (s.rangedUnlocked || s.needleUnlocked) {
      const speed = weapons.speedMultiplier(s, 'ranged');
      if (s.rangedWeapon === 'emitter') {
        s.needleRecheckClock = 0;
        const attacks = weapons.tick(s, dt, speed, 'ranged');
        s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + attacks);
        weapons.laser(s, this.host.stones(), dt, speed, (stone, damage) => this.host.laserHit(stone, damage));
      } else {
        weapons.stopBeam();
        const attacks = weapons.tick(s, dt, speed, 'ranged');
        for (let i = 0; i < attacks; i++) {
          if (!this.host.launchNeedle()) break;
          if (s.challenge2Completed) s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + 1);
        }
        s.needleRecheckClock += dt;
        if (s.needleRecheckClock >= C.needleRecheckInterval) {
          s.needleRecheckClock -= C.needleRecheckInterval;
          if (this.host.launchNeedle() && s.challenge2Completed) s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + 1);
        }
      }
    }
    if (isSpecialUpgradeActive(s, 'needleAlt') && s.needleUnlocked && s.rangedWeapon !== 'needle') {
      s.needleAltClock += dt * weapons.needleSpeedMultiplier(s) / (C.needleInterval * (isCycleUpgradeActive(s, 'cycle2') ? 1 : C.needleAltIntervalMultiplier));
      while (s.needleAltClock >= 1 - 1e-9) { s.needleAltClock = Math.max(0, s.needleAltClock - 1); if (!this.host.launchNeedle()) break; }
    }
  }
}
