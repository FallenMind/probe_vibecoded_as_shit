import type Phaser from 'phaser';
import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, Stone, WeaponId } from './breachTypes';

/** Плавное затухание по расстоянию с учётом площади расширенного луча. */
export function splashMultiplier(distance: number, radius: number, spreadLevel: number): number {
  if (distance === 0) return 1;
  if (distance > radius) return 0;
  const t = distance / (radius + 1);
  const ease = 1 - t * t * (3 - 2 * t);
  return Math.min(1, ease * ease * (1 + spreadLevel * C.emitterSpreadBonus * 2) / Math.sqrt(radius));
}

export class Weapons {
  private animations: { weapon: WeaponId; angle: number; x: number; y: number; remaining: number }[] = [];
  private beam: { x: number; y: number } | null = null;
  canHit(state: BreachState, stone: Stone): boolean { return stone.kind !== 'hard' || state.penetration > 0; }
  advanceAnimation(dt: number): void {
    for (const effect of this.animations) effect.remaining -= dt;
    this.animations = this.animations.filter(effect => effect.remaining > 0);
  }
  tick(state: BreachState, dt: number, speed: number, weapon: WeaponId = state.weapon): number {
    const interval = weapon === 'ranged' ? (state.rangedWeapon === 'needle' ? C.needleInterval : C.rangedInterval) : weapon === 'pick' ? C.pickInterval : C.attackInterval;
    const clock = weapon === 'ranged' ? 'rangedClock' : 'attackClock';
    state[clock] += dt * speed / interval;
    const attacks = Math.floor(state[clock] + 1e-9);
    state[clock] = Math.max(0, state[clock] - attacks);
    return attacks;
  }
  interactionRange(state: BreachState): number {
    return state.weapon === 'pick' ? C.pickInteractionRange + state.pickReachLevel * C.pickInteractionReachBonus : C.meleeRange;
  }
  rangedTarget(state: BreachState, stones: readonly Stone[], damageScale = 1): { x: number; y: number } | undefined {
    const cells = new Map<string, Stone>();
    let rear: Stone | undefined;
    for (const stone of stones) {
      if (stone.block !== state.block) continue;
      cells.set(`${stone.x}:${stone.y}`, stone);
      if (this.canHit(state, stone) && (!rear || stone.y > rear.y || (stone.y === rear.y && Math.abs(stone.x - state.x) < Math.abs(rear.x - state.x)))) rear = stone;
    }
    if (!rear) return undefined;
    if (state.rangedWeapon === 'needle') return { x: rear.x, y: rear.y };
    const blastRadius = C.rangedBlastRadius + state.emitterAreaLevel;
    const radius = blastRadius * C.rangedSearchMultiplier;
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * damageScale;
    let best: { x: number; y: number } | undefined;
    let bestDamage = 0;
    for (let y = Math.max(0, rear.y - radius); y <= Math.min(state.size - 1, rear.y + radius); y++) {
      for (let x = Math.max(0, rear.x - radius); x <= Math.min(state.size - 1, rear.x + radius); x++) {
        if (Math.hypot(x - rear.x, y - rear.y) > radius) continue;
        let total = 0;
        for (let dy = -blastRadius; dy <= blastRadius; dy++) {
          for (let dx = -blastRadius; dx <= blastRadius; dx++) {
            const distance = Math.hypot(dx, dy);
            if (distance > blastRadius) continue;
            const stone = cells.get(`${x + dx}:${y + dy}`);
            if (!stone || !this.canHit(state, stone)) continue;
            const factor = stone.kind === 'elemental' && state.buffRemaining <= 0 && state.charges <= 0 ? 1 / C.elementalMultiplier : 1;
            const weight = splashMultiplier(distance, blastRadius, state.emitterSpreadLevel);
            total += (weight * Math.min(stone.hp, Math.max(damage, 1) * 4) + 0.35) * factor;
          }
        }
        if (total > bestDamage || (total > 0 && total === bestDamage && best && (y > best.y || (y === best.y && Math.abs(x - state.x) < Math.abs(best.x - state.x))))) {
          bestDamage = total; best = { x, y };
        }
      }
    }
    return best;
  }
  stopBeam(): void { this.beam = null; }
  laser(state: BreachState, stones: readonly Stone[], dt: number, speed: number, hit: (stone: Stone, damage: number) => void): void {
    const target = this.rangedTarget(state, stones, dt * speed);
    if (!target) { this.stopBeam(); return; }
    if (!this.beam) this.beam = { x: state.x, y: state.y };
    const dx = target.x - this.beam.x, dy = target.y - this.beam.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, C.beamMoveSpeed * dt);
    if (distance > 0) { this.beam.x += dx / distance * travel; this.beam.y += dy / distance * travel; }
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * dt * speed;
    const radius = C.rangedBlastRadius + state.emitterAreaLevel;
    for (const stone of [...stones]) {
      const d = Math.hypot(stone.x - this.beam.x, stone.y - this.beam.y);
      const multiplier = splashMultiplier(d, radius, state.emitterSpreadLevel);
      if (multiplier > 0) hit(stone, damage * multiplier);
    }
  }
  strike(state: BreachState, target: Pick<Stone, 'x' | 'y'>, stones: readonly Stone[], hit: (stone: Stone, damage: number) => void, manual = false, weapon: WeaponId = state.weapon): void {
    const angle = Math.atan2(target.y - state.y, target.x - state.x);
    this.animations = this.animations.filter(effect => (effect.weapon === 'ranged') !== (weapon === 'ranged'));
    this.animations.push({ weapon, angle, x: target.x, y: target.y, remaining: C.animationSeconds });
    const bonus = manual ? state.clickLevel : 0;
    if (weapon === 'fists') {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) {
        const multiplier = stone.hp <= stone.maxHp / 2 ? 1 + state.fistFinisherLevel * C.fistFinisherBonus : 1;
        hit(stone, (C.fistDamage + state.fistLevel + bonus) * multiplier);
      }
      return;
    }
    if (weapon === 'ranged') {
      if (state.rangedWeapon === 'needle') {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        const damage = C.needleDamage + state.needleLevel * C.needleDamagePerLevel;
        if (stone) hit(stone, damage);
        const next = stones.find(item => item.x === target.x && item.y === target.y - 1);
        if (next && state.needlePierceLevel > 0) hit(next, damage * Math.min(1, state.needlePierceLevel * C.needlePierceBonus));
        return;
      }
      const damage = C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel + bonus;
      for (const stone of [...stones]) {
        const distance = Math.hypot(stone.x - target.x, stone.y - target.y);
        const multiplier = splashMultiplier(distance, C.rangedBlastRadius + state.emitterAreaLevel, state.emitterSpreadLevel);
        if (multiplier > 0) hit(stone, damage * multiplier);
      }
      return;
    }
    const damage = C.baseMeleeDamage + state.pickLevel + bonus;
    const threshold = Math.cos(C.pickArcDegrees * Math.PI / 360);
    const fx = Math.cos(angle), fy = Math.sin(angle);
    for (const stone of [...stones]) {
      const dx = stone.x - state.x, dy = stone.y - state.y;
      const distance = Math.hypot(dx, dy);
      const reach = C.pickRadius + state.pickReachLevel * C.pickReachBonus;
      if (distance <= reach && (distance < 0.001 || (dx * fx + dy * fy) / distance >= threshold)) {
        const falloff = Math.max(0, Math.min(1, (distance - C.meleeRange) / (reach - C.meleeRange)));
        const multiplier = 1 - (1 - C.pickMinDamageMultiplier) * falloff ** C.pickFalloffExponent;
        hit(stone, damage * multiplier);
      }
    }
  }
  draw(g: Phaser.GameObjects.Graphics, state: BreachState, tile: number, px: (x: number) => number, py: (y: number) => number, pickSprite: Phaser.GameObjects.Image): void {
    const x = px(state.x), y = py(state.y);
    if (this.beam && state.rangedWeapon === 'emitter') {
      const bx = px(this.beam.x), by = py(this.beam.y);
      g.lineStyle(Math.max(5, tile * 0.38), 0x39c8d1, 0.25);
      g.lineBetween(x, y, bx, by);
      g.lineStyle(Math.max(2, tile * 0.13), 0xb9ffff, 0.95);
      g.lineBetween(x, y, bx, by);
      g.fillStyle(0x6fe4df, 0.18);
      g.fillCircle(bx, by, tile * (C.rangedBlastRadius + state.emitterAreaLevel + 0.4));
    }
    const pickEffect = this.animations.find(effect => effect.weapon === 'pick');
    let pickAngle = state.target ? Math.atan2(state.target.y - state.y, state.target.x - state.x) : -Math.PI / 2;
    if (pickEffect) {
      const progress = 1 - pickEffect.remaining / C.animationSeconds;
      const sweep = C.pickArcDegrees * Math.PI / 180;
      pickAngle = pickEffect.angle - sweep / 2 + sweep * progress;
    }
    pickSprite.setVisible(state.weapon === 'pick');
    if (state.weapon === 'pick') pickSprite.setPosition(x, y).setDisplaySize(tile * 2.4, tile * 2.4).setRotation(pickAngle + Math.PI / 4);
    for (const effect of this.animations) {
    if (effect.weapon !== 'ranged' && effect.weapon !== state.weapon) continue;
    const progress = 1 - effect.remaining / C.animationSeconds;
    if (effect.weapon === 'ranged') {
      g.lineStyle(Math.max(2, tile * 0.15), 0x8fe2df, 1 - progress);
      g.lineBetween(x, y, px(effect.x), py(effect.y));
      g.fillStyle(0xb5ffff, 1 - progress);
      g.fillCircle(px(effect.x), py(effect.y), tile * (0.35 + progress * 0.4));
      continue;
    }
    if (effect.weapon === 'pick') continue;
    const sweep = Math.PI / 3;
    const direction = effect.angle - sweep / 2 + sweep * progress;
    const radius = tile * 1.1;
    g.lineStyle(Math.max(3, tile * 0.2), 0xeac99f, 1 - progress * 0.5);
    g.lineBetween(x, y, x + Math.cos(direction) * radius, y + Math.sin(direction) * radius);
    g.fillStyle(0xffe5b0, 1 - progress);
    g.fillCircle(x + Math.cos(direction) * radius, y + Math.sin(direction) * radius, Math.max(3, tile * 0.25));
    }
  }
}

