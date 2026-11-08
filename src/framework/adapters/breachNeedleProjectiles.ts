import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState, Stone } from '../../game/breachTypes';

export interface NeedleProjectileHost {
  readonly state: BreachState;
  stones(): readonly Stone[];
  getStone(block: number, x: number, y: number): Stone | undefined;
  fireActive(): boolean;
  canHit(stone: Stone): boolean;
  currentMeleeDamage(): number;
  baseDamage(): number;
  rangedMultiplier(): number;
  pierceLevel(): number;
  hit(stone: Stone, damage: number, elementalPierce: boolean): void;
  random(): number;
}
export interface NeedleProjectiles {
  launch(target?: Stone): boolean;
  tick(seconds: number): void;
  tickBurning(seconds: number): void;
}

/** Снаряды игломёта и бесконечное горение используют состояние вызвавшего режима. */
export class BreachNeedleProjectiles implements NeedleProjectiles {
  constructor(private readonly host: NeedleProjectileHost) {}

  launch(followTarget?: Stone): boolean {
    const s = this.host.state;
    const damage = this.host.baseDamage() * this.host.rangedMultiplier();
    let best: Stone | undefined;
    let remainingHp = 0;
    const candidates: { stone: Stone; remaining: number }[] = [];
    for (const stone of this.host.stones()) {
      if (followTarget && stone !== followTarget) continue;
      if (!followTarget && this.host.fireActive() && stone.ignited) continue;
      if (!this.host.canHit(stone)) continue;
      const factor = stone.kind === 'elemental' ? 1 / C.elementalMultiplier : 1;
      let reserved = 0;
      for (const shot of s.projectiles) {
        if (shot.block !== stone.block || shot.x !== stone.x) continue;
        if (shot.y === stone.y) reserved += shot.damage * factor;
        else if (shot.y - 1 === stone.y) reserved += shot.pierce * factor;
      }
      const available = stone.hp - reserved;
      if (available <= 1e-8) continue;
      candidates.push({ stone, remaining: available / factor });
      if (!best || stone.y > best.y || (stone.y === best.y && Math.abs(stone.x - s.x) < Math.abs(best.x - s.x))) {
        best = stone; remainingHp = available / factor;
      }
    }
    if (!best) return false;
    if (!followTarget) {
      const spread = candidates.filter(candidate => Math.hypot(candidate.stone.x - best!.x, candidate.stone.y - best!.y) <= C.needleSpreadRadius);
      const chosen = spread[Math.floor(this.host.random() * spread.length)];
      best = chosen.stone; remainingHp = chosen.remaining;
    }
    const shotDamage = Math.min(damage, remainingHp);
    const duration = Math.max(0.01, Math.hypot(best.x - s.x, best.y - s.y) / C.needleProjectileSpeed);
    s.projectiles.push({ block: s.block, x: best.x, y: best.y, fromX: s.x, fromY: s.y, duration, remaining: duration,
      damage: shotDamage, pierce: shotDamage * Math.min(1, this.host.pierceLevel() * C.needlePierceBonus), followUp: !!followTarget, elementalPierce: this.host.fireActive() });
    if (!followTarget && this.host.fireActive()) best.ignited = true;
    return true;
  }

  tick(dt: number): void {
    const s = this.host.state;
    const followUps = s.needleFollowUps;
    s.needleFollowUps = [];
    for (const follow of followUps) {
      follow.remaining -= dt;
      if (follow.remaining > 1e-9) { s.needleFollowUps.push(follow); continue; }
      if (follow.block !== s.block) continue;
      const survivor = this.host.getStone(follow.block, follow.x, follow.y);
      if (survivor) this.launch(survivor);
    }
    const pending = s.projectiles;
    s.projectiles = [];
    for (const shot of pending) {
      shot.remaining -= dt;
      if (shot.remaining > 0) { s.projectiles.push(shot); continue; }
      if (shot.block !== s.block) continue;
      const target = this.host.getStone(shot.block, shot.x, shot.y);
      if (target) this.host.hit(target, shot.damage, !!shot.elementalPierce);
      if (target && target.hp > 0 && shot.elementalPierce) {
        if (!target.burning) target.burnTickRemaining = C.needleBurnTickSeconds;
        target.burning = true;
      }
      if (target && target.hp > 0 && !shot.followUp && !this.host.fireActive()) s.needleFollowUps.push({ block: shot.block, x: shot.x, y: shot.y, remaining: Math.max(0, C.needleFollowUpDelay + shot.remaining) });
      const behind = shot.y > 0 ? this.host.getStone(shot.block, shot.x, shot.y - 1) : undefined;
      if (behind && shot.pierce > 0) {
        this.host.hit(behind, shot.pierce, !!shot.elementalPierce);
        if (behind.hp > 0 && shot.elementalPierce) {
          behind.ignited = true;
          if (!behind.burning) behind.burnTickRemaining = C.needleBurnTickSeconds;
          behind.burning = true;
        }
      }
    }
  }

  tickBurning(dt: number): void {
    for (const stone of [...this.host.state.stones]) {
      if (!stone.burning) continue;
      stone.burnTickRemaining = (stone.burnTickRemaining ?? C.needleBurnTickSeconds) - dt;
      while (stone.burnTickRemaining <= 1e-9 && stone.hp > 0) {
        stone.burnTickRemaining += C.needleBurnTickSeconds;
        const damage = Math.min(stone.maxHp * C.needleBurnDamagePercentPerTick, this.host.currentMeleeDamage() * 0.5);
        this.host.hit(stone, damage, true);
      }
    }
  }
}
