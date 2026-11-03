import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, RangedWeaponId, Stone, StoneKind, WeaponId } from './breachTypes';
import { NearestStoneMovement } from './movement';
import { Weapons } from './weapons';
import { stoneNoise } from './stoneNoise';

const SAVE_KEY = 'pioneer-breach-v1';

/** Удаляет только сохранение текущего прототипа. */
export function clearBreachSave(): boolean {
  try { localStorage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
type Upgrade = 'pick' | 'auto' | 'penetration' | 'melee' | 'pickDamage' | 'rangedDamage' | 'needleDamage' | 'fistFinisher' | 'pickReach' | 'needlePierce' | 'emitterSpread' | 'emitterArea' | 'beamSpeed' | 'click' | 'speed' | 'movement' | 'ranged' | 'needle' | 'needleAlt' | 'artifact' | 'expansion';

export function specialCrystalCost(upgrade: string, level: number): number {
  return ['fistFinisher', 'pickReach', 'needlePierce', 'emitterSpread', 'emitterArea', 'beamSpeed'].includes(upgrade) ? 1 + Math.floor(level / 2) : 0;
}

function stoneMaxHp(kind: StoneKind, block: number): number {
  return (kind === 'hard' ? C.hardStoneHp : kind === 'elemental' ? C.elementalStoneHp : 3) + Math.floor(block * C.stoneHpPerBlock);
}

function freshState(): BreachState {
  return {
    version: 1, balanceVersion: 2, paused: false, savedAt: Date.now(), tutorial: 'click', block: 0, furthestBlock: 0, size: C.blockSize,
    stones: [], x: Math.floor(C.blockSize / 2), y: C.blockSize, target: null, shot: null,
    ore: 0, crystals: 0, breakthrough: 0, completions: 0, expansion: 0, auto: false, pickUnlocked: false, repeatablesUnlocked: false, attackClock: 0, penetration: 0,
    meleeLevel: 0, fistLevel: 0, pickLevel: 0, rangedLevel: 0, needleLevel: 0, rangedWeapon: 'needle', needleUnlocked: false,
    fistFinisherLevel: 0, pickReachLevel: 0, needlePierceLevel: 0, emitterSpreadLevel: 0, emitterAreaLevel: 0, beamSpeedLevel: 0,
    clickLevel: 0, speedLevel: 0, movementLevel: 0, weapon: 'fists', rangedUnlocked: false,
    artifactUnlocked: false, artifactClock: 0, rangedClock: 0, boundary: null, reagent: 0, reagentClock: 0,
    needleAltUnlocked: false, needleAltClock: 0, projectiles: [], charges: 0, buffRemaining: 0, message: '',
  };
}

/** До Break Infinity: состояние и правила попытки, отдельно от её отображения. */
export class PreInfinityGame {
  readonly state: BreachState;
  private readonly movement = new NearestStoneMovement();
  readonly weapons = new Weapons();
  private cells = new Map<string, Stone>();
  private blocks: Stone[][] = [];
  resetEffect: { stones: Stone[]; x: number; y: number; size: number; elapsed: number } | null = null;

  constructor() {
    let saved: BreachState | undefined;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BreachState;
        if (parsed.version === 1 && Array.isArray(parsed.stones)) saved = parsed;
      }
    } catch { /* Хранилище может быть недоступно. */ }
    this.state = saved ?? freshState();
    if (saved) {
      if (saved.balanceVersion !== 2) {
        for (const stone of saved.stones) {
          const fraction = stone.maxHp > 0 ? Math.max(0, Math.min(1, stone.hp / stone.maxHp)) : 1;
          stone.maxHp = stoneMaxHp(stone.kind, stone.block);
          stone.hp = stone.maxHp * fraction;
        }
        saved.balanceVersion = 2;
      }
      saved.pickUnlocked ??= saved.auto || saved.weapon === 'pick';
      saved.repeatablesUnlocked = !!saved.repeatablesUnlocked || saved.furthestBlock > 0 || saved.stones.filter(stone => stone.block === 0).length <= saved.size * saved.size * (1 - C.repeatableUnlockFraction);
      saved.attackClock ??= 0;
      saved.fistLevel ??= saved.meleeLevel;
      saved.pickLevel ??= saved.meleeLevel;
      saved.needleLevel ??= 0;
      saved.fistFinisherLevel ??= 0;
      saved.pickReachLevel ??= 0;
      saved.needlePierceLevel ??= 0;
      saved.emitterSpreadLevel ??= 0;
      saved.emitterAreaLevel ??= 0;
      saved.beamSpeedLevel ??= 0;
      saved.movementLevel ??= 0;
      saved.needleAltUnlocked ??= false;
      saved.needleAltClock ??= 0;
      saved.projectiles ??= [];
      saved.needleUnlocked ??= false;
      saved.rangedWeapon ??= 'emitter';
      if (saved.weapon === 'ranged') { saved.weapon = saved.pickUnlocked ? 'pick' : 'fists'; saved.attackClock = 0; }
      // Previous saves stored this clock in seconds; start the independent weapon rhythm fresh.
      if (!Number.isFinite(saved.rangedClock) || saved.rangedClock < 0 || saved.rangedClock >= 1) saved.rangedClock = 0;
    }
    if (saved && saved.size !== C.blockSize + saved.expansion) {
      // Старый размер карты несовместим с новой сеткой; постоянный прогресс сохраняется.
      this.state.tutorial = saved.tutorial === 'done' ? 'done' : saved.penetration ? 'third' : saved.auto ? 'second' : 'click';
      this.state.paused = false;
      this.createMap();
    } else if (saved) {
      this.rebuildIndex();
      const offline = saved.paused ? 0 : Math.min(C.offlineLimitSeconds, Math.max(0, (Date.now() - saved.savedAt) / 1000));
      this.state.paused = false;
      this.advance(offline);
    } else {
      this.createMap();
    }
  }

  private globalY(stone: Pick<Stone, 'block' | 'y'>): number {
    return stone.block * this.state.size + this.state.size - 1 - stone.y;
  }

  private key(x: number, y: number): string { return `${x}:${y}`; }

  private rebuildIndex(): void {
    this.cells.clear();
    this.blocks = Array.from({ length: C.blockCount }, () => []);
    for (const stone of this.state.stones) {
      this.cells.set(this.key(stone.x, this.globalY(stone)), stone);
      this.blocks[stone.block].push(stone);
    }
    for (const stone of this.state.stones) {
      stone.neighbors = 0;
      const gy = this.globalY(stone);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if ((dx || dy) && this.cells.has(this.key(stone.x + dx, gy + dy))) stone.neighbors++;
      }
    }
  }

  currentStones(): readonly Stone[] { return this.blocks[this.state.block] ?? []; }

  get challenge1Unlocked(): boolean { return this.state.furthestBlock >= C.challenge1UnlockBlock; }

  private createMap(): void {
    const s = this.state;
    s.size = C.blockSize + s.expansion;
    s.block = 0;
    s.x = Math.floor(s.size / 2);
    s.y = s.size;
    s.target = null;
    s.shot = null;
    s.projectiles = [];
    s.stones = [];
    // Все квадраты — одна непрерывная прямоугольная карта в мировых координатах.
    for (let worldY = 0; worldY < C.blockCount * s.size; worldY++) {
      const block = Math.floor(worldY / s.size);
      const y = s.size - 1 - (worldY % s.size);
      for (let x = 0; x < s.size; x++) {
        let kind: StoneKind = 'stone';
        if (s.tutorial !== 'done' && block === 2) kind = 'hard';
        else {
          const nx = (x + C.mineralNoiseOffsetX) / C.mineralNoiseScale;
          const ny = (worldY + C.mineralNoiseOffsetY) / C.mineralNoiseScale;
          if (block >= C.elementalMineralStartBlock && stoneNoise(nx, ny, C.elementalMineralSeed) > C.elementalMineralThreshold) kind = 'elemental';
          else if (block >= C.hardMineralStartBlock && stoneNoise(nx, ny, C.hardMineralSeed) > C.hardMineralThreshold) kind = 'hard';
        }
        const hp = stoneMaxHp(kind, block);
        s.stones.push({ block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
      }
    }
    s.boundary = s.tutorial === 'done' ? C.blockCount * s.size + C.boundaryHeadStart : null;
    this.rebuildIndex();
  }

  private destroy(stone: Stone): void {
    const s = this.state;
    const gy = this.globalY(stone);
    if (!this.cells.delete(this.key(stone.x, gy))) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const neighbor = this.cells.get(this.key(stone.x + dx, gy + dy));
      if (neighbor) neighbor.neighbors--;
    }
    const index = s.stones.indexOf(stone);
    if (index !== -1) { s.stones[index] = s.stones[s.stones.length - 1]; s.stones.pop(); }
    const block = this.blocks[stone.block];
    const blockIndex = block.indexOf(stone);
    if (blockIndex !== -1) { block[blockIndex] = block[block.length - 1]; block.pop(); }
    s.ore += stone.kind === 'elemental' ? 4 : stone.kind === 'hard' ? 3 : 1;
    if (stone.block === s.block && this.currentStones().length <= s.size * s.size * (1 - C.repeatableUnlockFraction)) s.repeatablesUnlocked = true;
    if (s.tutorial === 'click') { s.ore += 2; s.tutorial = 'auto'; }
  }

  private hit(stone: Stone, amount: number, weaponHit = true): void {
    const s = this.state;
    if (!this.weapons.canHit(s, stone)) return;
    if (weaponHit && stone.kind === 'elemental') {
      if (s.buffRemaining <= 0 && s.charges > 0) { s.charges--; s.buffRemaining = C.elementalBuffSeconds; }
      amount *= s.buffRemaining > 0 ? 1 : 1 / C.elementalMultiplier;
    }
    stone.hp -= amount;
    if (stone.hp <= 0) this.destroy(stone);
  }

  click(): void {
    const s = this.state;
    if (s.paused || this.resetEffect || s.tutorial === 'auto') return;
    const target = this.movement.target(s, this.currentStones());
    if (target && Math.hypot(target.x - s.x, target.y - s.y) <= this.weapons.interactionRange(s)) {
      this.weapons.strike(s, target, this.currentStones(), (stone, damage) => this.hit(stone, damage), true);
    }
  }

  private launchNeedle(): boolean {
    const s = this.state;
    const damage = C.needleDamage + s.needleLevel * C.needleDamagePerLevel;
    let best: Stone | undefined;
    let remainingHp = 0;
    for (const stone of this.currentStones()) {
      if (!this.weapons.canHit(s, stone)) continue;
      const factor = stone.kind === 'elemental' && s.buffRemaining <= 0 && s.charges <= 0 ? 1 / C.elementalMultiplier : 1;
      let reserved = 0;
      for (const shot of s.projectiles) {
        if (shot.block !== stone.block || shot.x !== stone.x) continue;
        if (shot.y === stone.y) reserved += shot.damage * factor;
        else if (shot.y - 1 === stone.y) reserved += shot.pierce * factor;
      }
      const available = stone.hp - reserved;
      if (available <= 1e-8) continue;
      if (!best || stone.y > best.y || (stone.y === best.y && Math.abs(stone.x - s.x) < Math.abs(best.x - s.x))) {
        best = stone; remainingHp = available / factor;
      }
    }
    if (!best) return false;
    const shotDamage = Math.min(damage, remainingHp);
    const duration = Math.max(0.01, Math.hypot(best.x - s.x, best.y - s.y) / C.needleProjectileSpeed);
    s.projectiles.push({ block: s.block, x: best.x, y: best.y, fromX: s.x, fromY: s.y, duration, remaining: duration,
      damage: shotDamage, pierce: shotDamage * Math.min(1, s.needlePierceLevel * C.needlePierceBonus) });
    return true;
  }

  private advanceProjectiles(dt: number): void {
    const s = this.state;
    const pending = s.projectiles;
    s.projectiles = [];
    for (const shot of pending) {
      shot.remaining -= dt;
      if (shot.remaining > 0) { s.projectiles.push(shot); continue; }
      if (shot.block !== s.block) continue;
      const target = this.cells.get(this.key(shot.x, this.globalY({ block: shot.block, y: shot.y })));
      if (target) this.hit(target, shot.damage);
      const behind = shot.y > 0 ? this.cells.get(this.key(shot.x, this.globalY({ block: shot.block, y: shot.y - 1 }))) : undefined;
      if (behind && shot.pierce > 0) this.hit(behind, shot.pierce);
    }
  }

  private artifactTick(): void {
    const s = this.state;
    // Сначала рассчитываем все попадания, затем удаляем камни: порядок не влияет на изоляцию.
    const nearby = this.blocks.slice(Math.max(0, s.block - C.artifactBlockRadius), Math.min(C.blockCount, s.block + C.artifactBlockRadius + 1)).flat();
    const hits = nearby.map((stone) => ({ stone, damage: C.artifactDamage * (1 + C.artifactIsolationBonus * (1 - stone.neighbors / 24) ** 4) }));
    for (const { stone, damage } of hits) this.hit(stone, damage, false);
  }

  private resetOrdinaryResources(): void {
    const s = this.state;
    s.ore = 0;
    s.reagent = 0;
    s.reagentClock = 0;
    s.charges = 0;
    s.buffRemaining = 0;
  }

  private fail(): void {
    const s = this.state;
    this.resetEffect = { stones: this.currentStones().map(stone => ({ ...stone })), x: s.x, y: s.y, size: s.size, elapsed: 0 };
    this.weapons.stopBeam();
    this.resetOrdinaryResources();
    s.message = 'Граница настигла первопроходца. Улучшения и редкие ресурсы сохранены.';
    this.createMap();
  }

  private step(dt: number): void {
    const s = this.state;
    if (s.paused) return;
    if (this.resetEffect) {
      this.resetEffect.elapsed += dt;
      if (this.resetEffect.elapsed >= C.resetAnimationSeconds) this.resetEffect = null;
      return;
    }
    this.advanceProjectiles(dt);
    this.weapons.advanceAnimation(dt);
    if (s.buffRemaining > 0) s.buffRemaining = Math.max(0, s.buffRemaining - dt);
    if (s.tutorial === 'done') {
      s.reagentClock += dt;
      while (s.reagentClock >= C.reagentInterval) {
        s.reagentClock -= C.reagentInterval;
        s.reagent = Math.min(C.reagentCapacity, s.reagent + 1);
      }
    }
    if (s.artifactUnlocked) {
      s.artifactClock += dt;
      while (s.artifactClock >= C.artifactInterval) { s.artifactClock -= C.artifactInterval; this.artifactTick(); }
    }
    const target = this.movement.target(s, this.currentStones());
    s.target = target ? { x: target.x, y: target.y } : null;
    if (target) {
      if (s.tutorial === 'second' && s.block === 2 && target.kind === 'hard') s.tutorial = 'penetration';
      const distance = Math.hypot(target.x - s.x, target.y - s.y);
      const interactionRange = this.weapons.interactionRange(s);
      if (distance > interactionRange) this.movement.move(s, target.x, target.y, dt);
      if (s.auto && s.tutorial !== 'auto' && Math.hypot(target.x - s.x, target.y - s.y) <= interactionRange) {
        const attacks = this.weapons.tick(s, dt, 1 + s.speedLevel * C.attackSpeedPerLevel);
        for (let i = 0; i < attacks; i++) {
          const next = this.movement.target(s, this.currentStones());
          if (!next || Math.hypot(next.x - s.x, next.y - s.y) > interactionRange) break;
          this.weapons.strike(s, next, this.currentStones(), (stone, damage) => this.hit(stone, damage));
        }
      }
      if (s.rangedUnlocked || s.needleUnlocked) {
        const speed = 1 + s.speedLevel * C.attackSpeedPerLevel;
        if (s.rangedWeapon === 'emitter') {
          this.weapons.laser(s, this.currentStones(), dt, speed, (stone, damage) => this.hit(stone, damage));
        } else {
          this.weapons.stopBeam();
          const attacks = this.weapons.tick(s, dt, speed, 'ranged');
          for (let i = 0; i < attacks; i++) {
            if (!this.launchNeedle()) break;
          }
        }
      }
      if (s.needleAltUnlocked && s.needleUnlocked && s.rangedWeapon !== 'needle') {
        s.needleAltClock += dt * (1 + s.speedLevel * C.attackSpeedPerLevel) / (C.needleInterval * C.needleAltIntervalMultiplier);
        while (s.needleAltClock >= 1 - 1e-9) { s.needleAltClock = Math.max(0, s.needleAltClock - 1); if (!this.launchNeedle()) break; }
      }
    } else {
      this.weapons.stopBeam();
      this.movement.move(s, s.x, -0.5, dt);
      if (s.y <= -0.5) {
        s.block++;
        if (s.tutorial === 'third' && s.block >= 3) {
          s.tutorial = 'done';
          s.boundary = C.blockCount * s.size + C.boundaryHeadStart;
          s.message = 'Граница приближается. Продолжайте прорыв.';
        }
        s.furthestBlock = Math.max(s.furthestBlock, s.block);
        if (s.block % 5 === 0) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
        if (s.block >= C.blockCount) {
          s.breakthrough++;
          s.completions++;
          s.message = 'Карта пройдена! Получено очко прорывателя.';
          this.resetOrdinaryResources();
          this.createMap();
        } else {
          s.y = s.size - 0.5;
          s.target = null;
          s.projectiles = [];
        }
      }
    }
    if (s.boundary !== null) {
      s.boundary -= C.boundarySpeed * dt;
      const position = s.block * s.size + s.size - s.y;
      if (s.boundary <= position) this.fail();
    }
  }

  advance(seconds: number): void {
    if (this.state.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, C.offlineLimitSeconds);
    while (remaining > 0) {
      const dt = Math.min(remaining, C.simulationStep);
      this.step(dt);
      remaining -= dt;
    }
  }

  buy(upgrade: Upgrade): boolean {
    const s = this.state;
    if (s.paused) return false;
    if (upgrade === 'artifact') {
      if (s.artifactUnlocked || s.furthestBlock < C.artifactUnlockBlock || s.crystals < C.costs.artifact) return false;
      s.crystals -= C.costs.artifact; s.artifactUnlocked = true; return true;
    }
    if (upgrade === 'expansion') {
      if (!s.completions || s.expansion >= C.maxExpansion || s.breakthrough < C.costs.expansion) return false;
      s.breakthrough -= C.costs.expansion; s.expansion++; s.message = 'Расширение применится в следующей попытке.'; return true;
    }
    if (upgrade === 'auto') {
      if (s.auto || s.tutorial !== 'auto' || s.ore < C.costs.auto) return false;
      s.ore -= C.costs.auto; s.auto = true; s.tutorial = 'second'; return true;
    }
    if (upgrade === 'penetration') {
      if (s.penetration || !s.auto || s.ore < C.costs.penetration) return false;
      s.ore -= C.costs.penetration; s.penetration = 1; s.tutorial = 'third'; return true;
    }
    if (upgrade === 'pick') {
      if (!s.auto || s.pickUnlocked || s.ore < C.costs.pick) return false;
      s.ore -= C.costs.pick; s.pickUnlocked = true; s.weapon = 'pick'; s.attackClock = 0; return true;
    }
    if (upgrade === 'ranged') {
      if (!s.needleUnlocked || s.rangedUnlocked || s.ore < C.costs.ranged) return false;
      s.ore -= C.costs.ranged; s.rangedUnlocked = true; return true;
    }
    if (upgrade === 'needle') {
      if (!s.auto || s.needleUnlocked || s.ore < C.costs.needle) return false;
      s.ore -= C.costs.needle; s.needleUnlocked = true;
      if (!s.rangedUnlocked) s.rangedWeapon = 'needle';
      return true;
    }
    if (upgrade === 'needleAlt') {
      if (!s.needleUnlocked || s.needleAltUnlocked || s.furthestBlock < C.needleAltUnlockBlock || s.crystals < C.costs.needleAlt) return false;
      s.crystals -= C.costs.needleAlt; s.needleAltUnlocked = true; return true;
    }
    if (!s.repeatablesUnlocked) return false;
    const level = upgrade === 'melee' ? s.fistLevel : upgrade === 'pickDamage' ? s.pickLevel : upgrade === 'rangedDamage' ? s.rangedLevel : upgrade === 'needleDamage' ? s.needleLevel : upgrade === 'fistFinisher' ? s.fistFinisherLevel : upgrade === 'pickReach' ? s.pickReachLevel : upgrade === 'needlePierce' ? s.needlePierceLevel : upgrade === 'emitterSpread' ? s.emitterSpreadLevel : upgrade === 'emitterArea' ? s.emitterAreaLevel : upgrade === 'beamSpeed' ? s.beamSpeedLevel : upgrade === 'movement' ? s.movementLevel : upgrade === 'click' ? s.clickLevel : s.speedLevel;
    if (upgrade === 'pickDamage' && !s.pickUnlocked) return false;
    if (upgrade === 'pickReach' && !s.pickUnlocked) return false;
    if (upgrade === 'rangedDamage' && !s.rangedUnlocked) return false;
    if (upgrade === 'needleDamage' && !s.needleUnlocked) return false;
    if (upgrade === 'needlePierce' && (!s.needleUnlocked || level >= C.needlePierceMaxLevel)) return false;
    if (upgrade === 'emitterSpread' && (!s.rangedUnlocked || level >= C.emitterSpreadMaxLevel)) return false;
    if (upgrade === 'emitterArea' && (!s.rangedUnlocked || level >= C.emitterAreaMaxLevel)) return false;
    if (upgrade === 'beamSpeed' && !s.rangedUnlocked) return false;
    const cost = Math.ceil(8 * 1.55 ** level);
    const crystals = specialCrystalCost(upgrade, level);
    if (s.ore < cost || s.crystals < crystals) return false;
    s.ore -= cost; s.crystals -= crystals;
    if (upgrade === 'melee') s.fistLevel++;
    else if (upgrade === 'pickDamage') s.pickLevel++;
    else if (upgrade === 'rangedDamage') s.rangedLevel++;
    else if (upgrade === 'needleDamage') s.needleLevel++;
    else if (upgrade === 'fistFinisher') s.fistFinisherLevel++;
    else if (upgrade === 'pickReach') s.pickReachLevel++;
    else if (upgrade === 'needlePierce') s.needlePierceLevel++;
    else if (upgrade === 'emitterSpread') s.emitterSpreadLevel++;
    else if (upgrade === 'emitterArea') s.emitterAreaLevel++;
    else if (upgrade === 'beamSpeed') s.beamSpeedLevel++;
    else if (upgrade === 'movement') s.movementLevel++;
    else if (upgrade === 'click') s.clickLevel++;
    else s.speedLevel++;
    return true;
  }

  equip(weapon: WeaponId): void {
    if (!this.state.paused && (weapon === 'fists' || (weapon === 'pick' && this.state.pickUnlocked))) { this.state.weapon = weapon; this.state.attackClock = 0; }
  }

  equipRanged(weapon: RangedWeaponId): void {
    if (!this.state.paused && ((weapon === 'emitter' && this.state.rangedUnlocked) || (weapon === 'needle' && this.state.needleUnlocked))) {
      this.state.rangedWeapon = weapon;
      this.weapons.stopBeam();
      this.state.rangedClock = 0;
    }
  }

  collect(): void {
    const s = this.state;
    if (s.paused || s.tutorial !== 'done') return;
    s.charges += s.reagent;
    s.reagent = 0;
  }

  save(): void {
    this.state.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch { /* Хранилище недоступно. */ }
  }
}

export const breachGame = new PreInfinityGame();
