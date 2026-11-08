import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import { CHALLENGE_RULES } from '../../../game/challengeConfig';
import type { BreachState, Stone } from '../../../game/breachTypes';
import type { Point } from '../../core/model';
import type { TileArea } from '../../world/area';

export interface LaserContext {
  state: BreachState; stones: readonly Stone[]; seconds: number; speed: number;
  target(damageScale: number): Point | undefined;
  emitterMastery(): number;
  baseDamage(): number;
  rangedMultiplier(): number;
  spreadLevel: number;
  beamSpeedLevel: number;
  blastRadius(level: number): number;
  splashMultiplier(distance: number, radius: number, spreadLevel: number): number;
  hit(stone: Stone, damage: number): void;
  damageArea(area: TileArea, damage: (stone: Readonly<Stone>, distance: number) => number, hit: (stone: Stone, damage: number) => void): void;
}

/** Состояние и перемещение непрерывного луча, независимо от визуализации. */
export class BreachLaser {
  position: Point | null = null;
  target: Point | null = null;
  private retargetClock = 0;

  stop(): void { this.position = null; this.target = null; this.retargetClock = 0; }
  tick(c: LaserContext): void {
    const { state, seconds, speed } = c;
    this.retargetClock -= seconds;
    if (!this.target || this.retargetClock <= 0) {
      this.target = c.target(seconds * speed) ?? null;
      this.retargetClock = C.emitterRetargetSeconds;
    }
    const target = this.target;
    if (!target) { this.stop(); return; }
    if (!this.position) this.position = { x: state.x, y: state.y };
    const dx = target.x - this.position.x, dy = target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, C.beamMoveSpeed * (1 + c.beamSpeedLevel * C.beamSpeedPerLevel) * seconds);
    if (distance > 0) { this.position.x += dx / distance * travel; this.position.y += dy / distance * travel; }
    const damage = c.baseDamage() * c.emitterMastery() * seconds * speed * c.rangedMultiplier();
    const radius = state.challengeArena && !CHALLENGE_RULES[state.challengeNumber].weaponSplash ? 0 : c.blastRadius(state.emitterAreaLevel) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
    c.damageArea({ shape: 'circle', center: { ...this.position }, radius },
      (_stone, d) => damage * c.splashMultiplier(d, radius, c.spreadLevel), c.hit);
  }
}
