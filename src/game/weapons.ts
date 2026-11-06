import type Phaser from 'phaser';
import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, Stone, WeaponId } from './breachTypes';
import { CHALLENGE_RULES } from './challengeConfig';

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

function fistComboRadius(state: BreachState): number {
  let radius = C.comboFistRadius;
  const levelCap = C.comboFistRadiusMaxLevel + (state.cycleUpgrades.cycle3 ? 2 : 0);
  for (let currentLevel = 1; currentLevel <= Math.min(state.fistComboRadiusLevel, levelCap); currentLevel++) {
    radius += C.comboFistRadiusPerLevel[currentLevel] ?? 1;
  }
  return Math.min(C.comboFistRadiusMax + (state.cycleUpgrades.cycle3 ? 2 : 0), radius);
}

function comboCadence(state: BreachState, weapon: 'fists' | 'pick' | 'spear'): number {
  return C.comboAttackCount - (weapon !== 'fists' && state.cycleUpgrades.cycle6 ? 2 : 0);
}

function fistComboAvailable(state: BreachState): boolean {
  return state.fistComboUnlocked || (state.challengeArena && state.challengeNumber === 2);
}

export function fistComboDamageMultiplier(distance: number, radius: number): number {
  const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
  const eased = t * t * (3 - 2 * t);
  const distanceMultiplier = 1 - (1 - C.comboFistEdgeDamageMultiplier) * eased;
  return distanceMultiplier;
}

