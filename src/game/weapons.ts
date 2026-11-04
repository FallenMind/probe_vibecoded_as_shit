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

export function emitterBlastRadius(level: number): number {
  return C.rangedBlastRadius + level;
}

function fistComboRadius(level: number): number {
  let radius = C.comboFistRadius;
  for (let currentLevel = 1; currentLevel <= Math.min(level, C.comboFistRadiusMaxLevel); currentLevel++) {
    radius += C.comboFistRadiusPerLevel[currentLevel];
  }
  return Math.min(C.comboFistRadiusMax, radius);
}

export function fistComboDamageMultiplier(distance: number, radius: number, radiusLevel: number): number {
  const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
  const eased = t * t * (3 - 2 * t);
  const distanceMultiplier = 1 - (1 - C.comboFistEdgeDamageMultiplier) * eased;
  return distanceMultiplier / Math.max(1, radiusLevel);
}

export class Weapons {
  private animations: { weapon: WeaponId; angle: number; x: number; y: number; remaining: number; charged: boolean }[] = [];
  private dashes: { fromX: number; fromY: number; toX: number; toY: number; remaining: number }[] = [];
  private beam: { x: number; y: number } | null = null;
  private beamTarget: { x: number; y: number } | null = null;
  private beamRetargetClock = 0;
  beamPosition(): { x: number; y: number } | null { return this.beam ? { ...this.beam } : null; }
  canHit(_state: BreachState, _stone: Stone): boolean { return true; }
  speedMultiplier(state: BreachState, weapon: WeaponId): number {
    if (weapon === 'ranged') {
      const level = state.rangedWeapon === 'needle' ? state.needleSpeedLevel : state.emitterSpeedLevel;
      const gain = state.rangedWeapon === 'needle' ? C.needleAttackSpeedPerLevel : C.emitterAttackSpeedPerLevel;
      return 1 + level * gain;
    }
    const level = weapon === 'fists' ? state.fistSpeedLevel : weapon === 'pick' ? state.pickSpeedLevel : state.spearSpeedLevel;
    const gain = weapon === 'fists' ? C.fistAttackSpeedPerLevel : weapon === 'pick' ? C.pickAttackSpeedPerLevel : C.spearAttackSpeedPerLevel;
    return 1 + level * gain;
  }
  needleSpeedMultiplier(state: BreachState): number {
    return 1 + state.needleSpeedLevel * C.needleAttackSpeedPerLevel;
  }
  private masteryMultiplier(state: BreachState, weapon: keyof BreachState['weaponMasteries']): number {
    return state.weaponMasteries[weapon] ? C.weaponMasteries[weapon].damageMultiplier : 1;
  }
  advanceAnimation(dt: number): void {
    for (const effect of this.animations) effect.remaining -= dt;
    this.animations = this.animations.filter(effect => effect.remaining > 0);
    for (const effect of this.dashes) effect.remaining -= dt;
    this.dashes = this.dashes.filter(effect => effect.remaining > 0);
  }
  dash(fromX: number, fromY: number, toX: number, toY: number): void {
    this.dashes.push({ fromX, fromY, toX, toY, remaining: C.dashEffectSeconds });
  }
  tick(state: BreachState, dt: number, speed: number, weapon: WeaponId = state.weapon): number {
    let interval = weapon === 'ranged' ? (state.rangedWeapon === 'needle' ? C.needleInterval : C.rangedInterval) : weapon === 'pick' ? C.pickInterval : weapon === 'spear' ? C.spearInterval : C.attackInterval;
    if (weapon === 'fists' && state.fistComboUnlocked && state.combos.fists && state.comboCounts.fists % 3 === 2) interval *= 2;
    const charged = weapon === 'spear'
      ? state.challenge1Completed && state.combos.spear && (state.comboCounts.spear % 3 === 2 || state.spearDashCharge >= 1)
      : weapon === 'pick' && state.challenge1Completed && state.combos.pick && (state.comboCounts.pick % 3 === 2 || state.pickDashCharge >= 1);
    if (weapon === 'spear' && charged) interval *= C.spearComboWaitMultiplier;
    if (weapon === 'pick' && charged) interval *= 2;
    const clock = weapon === 'ranged' ? 'rangedClock' : 'attackClock';
    state[clock] += dt * speed / interval;
    const attacks = Math.floor(state[clock] + 1e-9);
    state[clock] = Math.max(0, state[clock] - attacks);
    return attacks;
  }
  interactionRange(state: BreachState): number {
    return C.meleeRange;
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
        const blastRadius = emitterBlastRadius(state.emitterAreaLevel);
    const radius = blastRadius * C.rangedSearchMultiplier;
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * this.masteryMultiplier(state, 'emitter') * damageScale;
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
            const factor = stone.kind === 'elemental' ? 1 / C.elementalMultiplier : 1;
            const weight = splashMultiplier(distance, blastRadius, state.emitterSpreadLevel);
            total += (weight * Math.min(stone.hp, Math.max(damage, 1) * 4) + 0.35) * factor;
          }
        }
        if (this.beam) total /= 1 + 0.12 * Math.hypot(x - this.beam.x, y - this.beam.y) / (1 + state.beamSpeedLevel * C.beamSpeedPerLevel);
        if (total > bestDamage || (total > 0 && total === bestDamage && best && (y > best.y || (y === best.y && Math.abs(x - state.x) < Math.abs(best.x - state.x))))) {
          bestDamage = total; best = { x, y };
        }
      }
    }
    return best;
  }
  stopBeam(): void { this.beam = null; this.beamTarget = null; this.beamRetargetClock = 0; }
  laser(state: BreachState, stones: readonly Stone[], dt: number, speed: number, hit: (stone: Stone, damage: number) => void): void {
    this.beamRetargetClock -= dt;
    if (!this.beamTarget || this.beamRetargetClock <= 0) {
      this.beamTarget = this.rangedTarget(state, stones, dt * speed) ?? null;
      this.beamRetargetClock = C.emitterRetargetSeconds;
    }
    const target = this.beamTarget;
    if (!target) { this.stopBeam(); return; }
    if (!this.beam) this.beam = { x: state.x, y: state.y };
    const dx = target.x - this.beam.x, dy = target.y - this.beam.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, C.beamMoveSpeed * (1 + state.beamSpeedLevel * C.beamSpeedPerLevel) * dt);
    if (distance > 0) { this.beam.x += dx / distance * travel; this.beam.y += dy / distance * travel; }
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * this.masteryMultiplier(state, 'emitter') * dt * speed;
    const radius = emitterBlastRadius(state.emitterAreaLevel);
    for (const stone of [...stones]) {
      const d = Math.hypot(stone.x - this.beam.x, stone.y - this.beam.y);
      const multiplier = splashMultiplier(d, radius, state.emitterSpreadLevel);
      if (multiplier > 0) hit(stone, damage * multiplier);
    }
  }
  strike(state: BreachState, target: Pick<Stone, 'x' | 'y'>, stones: readonly Stone[], hit: (stone: Stone, damage: number, area?: boolean, splash?: boolean) => void, manual = false, weapon: WeaponId = state.weapon, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const angle = Math.atan2(target.y - state.y, target.x - state.x);
    const bonus = 0;
    const combo = weapon !== 'ranged' && state.combos[weapon] && (weapon === 'fists' ? state.fistComboUnlocked : state.challenge1Completed);
    const comboCount = combo ? ++state.comboCounts[weapon as 'fists' | 'pick' | 'spear'] : 0;
    const chargedDash = weapon === 'pick' ? state.pickDashCharge >= 1 : weapon === 'spear' && state.spearDashCharge >= 1;
    const special = combo && (comboCount % 3 === 0 || chargedDash);
    this.animations = this.animations.filter(effect => (effect.weapon === 'ranged') !== (weapon === 'ranged'));
    this.animations.push({ weapon, angle, x: target.x, y: target.y, remaining: special ? C.chargedAttackSeconds : C.animationSeconds, charged: special });
    if (special && weapon === 'pick') state.pickDashCharge = 0;
    if (special && weapon === 'spear') state.spearDashCharge = 0;
    if (weapon === 'fists') {
      if (special) {
        const radius = fistComboRadius(state.fistComboRadiusLevel);
        for (const stone of [...stones]) {
          const distance = Math.hypot(stone.x - state.x, stone.y - state.y);
          if (distance <= radius) hit(stone, (C.fistDamage + state.fistLevel + bonus) * this.masteryMultiplier(state, 'fist') * fistComboDamageMultiplier(distance, radius, state.fistComboRadiusLevel), true, true);
        }
        return;
      }
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) {
        const multiplier = stone.hp <= stone.maxHp / 2 ? 1 + state.fistFinisherLevel * C.fistFinisherBonus : 1;
        hit(stone, (C.fistDamage + state.fistLevel + bonus) * this.masteryMultiplier(state, 'fist') * multiplier);
      }
      return;
    }
    if (weapon === 'ranged') {
      if (state.rangedWeapon === 'needle') {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        const damage = (C.needleDamage + state.needleLevel * C.needleDamagePerLevel) * this.masteryMultiplier(state, 'needle');
        if (stone) hit(stone, damage);
        const next = stones.find(item => item.x === target.x && item.y === target.y - 1);
        if (next && state.needlePierceLevel > 0) hit(next, damage * Math.min(1, state.needlePierceLevel * C.needlePierceBonus));
        return;
      }
      const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel + bonus) * this.masteryMultiplier(state, 'emitter');
      for (const stone of [...stones]) {
        const distance = Math.hypot(stone.x - target.x, stone.y - target.y);
        const multiplier = splashMultiplier(distance, emitterBlastRadius(state.emitterAreaLevel), state.emitterSpreadLevel);
        if (multiplier > 0) hit(stone, damage * multiplier, true, true);
      }
      return;
    }
    if (weapon === 'spear') {
      const damage = (C.spearDamage + state.spearLevel + bonus) * this.masteryMultiplier(state, 'spear');
      const radius = Math.min(C.spearRadiusMax, C.spearRadius + state.spearReachLevel * C.spearRadiusPerLevel);
      const hitStones = new Set<Stone>();
      if (special && state.spearEnchant && spearDashPath) {
        const dx = spearDashPath.toX - spearDashPath.fromX;
        const dy = spearDashPath.toY - spearDashPath.fromY;
        const length = Math.hypot(dx, dy);
        if (length > 0) for (const stone of [...stones]) {
          const fromX = stone.x - spearDashPath.fromX;
          const fromY = stone.y - spearDashPath.fromY;
          const along = (fromX * dx + fromY * dy) / length;
          const across = Math.abs(fromX * dy - fromY * dx) / length;
          if (along >= 0 && along <= length && across <= 0.75) {
            hit(stone, damage, true, true);
            hitStones.add(stone);
          }
        }
      }
      for (const stone of [...stones]) {
        if (!hitStones.has(stone) && Math.hypot(stone.x - state.x, stone.y - state.y) <= radius) hit(stone, damage, true, true);
      }
      return;
    }
    const damage = (C.baseMeleeDamage + state.pickLevel + bonus) * this.masteryMultiplier(state, 'pick') * (special ? 3 : 1);
    state.pickDash = special;
    const threshold = Math.cos(C.pickArcDegrees * Math.PI / 360);
    const fx = Math.cos(angle), fy = Math.sin(angle);
    for (const stone of [...stones]) {
      const dx = stone.x - state.x, dy = stone.y - state.y;
      const distance = Math.hypot(dx, dy);
      const regularRadius = Math.min(C.pickRadiusMax, C.pickRadius + state.pickReachLevel * C.pickRadiusPerLevel);
      const reach = regularRadius + (special ? C.pickBlastBonusRadius : 0);
      if (distance <= reach && (special || distance < 0.001 || (dx * fx + dy * fy) / distance >= threshold)) {
        if (special) {
          const centerWeightedFalloff = Math.max(0, 1 - distance / Math.max(1, reach)) ** C.pickBlastFalloffExponent;
          hit(stone, damage * centerWeightedFalloff, true, true);
        } else {
          const falloff = Math.max(0, Math.min(1, (distance - C.meleeRange) / Math.max(0.01, reach - C.meleeRange)));
          const multiplier = 1 - (1 - C.pickMinDamageMultiplier) * falloff ** C.pickFalloffExponent;
          hit(stone, damage * multiplier, false, true);
        }
      }
    }
  }
  draw(g: Phaser.GameObjects.Graphics, state: BreachState, tile: number, px: (x: number) => number, py: (y: number) => number, pickSprite: Phaser.GameObjects.Image, spearSprite: Phaser.GameObjects.Image, visual: { x: number; y: number; alpha: number; previousBeam: { x: number; y: number } | null; offset: number }): void {
    const x = px(visual.x), y = py(visual.y);
    for (const dash of this.dashes) {
      const progress = Math.max(0, Math.min(1, 1 - (dash.remaining - visual.offset) / C.dashEffectSeconds));
      g.lineStyle(Math.max(3, tile * 0.3), 0x79e5df, (1 - progress) * 0.35);
      g.lineBetween(px(dash.fromX), py(dash.fromY), px(dash.toX), py(dash.toY));
      g.lineStyle(Math.max(1, tile * 0.08), 0xd9fff4, (1 - progress) * 0.85);
      g.lineBetween(px(dash.fromX), py(dash.fromY), px(dash.toX), py(dash.toY));
      g.fillStyle(0x9df5ed, (1 - progress) * 0.5);
      g.fillCircle(px(dash.toX), py(dash.toY), tile * (0.3 + progress * 0.5));
    }
    if (this.beam && state.rangedWeapon === 'emitter') {
      const from = visual.previousBeam ?? this.beam;
      const bx = px(from.x + (this.beam.x - from.x) * visual.alpha);
      const by = py(from.y + (this.beam.y - from.y) * visual.alpha);
      g.lineStyle(Math.max(5, tile * 0.38), 0x39c8d1, 0.25);
      g.lineBetween(x, y, bx, by);
      g.lineStyle(Math.max(2, tile * 0.13), 0xb9ffff, 0.95);
      g.lineBetween(x, y, bx, by);
      g.fillStyle(0x6fe4df, 0.18);
      g.fillCircle(bx, by, tile * (emitterBlastRadius(state.emitterAreaLevel) + 0.4));
      if (this.beamTarget) {
        g.lineStyle(Math.max(1, tile * 0.06), 0xffe19a, 0.7);
        g.strokeCircle(px(this.beamTarget.x), py(this.beamTarget.y), tile * (emitterBlastRadius(state.emitterAreaLevel) + 0.4));
        g.lineBetween(bx, by, px(this.beamTarget.x), py(this.beamTarget.y));
      }
    }
    const pickEffect = this.animations.find(effect => effect.weapon === 'pick');
    const spearEffect = this.animations.find(effect => effect.weapon === 'spear');
    let pickAngle = state.target ? Math.atan2(state.target.y - visual.y, state.target.x - visual.x) : -Math.PI / 2;
    if (pickEffect) {
      const duration = pickEffect.charged ? C.chargedAttackSeconds : C.animationSeconds;
      const progress = Math.max(0, Math.min(1, 1 - (pickEffect.remaining - visual.offset) / duration));
      const sweep = C.pickArcDegrees * Math.PI / 180;
      if (pickEffect.charged) {
        const swing = progress < 0.68 ? 0 : Math.min(1, (progress - 0.68) / 0.32);
        pickAngle = pickEffect.angle - 1.1 + (swing * 1.1);
      } else pickAngle = pickEffect.angle - sweep / 2 + sweep * progress;
    }
    pickSprite.setVisible(state.weapon === 'pick');
    if (state.weapon === 'pick') pickSprite.setPosition(x, y).setDisplaySize(tile * 3.2, tile * 3.2).setRotation(pickAngle + Math.PI / 4);
    spearSprite.setVisible(state.weapon === 'spear');
    if (state.weapon === 'spear' && !spearEffect?.charged) {
      const spin = spearEffect ? Math.max(0, Math.min(1, 1 - (spearEffect.remaining - visual.offset) / C.animationSeconds)) * Math.PI * 4 : 0;
      spearSprite.setPosition(x, y).setDisplaySize(tile * 4.2, tile * 1.2).setRotation(spin + Math.PI / 4);
    }
    for (const effect of this.animations) {
    if (effect.weapon !== 'ranged' && effect.weapon !== state.weapon) continue;
    const duration = effect.charged ? C.chargedAttackSeconds : C.animationSeconds;
    const progress = Math.max(0, Math.min(1, 1 - (effect.remaining - visual.offset) / duration));
    if (effect.weapon === 'ranged') {
      g.lineStyle(Math.max(2, tile * 0.15), 0x8fe2df, 1 - progress);
      g.lineBetween(x, y, px(effect.x), py(effect.y));
      g.fillStyle(0xb5ffff, 1 - progress);
      g.fillCircle(px(effect.x), py(effect.y), tile * (0.35 + progress * 0.4));
      continue;
    }
    if (effect.weapon === 'pick') {
      if (effect.charged) {
        const impactProgress = Math.max(0, Math.min(1, (progress - 0.68) / 0.32));
        const radius = tile * (0.35 + impactProgress * 0.9);
        g.lineStyle(Math.max(2, tile * 0.12), 0xffcf82, (1 - impactProgress) * 0.85);
        g.strokeCircle(px(effect.x), py(effect.y), radius);
        g.fillStyle(0xffe7ad, Math.max(0, 0.25 * (1 - impactProgress)));
        g.fillCircle(px(effect.x), py(effect.y), radius * 0.55);
      }
      continue;
    }
    if (effect.weapon === 'spear') {
      if (effect.charged) {
        const targetX = px(effect.x), targetY = py(effect.y);
        const fall = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
        spearSprite.setVisible(true).setPosition(targetX, targetY - tile * 3 * (1 - fall)).setDisplaySize(tile * 4.8, tile * 1.35).setRotation(Math.PI / 2 - Math.PI / 4);
        g.lineStyle(Math.max(2, tile * 0.1), 0x9df4ec, 0.6 * (1 - progress));
        g.lineBetween(x, y, targetX, targetY);
        g.lineStyle(Math.max(2, tile * 0.14), 0x8df4e6, fall * 0.8);
        g.strokeCircle(targetX, targetY, tile * (0.5 + fall * 1.3));
      } else {
        const rotation = progress * Math.PI * 4;
        const radius = tile * 1.65;
        g.lineStyle(Math.max(2, tile * 0.07), 0x75d9cf, 0.3);
        g.strokeCircle(x, y, radius);
        spearSprite.setVisible(true).setPosition(x, y).setDisplaySize(tile * 4.2, tile * 1.2).setRotation(rotation + Math.PI / 4);
      }
      continue;
    }
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