export class Weapons {
  private animations: { weapon: WeaponId; angle: number; x: number; y: number; remaining: number; charged: boolean; dashFromX?: number; dashFromY?: number; dashToX?: number; dashToY?: number }[] = [];
  private dashes: { fromX: number; fromY: number; toX: number; toY: number; remaining: number }[] = [];
  private beam: { x: number; y: number } | null = null;
  private beamTarget: { x: number; y: number } | null = null;
  private beamRetargetClock = 0;
  beamPosition(): { x: number; y: number } | null { return this.beam ? { ...this.beam } : null; }
  spearDashActorPosition(offset: number): { x: number; y: number } | null {
    const effect = this.animations.find(item => item.weapon === 'spear' && item.charged && item.dashFromX !== undefined && item.dashToX !== undefined);
    if (!effect) return null;
    const progress = Math.max(0, Math.min(1, 1 - (effect.remaining - offset) / C.chargedAttackSeconds));
    return progress < 0.68 ? { x: effect.dashFromX!, y: effect.dashFromY! } : { x: effect.dashToX!, y: effect.dashToY! };
  }
  canHit(_state: BreachState, _stone: Stone): boolean { return true; }
  speedMultiplier(state: BreachState, weapon: WeaponId): number {
    const challengeSpeed = state.challengeArena ? CHALLENGE_RULES[state.challengeNumber].attackSpeedMultiplier : 1;
    const cycleSpeed = 1 + (state.cycleUpgrades.cycle12 ? 0.1 : 0) + (state.spectraUpgrades.twin ? 0.35 : 0);
    const clickFraction = Math.min(1, state.clickBuffer / (C.clickBufferCapacity * (state.cycleUpgrades.cycle15 ? 1.1 : 1)));
    const clickBonus = clickFraction * C.clickMiningSpeedMaxBonus;
    if (weapon === 'ranged') {
      const level = state.rangedWeapon === 'needle' ? state.needleSpeedLevel : state.emitterSpeedLevel;
      const gain = state.rangedWeapon === 'needle' ? C.needleAttackSpeedPerLevel : C.emitterAttackSpeedPerLevel;
      const emitterBonus = state.rangedWeapon === 'emitter' && state.emitterPierceUpgrade
        ? clickFraction * C.emitterClickSpeedMaxBonus
        : 0;
      const needleBonus = state.rangedWeapon === 'needle' && state.cycleUpgrades.cycle2 ? 1.5 : 1;
      return (1 + level * gain) * (1 + clickBonus) * (1 + emitterBonus) * challengeSpeed * cycleSpeed * needleBonus;
    }
    const level = weapon === 'fists' ? state.fistSpeedLevel : weapon === 'pick' ? state.pickSpeedLevel : weapon === 'spear' ? state.spearSpeedLevel : state.rangedLevel;
    const gain = weapon === 'fists' ? C.fistAttackSpeedPerLevel : weapon === 'pick' ? C.pickAttackSpeedPerLevel : weapon === 'spear' ? C.spearAttackSpeedPerLevel : C.needleAttackSpeedPerLevel;
    return (1 + level * gain) * (1 + clickBonus) * challengeSpeed * cycleSpeed;
  }
  needleSpeedMultiplier(state: BreachState): number {
    const clickFraction = Math.min(1, state.clickBuffer / (C.clickBufferCapacity * (state.cycleUpgrades.cycle15 ? 1.1 : 1)));
    return (1 + state.needleSpeedLevel * C.needleAttackSpeedPerLevel) * (1 + clickFraction * C.clickMiningSpeedMaxBonus) * (state.cycleUpgrades.cycle2 ? 1.5 : 1);
  }
  private masteryMultiplier(state: BreachState, weapon: keyof BreachState['weaponMasteries']): number {
    return state.weaponMasteries[weapon] ? C.weaponMasteries[weapon].damageMultiplier : 1;
  }
  private fistDamage(state: BreachState): number {
    const level = state.fistLevel;
    return (C.fistDamage + level * C.fistDamagePerLevel) / Math.max(1, level + 1);
  }
  private fistStoneDamage(state: BreachState): number {
    return this.fistDamage(state) * Math.max(1, state.fistLevel + 1);
  }
  currentMeleeDamage(state: BreachState): number {
    const meleePower = state.cycleUpgrades.cycle1 ? 1.5 : 1;
    const rangedPower = state.cycleUpgrades.cycle5 ? 1.5 : 1;
    if (state.weapon === 'bombarda') return (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * rangedPower;
    if (state.weapon === 'spear') return (C.spearDamage + state.spearLevel * C.spearDamagePerLevel) * this.masteryMultiplier(state, 'spear') * meleePower;
    if (state.weapon === 'pick') return (C.baseMeleeDamage + state.pickLevel) * this.masteryMultiplier(state, 'pick') * meleePower;
    return this.fistDamage(state) * (state.fistUniqueUpgrade ? 1.5 : 1) * this.masteryMultiplier(state, 'fist') * meleePower;
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
    if (weapon === 'fists' && fistComboAvailable(state) && state.combos.fists && state.comboCounts.fists % comboCadence(state, 'fists') === comboCadence(state, 'fists') - 1) interval *= 2;
    const charged = weapon === 'spear'
      ? state.challenge2Completed && state.combos.spear && (state.comboCounts.spear % comboCadence(state, 'spear') === comboCadence(state, 'spear') - 1 || state.spearDashCharge >= 1)
      : weapon === 'pick' && state.challenge2Completed && state.combos.pick && (state.comboCounts.pick % comboCadence(state, 'pick') === comboCadence(state, 'pick') - 1 || state.pickDashCharge >= 1);
    if (!state.cycleUpgrades.cycle6 && weapon === 'spear' && charged) interval *= C.spearComboWaitMultiplier;
    if (!state.cycleUpgrades.cycle6 && weapon === 'pick' && charged) interval *= 2;
    const clock = weapon === 'ranged' ? 'rangedClock' : 'attackClock';
    state[clock] += dt * speed / interval;
    const attacks = Math.floor(state[clock] + 1e-9);
    state[clock] = Math.max(0, state[clock] - attacks);
    return attacks;
  }
  interactionRange(state: BreachState): number {
    return C.meleeRange + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
  }
  spearWindup(state: BreachState, stones: readonly Stone[], hit: (stone: Stone, damage: number) => void): void {
    const damage = (C.spearDamage + state.spearLevel * C.spearDamagePerLevel) * this.masteryMultiplier(state, 'spear') * (state.cycleUpgrades.cycle1 ? 1.5 : 1);
    const radius = Math.min(C.spearRadiusMax + (state.cycleUpgrades.cycle3 ? 2 : 0), C.spearRadius + state.spearReachLevel * C.spearRadiusPerLevel);
    for (const stone of [...stones]) {
      const distance = Math.hypot(stone.x - state.x, stone.y - state.y);
      if (distance > radius) continue;
      const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
      const eased = t * t * (3 - 2 * t);
      hit(stone, damage * (1 - (1 - C.spearFalloffEdgeMultiplier) * eased));
    }
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
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * this.masteryMultiplier(state, 'emitter') * damageScale * (state.cycleUpgrades.cycle5 ? 1.5 : 1);
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
    const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * this.masteryMultiplier(state, 'emitter') * dt * speed * (state.cycleUpgrades.cycle5 ? 1.5 : 1);
    const radius = state.challengeArena && !CHALLENGE_RULES[state.challengeNumber].weaponSplash ? 0 : emitterBlastRadius(state.emitterAreaLevel) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
    for (const stone of [...stones]) {
      const d = Math.hypot(stone.x - this.beam.x, stone.y - this.beam.y);
      const multiplier = splashMultiplier(d, radius, state.emitterSpreadLevel);
      if (multiplier > 0) hit(stone, damage * multiplier);
    }
  }
  strike(state: BreachState, target: Pick<Stone, 'x' | 'y'>, stones: readonly Stone[], hit: (stone: Stone, damage: number, area?: boolean, splash?: boolean) => void, weapon: WeaponId = state.weapon, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null, pickDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const angle = Math.atan2(target.y - state.y, target.x - state.x);
    const bonus = 0;
    const combo = weapon !== 'ranged' && weapon !== 'bombarda' && state.combos[weapon] && (weapon === 'fists' ? fistComboAvailable(state) : state.challenge2Completed);
    const comboCount = combo ? ++state.comboCounts[weapon as 'fists' | 'pick' | 'spear'] : 0;
    const chargedDash = weapon === 'pick' ? state.pickDashCharge >= 1 : weapon === 'spear' && state.spearDashCharge >= 1;
    const special = combo && (comboCount % comboCadence(state, weapon as 'fists' | 'pick' | 'spear') === 0 || chargedDash);
    const suppressSplash = state.challengeArena && !CHALLENGE_RULES[state.challengeNumber].weaponSplash && !special;
    this.animations = this.animations.filter(effect => (effect.weapon === 'ranged') !== (weapon === 'ranged'));
    this.animations.push({ weapon, angle, x: target.x, y: target.y, remaining: special ? C.chargedAttackSeconds : C.animationSeconds, charged: special,
      ...(weapon === 'spear' && spearDashPath ? { dashFromX: spearDashPath.fromX, dashFromY: spearDashPath.fromY, dashToX: spearDashPath.toX, dashToY: spearDashPath.toY } : {}) });
    if (special && weapon === 'pick') state.pickDashCharge = 0;
    if (special && weapon === 'spear') state.spearDashCharge = 0;
    if (weapon === 'fists') {
      const fistDamageBonus = state.fistUniqueUpgrade ? 1.5 : 1;
      if (special) {
        const radius = fistComboRadius(state) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
        for (const stone of [...stones]) {
          const distance = Math.hypot(stone.x - state.x, stone.y - state.y);
          if (distance <= radius) hit(stone, (this.fistStoneDamage(state) + bonus) * fistDamageBonus * this.masteryMultiplier(state, 'fist') * (state.cycleUpgrades.cycle1 ? 1.5 : 1) * fistComboDamageMultiplier(distance, radius), true, true);
        }
        return;
      }
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) {
        const multiplier = stone.hp <= stone.maxHp / 2 ? 1 + state.fistFinisherLevel * C.fistFinisherBonus : 1;
        hit(stone, (this.fistStoneDamage(state) + bonus) * fistDamageBonus * this.masteryMultiplier(state, 'fist') * (state.cycleUpgrades.cycle1 ? 1.5 : 1) * multiplier);
      }
      return;
    }
    if (weapon === 'ranged') {
      if (state.rangedWeapon === 'needle') {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        const damage = (C.needleDamage + state.needleLevel * C.needleDamagePerLevel) * this.masteryMultiplier(state, 'needle') * (state.cycleUpgrades.cycle5 ? 1.5 : 1);
        if (stone) hit(stone, damage);
        const next = stones.find(item => item.x === target.x && item.y === target.y - 1);
        if (next && state.needlePierceLevel > 0) hit(next, damage * Math.min(1, state.needlePierceLevel * C.needlePierceBonus));
        return;
      }
      const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel + bonus) * this.masteryMultiplier(state, 'emitter') * (state.cycleUpgrades.cycle5 ? 1.5 : 1);
      if (suppressSplash) {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        if (stone) hit(stone, damage);
        return;
      }
      for (const stone of [...stones]) {
        const distance = Math.hypot(stone.x - target.x, stone.y - target.y);
        const radius = emitterBlastRadius(state.emitterAreaLevel) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
        const multiplier = splashMultiplier(distance, radius, state.emitterSpreadLevel);
        if (multiplier > 0) hit(stone, damage * multiplier, true, true);
      }
      return;
    }
    if (weapon === 'bombarda') {
      const damage = (C.rangedDamage + state.rangedLevel * C.rangedDamagePerLevel) * (state.spectraUpgrades.twin ? 1.35 : 1) * (state.cycleUpgrades.cycle5 ? 1.5 : 1);
      const radius = 2 + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0);
      if (suppressSplash) {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        if (stone) hit(stone, damage);
        return;
      }
      for (const stone of [...stones]) {
        const distance = Math.hypot(stone.x - target.x, stone.y - target.y);
        const factor = splashMultiplier(distance, radius, 0);
        if (factor > 0) hit(stone, damage * factor, true, true);
      }
      return;
    }
    if (weapon === 'spear') {
      const damage = (C.spearDamage + state.spearLevel * C.spearDamagePerLevel + bonus) * this.masteryMultiplier(state, 'spear') * (state.cycleUpgrades.cycle1 ? 1.5 : 1);
      if (suppressSplash) {
        const stone = stones.find(item => item.x === target.x && item.y === target.y);
        if (stone) hit(stone, damage, false, true);
        return;
      }
      const radius = Math.min(C.spearRadiusMax + (state.cycleUpgrades.cycle3 ? 2 : 0) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0), C.spearRadius + state.spearReachLevel * C.spearRadiusPerLevel + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0));
      const hitFalloff = (distance: number) => {
        const t = Math.max(0, Math.min(1, distance / Math.max(1, radius)));
        const eased = t * t * (3 - 2 * t);
        return 1 - (1 - C.spearFalloffEdgeMultiplier) * eased;
      };
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
            hit(stone, damage * hitFalloff(across), true, true);
            hitStones.add(stone);
          }
        }
      }
      for (const stone of [...stones]) {
        const distance = Math.hypot(stone.x - state.x, stone.y - state.y);
        if (!hitStones.has(stone) && distance <= radius) hit(stone, damage * hitFalloff(distance), true, true);
      }
      return;
    }
    const basePickDamage = (C.baseMeleeDamage + state.pickLevel + bonus) * this.masteryMultiplier(state, 'pick') * (state.cycleUpgrades.cycle1 ? 1.5 : 1);
    const damage = basePickDamage * (special ? 3 : 1);
    state.pickDash = special;
    const threshold = Math.cos(C.pickArcDegrees * Math.PI / 360);
    const fx = Math.cos(angle), fy = Math.sin(angle);
    if (suppressSplash) {
      const stone = stones.find(item => item.x === target.x && item.y === target.y);
      if (stone) hit(stone, damage, false, true);
      return;
    }
    if (special && state.pickInfinityEnchant && pickDashPath) {
      const radius = Math.min(C.pickRadiusMax + (state.cycleUpgrades.cycle3 ? 2 : 0), C.pickRadius + state.pickReachLevel * C.pickRadiusPerLevel) + C.pickBlastBonusRadius;
      for (const center of [{ x: pickDashPath.fromX, y: pickDashPath.fromY }, { x: pickDashPath.toX, y: pickDashPath.toY }]) {
        for (const stone of [...stones]) {
          const distance = Math.hypot(stone.x - center.x, stone.y - center.y);
          if (distance > radius) continue;
          const falloff = Math.max(0, 1 - distance / Math.max(1, radius)) ** C.pickBlastFalloffExponent;
          const halfDurability = Math.min(stone.hp * 0.5, basePickDamage * 2);
          hit(stone, halfDurability * falloff, true, true);
        }
      }
      return;
    }
    for (const stone of [...stones]) {
      const dx = stone.x - state.x, dy = stone.y - state.y;
      const distance = Math.hypot(dx, dy);
      const regularRadius = Math.min(C.pickRadiusMax + (state.cycleUpgrades.cycle3 ? 2 : 0) + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0), C.pickRadius + state.pickReachLevel * C.pickRadiusPerLevel + (state.challengeArena && state.challengeNumber === 4 ? state.challenge4RangeBonus : 0));
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
    const pickSize = tile * (3.2 + 0.5 * state.pickLevel + 0.5 * state.pickReachLevel);
    const spearLength = tile * (4.2 + 0.5 * state.spearLevel + 0.5 * state.spearReachLevel);
    if (state.weapon === 'pick') pickSprite.setPosition(x, y).setDisplaySize(pickSize, pickSize).setRotation(pickAngle + Math.PI / 4);
    spearSprite.setVisible(state.weapon === 'spear');
    if (state.weapon === 'spear' && !spearEffect?.charged) {
      const spin = spearEffect ? Math.max(0, Math.min(1, 1 - (spearEffect.remaining - visual.offset) / C.animationSeconds)) * Math.PI * 4 : 0;
      spearSprite.setPosition(x, y).setDisplaySize(spearLength, spearLength * 0.29).setRotation(spin + Math.PI / 4);
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
      } else {
        const direction = effect.angle - Math.PI * 0.8 + progress * Math.PI * 1.6;
        const reach = tile * (1.05 + progress * 0.25);
        g.lineStyle(Math.max(2, tile * 0.1), 0xffc16c, 0.8 * (1 - progress * 0.4));
        g.lineBetween(x, y, x + Math.cos(direction) * reach, y + Math.sin(direction) * reach);
        g.strokeCircle(px(effect.x), py(effect.y), tile * (0.16 + 0.3 * (1 - progress)));
      }
      continue;
    }
    if (effect.weapon === 'spear') {
      if (effect.charged) {
        const fromX = effect.dashFromX ?? visual.x, fromY = effect.dashFromY ?? visual.y;
        const toX = effect.dashToX ?? effect.x, toY = effect.dashToY ?? effect.y;
        const sourceX = px(fromX), sourceY = py(fromY), landingX = px(toX), landingY = py(toY);
        const flightAngle = Math.atan2(landingY - sourceY, landingX - sourceX) + Math.PI / 4;
        if (progress < 0.22) {
          const spin = progress / 0.22;
          spearSprite.setVisible(true).setPosition(sourceX, sourceY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(spin * Math.PI * 8 + Math.PI / 4);
          g.lineStyle(Math.max(2, tile * 0.08), 0x9d78e8, 0.48 * spin);
          g.strokeCircle(sourceX, sourceY, tile * (0.45 + spin * 1.15));
        } else if (progress < 0.68) {
          const flight = Math.max(0, Math.min(1, (progress - 0.22) / 0.46));
          const easeFlight = flight * flight * (3 - 2 * flight);
          const spearX = sourceX + (landingX - sourceX) * easeFlight;
          const spearY = sourceY + (landingY - sourceY) * easeFlight;
          spearSprite.setVisible(true).setPosition(spearX, spearY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(flightAngle);
          g.lineStyle(Math.max(2, tile * 0.13), 0x9df4ec, 0.65 * (1 - flight));
          g.lineBetween(sourceX, sourceY, spearX, spearY);
        } else {
          const impact = Math.max(0, Math.min(1, (progress - 0.68) / 0.32));
          const targetX = px(effect.x), targetY = py(effect.y);
          spearSprite.setVisible(true).setPosition(landingX, landingY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(flightAngle);
          g.fillStyle(0x9df4ec, 0.18 * (1 - impact));
          g.fillCircle(landingX, landingY, tile * (0.35 + impact * 0.8));
          g.lineStyle(Math.max(2, tile * 0.14), 0x8df4e6, 0.8 * (1 - impact));
          g.strokeCircle(targetX, targetY, tile * (0.45 + impact * 1.25));
          g.lineStyle(Math.max(1, tile * 0.07), 0xd1a6ff, 0.7 * (1 - impact));
          g.strokeCircle(landingX, landingY, tile * (0.25 + impact * 0.55));
        }
      } else {
        const rotation = progress * Math.PI * 4;
        const radius = tile * 1.65;
        g.lineStyle(Math.max(2, tile * 0.07), 0x75d9cf, 0.3);
        g.strokeCircle(x, y, radius);
        const impactRadius = tile * (0.25 + progress * 0.65);
        g.lineStyle(Math.max(2, tile * 0.1), 0x83eee1, (1 - progress) * 0.8);
        g.strokeCircle(px(effect.x), py(effect.y), impactRadius);
        spearSprite.setVisible(true).setPosition(x, y).setDisplaySize(spearLength, spearLength * 0.29).setRotation(rotation + Math.PI / 4);
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

