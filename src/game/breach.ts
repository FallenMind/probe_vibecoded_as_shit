import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, RangedWeaponId, Stone, StoneKind, WeaponId } from './breachTypes';
import { NearestStoneMovement } from './movement';
import { Weapons } from './weapons';
import { stoneNoise } from './stoneNoise';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, alchemyTickSeconds, freshAlchemyState } from './alchemy';
import type { AlchemyNode, AlchemyResource, AlchemySwitch, AlchemyUpgrade } from './alchemy';

const SAVE_KEY = 'pioneer-breach-v1';

/** Удаляет только сохранение текущего прототипа. */
export function clearBreachSave(): boolean {
  try { localStorage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
type Upgrade = 'pick' | 'spear' | 'spatialCompressor' | 'fistCombo' | 'fistComboRadius' | 'spearDamage' | 'spearReach' | 'spearSpeed' | 'spearMastery' | 'spearPierce' | 'spearEnchant' | 'auto' | 'penetration' | 'melee' | 'fistSpeed' | 'fistMastery' | 'pickDamage' | 'pickSpeed' | 'pickMastery' | 'rangedDamage' | 'needleDamage' | 'needleSpeed' | 'needleMastery' | 'emitterSpeed' | 'emitterMastery' | 'fistFinisher' | 'pickReach' | 'needlePierce' | 'emitterSpread' | 'emitterArea' | 'beamSpeed' | 'movement' | 'ranged' | 'needle' | 'needleAlt' | 'artifact' | 'expansion';

const MASTERY_UPGRADE_WEAPON = {
  fistMastery: 'fist', pickMastery: 'pick', spearMastery: 'spear',
  needleMastery: 'needle', emitterMastery: 'emitter',
} as const;

export function upgradeOreCost(upgrade: string, level: number): number {
  if (upgrade === 'fistComboRadius') return C.comboFistRadiusOreCosts[level + 1] ?? 0;
  if (upgrade === 'spatialCompressor') return C.spatialCompressorCost;
  const masteryWeapon = MASTERY_UPGRADE_WEAPON[upgrade as keyof typeof MASTERY_UPGRADE_WEAPON];
  if (masteryWeapon) return C.weaponMasteries[masteryWeapon].cost;
  const speedBase = upgrade === 'fistSpeed' ? C.fistSpeedBaseCost : upgrade === 'pickSpeed' ? C.pickSpeedBaseCost : upgrade === 'spearSpeed' ? C.spearSpeedBaseCost : upgrade === 'needleSpeed' ? C.needleSpeedBaseCost : upgrade === 'emitterSpeed' ? C.emitterSpeedBaseCost : 0;
  if (speedBase) return Math.ceil(speedBase * C.weaponUpgradeCostGrowth ** level);
  const pickBase = upgrade === 'pickDamage' ? C.pickDamageBaseCost : upgrade === 'pickReach' ? C.pickReachBaseCost : 0;
  const spearBase = upgrade === 'spearDamage' ? C.spearDamageBaseCost : upgrade === 'spearReach' ? C.spearReachBaseCost : 0;
  const base = pickBase || spearBase || 8;
  const itemUpgrade = ['melee', 'fistComboRadius', 'pickDamage', 'pickReach', 'spearDamage', 'spearReach', 'rangedDamage', 'needleDamage', 'fistFinisher', 'needlePierce', 'emitterSpread', 'beamSpeed'].includes(upgrade);
  const growth = itemUpgrade ? C.weaponUpgradeCostGrowth : C.generalUpgradeCostGrowth;
  return Math.ceil(base * growth ** level);
}

export function specialCrystalCost(upgrade: string, level: number): number {
  if (upgrade === 'fistComboRadius') return C.comboFistRadiusCrystalCosts[level + 1] ?? 0;
  return ['fistFinisher', 'needlePierce', 'emitterSpread', 'emitterArea', 'beamSpeed'].includes(upgrade) ? 1 + Math.floor(level / 2) : 0;
}

function stoneMaxHp(kind: StoneKind, block: number): number {
  let hp = kind === 'hard' ? C.hardStoneHp : kind === 'elemental' ? C.elementalStoneHp : 3;
  for (let step = 0; step < Math.floor(block / 2); step++) hp += C.stoneHpLinearPerTwoBlocks + hp * C.stoneHpPercentPerTwoBlocks;
  return hp;
}

function oreReward(kind: StoneKind, block: number): number {
  let reward = kind === 'elemental' ? 4 : kind === 'hard' ? 3 : 1;
  for (let step = 0; step < Math.floor(block / 2); step++) reward += C.oreRewardLinearPerTwoBlocks + reward * C.oreRewardPercentPerTwoBlocks;
  return Math.floor(reward);
}

function freshState(): BreachState {
  return {
    version: 1, balanceVersion: 4, alchemy: freshAlchemyState(), paused: false, savedAt: Date.now(), tutorial: 'click', block: 0, furthestBlock: 0, size: C.blockSize,
    stones: [], x: Math.floor(C.blockSize / 2), y: C.blockSize, target: null, shot: null,
    ore: 0, crystals: 0, breakthrough: 0, completions: 0, expansion: 0, auto: false, pickUnlocked: false, repeatablesUnlocked: false, attackClock: 0, penetration: 0,
    meleeLevel: 0, fistLevel: 0, pickLevel: 0, rangedLevel: 0, needleLevel: 0, rangedWeapon: 'needle', needleUnlocked: false,
    fistFinisherLevel: 0, pickReachLevel: 0, needlePierceLevel: 0, emitterSpreadLevel: 0, emitterAreaLevel: 0, beamSpeedLevel: 0,
    fistSpeedLevel: 0, pickSpeedLevel: 0, spearSpeedLevel: 0, needleSpeedLevel: 0, emitterSpeedLevel: 0,
    weaponMasteries: { fist: false, pick: false, spear: false, needle: false, emitter: false },
    clickLevel: 0, speedLevel: 0, movementLevel: 0, weapon: 'fists', rangedUnlocked: false,
    artifactUnlocked: false, artifactClock: 0, rangedClock: 0, boundary: null, reagent: 0, reagentClock: 0,
    needleAltUnlocked: false, needleAltClock: 0, needleRecheckClock: 0, projectiles: [], needleFollowUps: [], charges: 0, buffRemaining: 0, message: '',
    spearUnlocked: false, spearLevel: 0, spearReachLevel: 0, spearPierce: false, spearEnchant: false, challenge1Completed: false,
    fistComboUnlocked: false, fistComboRadiusLevel: 0, fistComboRadiusRewardedLevels: 0, combos: { fists: false, pick: false, spear: false }, comboCounts: { fists: 0, pick: 0, spear: 0 }, pickDash: false, pickDashCharge: 0, spearDashCharge: 0, clickBuffer: 0, alchemyHelpSeen: false, seenFeatures: {},
    clickHeat: 0, clickWindowCount: 0, clickWindowTime: 0, challengeArena: false, challengeWon: false, challengeFailed: false, challengeRemaining: 0, challengeReturnStones: null, challengeReturnSize: null, challengeReturnBlock: null, challengeReturnX: null, challengeReturnY: null,
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
    let migratedFistComboRadius = false;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BreachState;
        if (parsed.version === 1 && Array.isArray(parsed.stones)) saved = parsed;
      }
    } catch { /* Хранилище может быть недоступно. */ }
    this.state = saved ?? freshState();
    if (saved) {
      const defaults = freshState();
      for (const key of ['spearUnlocked', 'spearLevel', 'spearReachLevel', 'spearPierce', 'spearEnchant', 'challenge1Completed', 'fistComboUnlocked', 'fistComboRadiusLevel', 'pickDash', 'pickDashCharge', 'spearDashCharge', 'clickBuffer', 'clickHeat', 'clickWindowCount', 'clickWindowTime', 'challengeArena', 'challengeWon', 'challengeFailed', 'challengeRemaining', 'challengeReturnStones', 'challengeReturnSize', 'challengeReturnBlock', 'challengeReturnX', 'challengeReturnY', 'alchemyHelpSeen'] as const) {
        if (saved[key] === undefined) Object.assign(saved, { [key]: defaults[key] });
      }
      saved.combos = { ...defaults.combos, ...saved.combos };
      saved.comboCounts = { ...defaults.comboCounts, ...saved.comboCounts };
      if (saved.fistComboRadiusRewardedLevels === undefined) {
        const legacyEmitter = saved as BreachState & { emitterAreaRewardedLevels?: number };
        const legacyFistLevel = saved.fistComboUnlocked
          ? Math.min(C.comboFistRadiusMaxLevel, Math.max(1, saved.fistComboRadiusLevel + 1))
          : 0;
        const legacyEmitterLevel = Math.max(0, Math.min(C.comboFistRadiusMaxLevel, saved.emitterAreaLevel ?? 0));
        saved.fistComboRadiusLevel = Math.max(legacyFistLevel, legacyEmitterLevel);
        saved.fistComboRadiusRewardedLevels = Math.min(3, saved.fistComboRadiusLevel);
        const alreadyGranted = Math.min(saved.fistComboRadiusRewardedLevels, legacyEmitter.emitterAreaRewardedLevels ?? 0);
        saved.crystals += saved.fistComboRadiusRewardedLevels - alreadyGranted;
        saved.emitterAreaLevel = 0;
        migratedFistComboRadius = saved.fistComboRadiusLevel > 0 || legacyEmitterLevel > 0;
      } else {
        saved.fistComboRadiusLevel = Math.max(0, Math.min(C.comboFistRadiusMaxLevel, saved.fistComboRadiusLevel));
      }
      saved.seenFeatures ??= {};
      saved.alchemy = { ...freshAlchemyState(), ...saved.alchemy };
      saved.alchemy.airProductionEnabled ??= false;
      saved.alchemy.elementalizationEnabled ??= false;
      saved.alchemy.airProductionClock ??= 0;
      if (saved.balanceVersion !== 4) {
        for (const stone of saved.stones) {
          const fraction = stone.maxHp > 0 ? Math.max(0, Math.min(1, stone.hp / stone.maxHp)) : 1;
          const level = saved.challengeArena ? C.blockCount - 1 : stone.block;
          const challengeMultiplier = saved.challengeArena ? C.challengeStoneMultiplier : 1;
          stone.maxHp = stoneMaxHp(stone.kind, level) * challengeMultiplier;
          stone.hp = stone.maxHp * fraction;
        }
        for (const stone of saved.challengeReturnStones ?? []) {
          const fraction = stone.maxHp > 0 ? Math.max(0, Math.min(1, stone.hp / stone.maxHp)) : 1;
          stone.maxHp = stoneMaxHp(stone.kind, stone.block);
          stone.hp = stone.maxHp * fraction;
        }
        saved.balanceVersion = 4;
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
      saved.emitterAreaLevel = Math.min(C.emitterAreaMaxLevel, saved.emitterAreaLevel);
      saved.beamSpeedLevel ??= 0;
      saved.movementLevel ??= 0;
      saved.needleAltUnlocked ??= false;
      saved.needleAltClock ??= 0;
      saved.needleRecheckClock ??= 0;
      saved.fistSpeedLevel ??= saved.speedLevel ?? 0;
      saved.pickSpeedLevel ??= saved.speedLevel ?? 0;
      saved.spearSpeedLevel ??= saved.speedLevel ?? 0;
      saved.needleSpeedLevel ??= saved.speedLevel ?? 0;
      saved.emitterSpeedLevel ??= saved.speedLevel ?? 0;
      saved.weaponMasteries = Object.assign({}, defaults.weaponMasteries, saved.weaponMasteries);
      saved.projectiles ??= [];
      saved.needleFollowUps ??= [];
      saved.needleUnlocked ??= false;
      saved.rangedWeapon ??= 'emitter';
      if (saved.weapon === 'ranged') { saved.weapon = saved.pickUnlocked ? 'pick' : 'fists'; saved.attackClock = 0; }
      // Previous saves stored this clock in seconds; start the independent weapon rhythm fresh.
      if (!Number.isFinite(saved.rangedClock) || saved.rangedClock < 0 || saved.rangedClock >= 1) saved.rangedClock = 0;
    }
    if (saved && !saved.challengeArena && saved.size !== C.blockSize + saved.expansion) {
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
    if (migratedFistComboRadius) this.save();
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

  alchemyNodeUnlocked(node: AlchemyNode): boolean {
    if (node === 'earth') return this.state.furthestBlock >= A.earthUnlockBlock;
    if (node === 'water') return this.state.furthestBlock >= A.waterUnlockBlock;
    if (node === 'air') return this.state.challenge1Completed;
    // Испытания 1 и 4 пока нельзя пройти, поэтому Огонь и Воздух закрыты.
    return false;
  }

  toggleAlchemy(name: AlchemySwitch): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect) return false;
    if (name === 'waterEnabled' ? !this.alchemyNodeUnlocked('water') : name === 'airProductionEnabled' || name === 'elementalizationEnabled' ? !this.alchemyNodeUnlocked('air') : !this.alchemyNodeUnlocked('earth')) return false;
    if (name === 'pickEnabled' && !s.pickUnlocked) return false;
    s.alchemy[name] = !s.alchemy[name];
    return true;
  }

  canBuyAlchemyUpgrade(upgrade: AlchemyUpgrade): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect || s.alchemy.upgrades[upgrade.id] || !this.alchemyNodeUnlocked(upgrade.node)) return false;
    if (upgrade.minBlock !== undefined && s.furthestBlock < upgrade.minBlock) return false;
    if (upgrade.challenge !== undefined) return false;
    if (upgrade.requires?.some(id => !s.alchemy.upgrades[id])) return false;
    return (Object.entries(upgrade.cost) as [AlchemyResource, number][]).every(([resource, cost]) =>
      (resource === 'crystals' ? s.crystals : s.alchemy[resource]) >= cost);
  }

  buyAlchemyUpgrade(id: string): boolean {
    const upgrade = ALCHEMY_UPGRADES.find(item => item.id === id);
    if (!upgrade || !this.canBuyAlchemyUpgrade(upgrade)) return false;
    for (const [resource, cost] of Object.entries(upgrade.cost) as [AlchemyResource, number][]) {
      if (resource === 'crystals') this.state.crystals -= cost;
      else this.state.alchemy[resource] -= cost;
    }
    this.state.alchemy.upgrades[upgrade.id] = true;
    return true;
  }

  crystallizeWater(): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect || !this.alchemyNodeUnlocked('water') || s.alchemy.water < A.crystalExchange.water) return false;
    s.alchemy.water -= A.crystalExchange.water;
    s.crystals += A.crystalExchange.crystals;
    return true;
  }

  craftWater(): boolean {
    const s = this.state;
    const a = s.alchemy;
    const recipe = A.waterRecipe;
    const amount = Math.min(Math.max(1, Math.floor(a.earth * recipe.fraction)), Math.floor(a.earth), Math.floor(a.elementalStone / recipe.elementalPerWater), alchemyCapacity(a, 'water') - a.water);
    if (s.paused || this.resetEffect || !this.alchemyNodeUnlocked('water') || amount < 1) return false;
    a.earth -= amount;
    a.elementalStone -= amount * recipe.elementalPerWater;
    a.water += amount;
    return true;
  }

  private advanceAlchemy(dt: number): void {
    const a = this.state.alchemy;
    const earth = A.earthRecipe;
    if (a.earthEnabled && this.alchemyNodeUnlocked('earth') && a.stone >= 1 && a.earth < alchemyCapacity(a, 'earth')) {
      a.earthClock += dt;
      const seconds = alchemyTickSeconds(a, 'earth');
      while (a.earthClock + 1e-9 >= seconds && a.stone >= 1 && a.earth < alchemyCapacity(a, 'earth')) {
        a.earthClock = Math.max(0, a.earthClock - seconds);
        const amount = Math.min(Math.max(1, Math.floor(a.stone * earth.fraction)), a.stone, alchemyCapacity(a, 'earth') - a.earth);
        a.stone -= amount; a.earth += amount;
      }
      if (a.stone < 1 || a.earth >= alchemyCapacity(a, 'earth')) a.earthClock = 0;
    } else a.earthClock = 0;

    if (a.waterEnabled && this.alchemyNodeUnlocked('water') && a.earth >= 1 && a.elementalStone >= A.waterRecipe.elementalPerWater && a.water < alchemyCapacity(a, 'water')) {
      a.waterClock += dt;
      const seconds = alchemyTickSeconds(a, 'water');
      while (a.waterClock + 1e-9 >= seconds) {
        a.waterClock = Math.max(0, a.waterClock - seconds);
        if (!this.craftWater()) { a.waterClock = 0; break; }
      }
    } else a.waterClock = 0;

    if (a.airProductionEnabled && this.alchemyNodeUnlocked('air') && a.water >= A.airRecipe.waterPerAir && a.air < alchemyCapacity(a, 'air')) {
      a.airProductionClock += dt;
      while (a.airProductionClock + 1e-9 >= A.airRecipe.seconds && a.water >= A.airRecipe.waterPerAir && a.air < alchemyCapacity(a, 'air')) {
        a.airProductionClock = Math.max(0, a.airProductionClock - A.airRecipe.seconds);
        a.water -= A.airRecipe.waterPerAir;
        a.air = Math.min(alchemyCapacity(a, 'air'), a.air + 1);
      }
    } else a.airProductionClock = 0;
  }

  private createMap(): void {
    const s = this.state;
    s.size = C.blockSize + s.expansion;
    s.block = 0;
    s.x = Math.floor(s.size / 2);
    s.y = s.size;
    s.target = null;
    s.shot = null;
    s.projectiles = [];
    s.needleFollowUps = [];
    s.needleRecheckClock = 0;
    s.pickDash = false;
    s.clickBuffer = 0;
    s.comboCounts = { fists: 0, pick: 0, spear: 0 };
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
          const elementalRamp = Math.min(1, Math.max(0, (block - C.elementalMineralStartBlock) / (C.elementalMineralNormalBlock - C.elementalMineralStartBlock)));
          const elementalThreshold = C.elementalMineralRampStartThreshold + (C.elementalMineralThreshold - C.elementalMineralRampStartThreshold) * elementalRamp;
          if (block >= C.elementalMineralStartBlock && stoneNoise(nx, ny, C.elementalMineralSeed) > elementalThreshold) kind = 'elemental';
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
    if (!s.challengeArena) {
      const weight = A.stoneWeight[stone.kind];
      const elementalized = stone.kind !== 'elemental' && s.alchemy.elementalizationEnabled && s.alchemy.air > 0 && Math.random() < 0.5;
      s.alchemy.stone += weight - Number(elementalized);
      if (stone.kind === 'elemental') s.alchemy.elementalStone += 1;
      if (elementalized) s.alchemy.elementalStone += 1;
      if (stone.kind === 'elemental' && Math.random() < C.elementalCrystalDropChance) {
        s.crystals++;
        s.message = 'Элементальная руда принесла кристалл.';
      }
      s.ore += oreReward(stone.kind, stone.block);
      if (stone.block === s.block && this.currentStones().length <= s.size * s.size * (1 - C.repeatableUnlockFraction)) s.repeatablesUnlocked = true;
      if (s.tutorial === 'click') { s.ore += 2; s.tutorial = 'auto'; }
    }
    if (s.challengeArena && !s.stones.length && !s.challengeWon) {
      s.challengeWon = true; s.challengeFailed = false; s.challengeRemaining = 0; s.challenge1Completed = true;
      s.alchemy.air = Math.min(alchemyCapacity(s.alchemy, 'air'), s.alchemy.air + 10);
      s.message = 'Challenge 1 пройден. Воздух открыт.';
    }
  }

  private hit(stone: Stone, amount: number, weaponHit = true, earthHit = false, ignoreArmor = false, area = false, windPierce = false, splash = area): void {
    const s = this.state;
    if (!ignoreArmor && !this.weapons.canHit(s, stone)) return;
    const earthCost = A.pickEarthPerStone * A.stoneWeight[stone.kind];
    const empowered = earthHit && !area && s.alchemy.pickEnabled && this.alchemyNodeUnlocked('earth') && s.alchemy.earth >= earthCost;
    if (empowered) amount *= A.pickDamageMultiplier;
    if (stone.kind === 'hard' && splash && s.penetration <= 0) amount *= C.hardSplashDamageMultiplier;
    if (weaponHit && stone.kind === 'elemental') {
      amount *= empowered || windPierce ? 1 : 1 / C.elementalMultiplier;
    }
    stone.hp -= amount;
    if (stone.hp <= 0) {
      if (empowered) s.alchemy.earth -= earthCost;
      this.destroy(stone);
    }
  }

  private strike(target: Stone, manual = false, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const s = this.state;
    this.weapons.strike(s, target, this.currentStones(), (stone, damage, area, splash) => {
      const elementalPierce = s.weapon === 'spear' && s.spearEnchant && stone.kind === 'elemental';
      this.hit(stone, damage, true, s.weapon === 'pick' || s.weapon === 'fists', s.weapon === 'spear' && area && s.spearPierce && stone.kind !== 'elemental', area, elementalPierce, splash);
    }, manual, s.weapon, spearDashPath);
  }

  click(): void {
    const s = this.state;
    if (s.paused || this.resetEffect || s.tutorial === 'auto') return;
    s.clickBuffer = Math.min(C.clickBufferCapacity, s.clickBuffer + 1);
    s.clickWindowCount++;
    if (!s.auto) {
      const target = this.movement.target(s, this.currentStones());
      if (target && Math.hypot(target.x - s.x, target.y - s.y) <= this.weapons.interactionRange(s)) this.strike(target, true);
    } else {
      const target = this.movement.target(s, this.currentStones());
      if (target && Math.hypot(target.x - s.x, target.y - s.y) <= this.weapons.interactionRange(s)) {
        if (s.attackClock < 1 && s.clickBuffer >= 1) { s.clickBuffer -= 1; s.attackClock = 1; }
        if (s.attackClock >= 1) {
          this.strike(target, true);
          s.attackClock = 0;
        }
      }
    }
  }

  private spearDash(): { fromX: number; fromY: number; toX: number; toY: number } | null {
    const s = this.state;
    const stones = this.currentStones();
    let best: Stone | undefined; let score = -1;
    for (const stone of stones) {
      if (Math.hypot(stone.x - s.x, stone.y - s.y) > C.spearDashRange) continue;
      if (stone.neighbors > score) { best = stone; score = stone.neighbors; }
    }
    if (!best) return null;
    // Рывок заканчивается прямо в выбранной точке удара; добыча произойдёт атакой копья.
    this.weapons.dash(s.x, s.y, best.x, best.y);
    const path = { fromX: s.x, fromY: s.y, toX: best.x, toY: best.y };
    s.x = best.x; s.y = best.y;
    return path;
  }

  private pickDash(target: Stone): void {
    const s = this.state;
    const dx = target.x - s.x, dy = target.y - s.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      const dash = Math.min(C.pickDashRange, distance);
      const fromX = s.x, fromY = s.y;
      s.x += dx / distance * dash;
      s.y += dy / distance * dash;
      this.weapons.dash(fromX, fromY, s.x, s.y);
    }
    s.pickDash = true;
  }

  private launchNeedle(followTarget?: Stone): boolean {
    const s = this.state;
    const damage = C.needleDamage + s.needleLevel * C.needleDamagePerLevel;
    let best: Stone | undefined;
    let remainingHp = 0;
    const candidates: { stone: Stone; remaining: number }[] = [];
    for (const stone of this.currentStones()) {
      if (followTarget && stone !== followTarget) continue;
      if (!this.weapons.canHit(s, stone)) continue;
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
      const chosen = spread[Math.floor(Math.random() * spread.length)];
      best = chosen.stone; remainingHp = chosen.remaining;
    }
    const shotDamage = Math.min(damage, remainingHp);
    const duration = Math.max(0.01, Math.hypot(best.x - s.x, best.y - s.y) / C.needleProjectileSpeed);
    s.projectiles.push({ block: s.block, x: best.x, y: best.y, fromX: s.x, fromY: s.y, duration, remaining: duration,
      damage: shotDamage, pierce: shotDamage * Math.min(1, s.needlePierceLevel * C.needlePierceBonus), followUp: !!followTarget });
    return true;
  }

  private advanceProjectiles(dt: number): void {
    const s = this.state;
    const followUps = s.needleFollowUps;
    s.needleFollowUps = [];
    for (const follow of followUps) {
      follow.remaining -= dt;
      if (follow.remaining > 1e-9) { s.needleFollowUps.push(follow); continue; }
      if (follow.block !== s.block) continue;
      const survivor = this.cells.get(this.key(follow.x, this.globalY(follow)));
      if (survivor) this.launchNeedle(survivor);
    }
    const pending = s.projectiles;
    s.projectiles = [];
    for (const shot of pending) {
      shot.remaining -= dt;
      if (shot.remaining > 0) { s.projectiles.push(shot); continue; }
      if (shot.block !== s.block) continue;
      const target = this.cells.get(this.key(shot.x, this.globalY({ block: shot.block, y: shot.y })));
      if (target) this.hit(target, shot.damage);
      if (target && target.hp > 0 && !shot.followUp) s.needleFollowUps.push({ block: shot.block, x: shot.x, y: shot.y, remaining: Math.max(0, C.needleFollowUpDelay + shot.remaining) });
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
    Object.assign(s.alchemy, { stone: 0, elementalStone: 0, earth: 0, water: 0, air: 0, earthClock: 0, waterClock: 0 });
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
    if (s.challengeArena && s.challengeWon) return;
    if (s.challengeArena) {
      s.challengeRemaining = Math.max(0, s.challengeRemaining - dt);
      if (s.challengeRemaining <= 0) {
        s.challengeFailed = true;
        s.challengeWon = true;
        s.message = 'Время Challenge 1 вышло.';
        return;
      }
    }
    this.advanceAlchemy(dt);
    if (s.alchemy.elementalizationEnabled && s.alchemy.air > 0) s.alchemy.air = Math.max(0, s.alchemy.air - dt);
    this.advanceProjectiles(dt);
    this.weapons.advanceAnimation(dt);
    s.clickBuffer = Math.max(0, s.clickBuffer - (C.clickBufferDrain + s.clickBuffer * C.clickBufferDecay) * dt);
    s.clickWindowTime += dt;
    while (s.clickWindowTime >= 1) {
      if (s.clickWindowCount >= C.clickHeatClicksPerSecond) s.clickHeat = Math.min(C.clickHeatThreshold, s.clickHeat + 1);
      else s.clickHeat = Math.max(0, s.clickHeat - C.clickHeatDecayPerSecond);
      s.clickWindowCount = 0; s.clickWindowTime -= 1;
    }
    if (s.buffRemaining > 0) s.buffRemaining = Math.max(0, s.buffRemaining - dt);
    if (s.artifactUnlocked) {
      s.artifactClock += dt;
      while (s.artifactClock >= C.artifactInterval) { s.artifactClock -= C.artifactInterval; this.artifactTick(); }
    }
    const target = this.movement.target(s, this.currentStones());
    s.target = target ? { x: target.x, y: target.y } : null;
    const comboEnabled = ((s.weapon === 'pick' && s.combos.pick) || (s.weapon === 'spear' && s.combos.spear)) && s.challenge1Completed;
    const mining = !!target && Math.hypot(target.x - s.x, target.y - s.y) <= this.weapons.interactionRange(s);
    if (comboEnabled && !mining) {
      const clickSpeed = 1 + Math.min(1, s.clickBuffer / C.clickBufferCapacity) * C.clickMiningSpeedMaxBonus;
      const chargeSpeed = this.weapons.speedMultiplier(s, s.weapon) * clickSpeed;
      if (s.weapon === 'pick') s.pickDashCharge = Math.min(1, s.pickDashCharge + dt * chargeSpeed / C.pickDashChargeSeconds);
      else s.spearDashCharge = Math.min(1, s.spearDashCharge + dt * chargeSpeed / C.spearDashChargeSeconds);
    }
    if (target) {
      if (s.tutorial === 'second' && s.block === 2 && target.kind === 'hard') s.tutorial = 'penetration';
      const distance = Math.hypot(target.x - s.x, target.y - s.y);
      const interactionRange = this.weapons.interactionRange(s);
      if (distance > interactionRange) this.movement.move(s, target.x, target.y, dt);
      if (s.auto && s.tutorial !== 'auto' && Math.hypot(target.x - s.x, target.y - s.y) <= interactionRange) {
        const clickMiningSpeed = 1 + Math.min(1, s.clickBuffer / C.clickBufferCapacity) * C.clickMiningSpeedMaxBonus;
        const attacks = this.weapons.tick(s, dt, this.weapons.speedMultiplier(s, s.weapon) * clickMiningSpeed);
        for (let i = 0; i < attacks; i++) {
          const next = this.movement.target(s, this.currentStones());
          if (!next || Math.hypot(next.x - s.x, next.y - s.y) > interactionRange) break;
          const pickCombo = s.weapon === 'pick' && s.challenge1Completed && s.combos.pick && (s.comboCounts.pick % 3 === 2 || s.pickDashCharge >= 1);
          const spearCombo = s.weapon === 'spear' && s.challenge1Completed && s.combos.spear && (s.comboCounts.spear % 3 === 2 || s.spearDashCharge >= 1);
          if (pickCombo) this.pickDash(next);
          const spearDashPath = spearCombo ? this.spearDash() : null;
          const impact = spearCombo ? this.movement.target(s, this.currentStones()) : next;
          if (!impact) continue;
          this.strike(impact, false, spearDashPath);
          if (s.challengeArena && s.challengeWon) break;
        }
      }
      if (s.rangedUnlocked || s.needleUnlocked) {
        const speed = this.weapons.speedMultiplier(s, 'ranged');
        if (s.rangedWeapon === 'emitter') {
          s.needleRecheckClock = 0;
          this.weapons.laser(s, this.currentStones(), dt, speed, (stone, damage) => this.hit(stone, damage, true, false, false, true, false, true));
        } else {
          this.weapons.stopBeam();
          const attacks = this.weapons.tick(s, dt, speed, 'ranged');
          for (let i = 0; i < attacks; i++) {
            if (!this.launchNeedle()) break;
          }
          s.needleRecheckClock += dt;
          if (s.needleRecheckClock >= C.needleRecheckInterval) {
            s.needleRecheckClock -= C.needleRecheckInterval;
            this.launchNeedle();
          }
        }
      }
      s.pickDash = false;
      if (s.needleAltUnlocked && s.needleUnlocked && s.rangedWeapon !== 'needle') {
        s.needleAltClock += dt * this.weapons.needleSpeedMultiplier(s) / (C.needleInterval * C.needleAltIntervalMultiplier);
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
          s.needleFollowUps = [];
        }
      }
    }
    if (s.boundary !== null && !s.challengeArena) {
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
    if (upgrade === 'spatialCompressor') {
      const currentStones = this.currentStones();
      const remainingFraction = currentStones.length / (s.size * s.size);
      if (s.furthestBlock < C.spatialCompressorUnlockBlock || s.challengeArena || remainingFraction > 0.05 || s.ore < C.spatialCompressorCost) return false;
      s.ore -= C.spatialCompressorCost;
      s.block++;
      s.furthestBlock = Math.max(s.furthestBlock, s.block);
      const milestone = s.block < C.blockCount && s.block % 5 === 0;
      s.message = 'Пространственный сжиматель перенёс вас на следующий уровень.';
      if (s.block >= C.blockCount) {
        s.breakthrough++;
        s.completions++;
        this.resetOrdinaryResources();
        this.createMap();
      }
      s.y = s.size - 0.5;
      s.target = null;
      s.projectiles = [];
      s.needleFollowUps = [];
      s.attackClock = 0;
      s.pickDash = false;
      this.weapons.stopBeam();
      if (milestone) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
      return true;
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
      if (!s.auto || s.furthestBlock < C.pickUnlockBlock || s.pickUnlocked || s.ore < C.costs.pick) return false;
      s.ore -= C.costs.pick; s.pickUnlocked = true; s.weapon = 'pick'; s.attackClock = 0; return true;
    }
    if (upgrade === 'spear') {
      if (s.spearUnlocked || s.furthestBlock < C.spearUnlockBlock || s.ore < C.costs.spear || s.crystals < C.costs.spearCrystals) return false;
      s.ore -= C.costs.spear; s.crystals -= C.costs.spearCrystals; s.spearUnlocked = true; return true;
    }
    if (upgrade === 'fistCombo') {
      if (s.fistComboUnlocked || s.ore < C.costs.fistCombo) return false;
      s.ore -= C.costs.fistCombo; s.fistComboUnlocked = true; s.combos.fists = true;
      if (s.fistComboRadiusLevel === 0) s.fistComboRadiusLevel = 1;
      if (s.fistComboRadiusRewardedLevels < 1) { s.crystals++; s.fistComboRadiusRewardedLevels = 1; }
      return true;
    }
    if (upgrade === 'spearPierce' || upgrade === 'spearEnchant') {
      if (!s.spearUnlocked || (upgrade === 'spearPierce' ? s.spearPierce : s.spearEnchant || !this.alchemyNodeUnlocked('air')) || s.ore < C.costs.spearPierce) return false;
      s.ore -= C.costs.spearPierce; if (upgrade === 'spearPierce') s.spearPierce = true; else s.spearEnchant = true; return true;
    }
    if (upgrade === 'ranged') {
      if (!s.needleUnlocked || s.rangedUnlocked || s.furthestBlock < C.rangedUnlockBlock || s.ore < C.costs.ranged) return false;
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
    const masteryWeapon = MASTERY_UPGRADE_WEAPON[upgrade as keyof typeof MASTERY_UPGRADE_WEAPON];
    if (masteryWeapon) {
      const level = masteryWeapon === 'fist' ? s.fistLevel : masteryWeapon === 'pick' ? s.pickLevel : masteryWeapon === 'spear' ? s.spearLevel : masteryWeapon === 'needle' ? s.needleLevel : s.rangedLevel;
      const cost = upgradeOreCost(upgrade, 0);
      if (s.weaponMasteries[masteryWeapon] || level < C.weaponMasteries[masteryWeapon].unlockLevel || s.ore < cost) return false;
      s.ore -= cost;
      s.weaponMasteries[masteryWeapon] = true;
      return true;
    }
    if (!s.repeatablesUnlocked) return false;
    const level = upgrade === 'fistComboRadius' ? s.fistComboRadiusLevel : upgrade === 'spearDamage' ? s.spearLevel : upgrade === 'spearReach' ? s.spearReachLevel : upgrade === 'spearSpeed' ? s.spearSpeedLevel : upgrade === 'melee' ? s.fistLevel : upgrade === 'fistSpeed' ? s.fistSpeedLevel : upgrade === 'pickDamage' ? s.pickLevel : upgrade === 'pickSpeed' ? s.pickSpeedLevel : upgrade === 'rangedDamage' ? s.rangedLevel : upgrade === 'needleDamage' ? s.needleLevel : upgrade === 'needleSpeed' ? s.needleSpeedLevel : upgrade === 'emitterSpeed' ? s.emitterSpeedLevel : upgrade === 'fistFinisher' ? s.fistFinisherLevel : upgrade === 'pickReach' ? s.pickReachLevel : upgrade === 'needlePierce' ? s.needlePierceLevel : upgrade === 'emitterSpread' ? s.emitterSpreadLevel : upgrade === 'emitterArea' ? s.emitterAreaLevel : upgrade === 'beamSpeed' ? s.beamSpeedLevel : upgrade === 'movement' ? s.movementLevel : s.movementLevel;
    if (upgrade === 'fistComboRadius' && (!s.fistComboUnlocked || level >= C.comboFistRadiusMaxLevel || (level >= 3 && s.furthestBlock < C.comboFistRadiusLevel4UnlockBlock))) return false;
    if ((upgrade === 'spearDamage' || upgrade === 'spearReach' || upgrade === 'spearSpeed') && (!s.spearUnlocked || (upgrade === 'spearReach' && level >= 5))) return false;
    if (upgrade === 'pickDamage' && !s.pickUnlocked) return false;
    if (upgrade === 'pickSpeed' && !s.pickUnlocked) return false;
    if (upgrade === 'pickReach' && (!s.pickUnlocked || level >= C.pickReachMaxLevel)) return false;
    if (upgrade === 'rangedDamage' && !s.rangedUnlocked) return false;
    if (upgrade === 'needleDamage' && !s.needleUnlocked) return false;
    if (upgrade === 'needleSpeed' && !s.needleUnlocked) return false;
    if (upgrade === 'emitterSpeed' && !s.rangedUnlocked) return false;
    if (upgrade === 'needlePierce' && (!s.needleUnlocked || level >= C.needlePierceMaxLevel)) return false;
    if (upgrade === 'emitterSpread' && (!s.rangedUnlocked || level >= C.emitterSpreadMaxLevel)) return false;
    if (upgrade === 'emitterArea' && (!s.rangedUnlocked || level >= C.emitterAreaMaxLevel)) return false;
    if (upgrade === 'beamSpeed' && !s.rangedUnlocked) return false;
    const cost = upgradeOreCost(upgrade, level);
    const crystals = specialCrystalCost(upgrade, level);
    if (s.ore < cost || s.crystals < crystals) return false;
    s.ore -= cost; s.crystals -= crystals;
    if (upgrade === 'fistComboRadius') {
      s.fistComboRadiusLevel++;
      if (s.fistComboRadiusLevel <= 3 && s.fistComboRadiusRewardedLevels < s.fistComboRadiusLevel) {
        s.crystals += s.fistComboRadiusLevel - s.fistComboRadiusRewardedLevels;
        s.fistComboRadiusRewardedLevels = s.fistComboRadiusLevel;
      }
    }
    else if (upgrade === 'spearDamage') s.spearLevel++;
    else if (upgrade === 'spearReach') s.spearReachLevel++;
    else if (upgrade === 'spearSpeed') s.spearSpeedLevel++;
    else if (upgrade === 'melee') s.fistLevel++;
    else if (upgrade === 'fistSpeed') s.fistSpeedLevel++;
    else if (upgrade === 'pickDamage') s.pickLevel++;
    else if (upgrade === 'pickSpeed') s.pickSpeedLevel++;
    else if (upgrade === 'rangedDamage') s.rangedLevel++;
    else if (upgrade === 'needleDamage') s.needleLevel++;
    else if (upgrade === 'needleSpeed') s.needleSpeedLevel++;
    else if (upgrade === 'emitterSpeed') s.emitterSpeedLevel++;
    else if (upgrade === 'fistFinisher') s.fistFinisherLevel++;
    else if (upgrade === 'pickReach') s.pickReachLevel++;
    else if (upgrade === 'needlePierce') s.needlePierceLevel++;
    else if (upgrade === 'emitterSpread') s.emitterSpreadLevel++;
    else if (upgrade === 'emitterArea') s.emitterAreaLevel++;
    else if (upgrade === 'beamSpeed') s.beamSpeedLevel++;
    else if (upgrade === 'movement') s.movementLevel++;
    return true;
  }

  equip(weapon: WeaponId): void {
    if (!this.state.paused && (weapon === 'fists' || (weapon === 'pick' && this.state.pickUnlocked) || (weapon === 'spear' && this.state.spearUnlocked))) { this.state.weapon = weapon; this.state.attackClock = 0; }
  }

  enterChallenge1(): boolean {
    const s = this.state;
    if (s.paused || s.challengeArena || !this.challenge1Unlocked) return false;
    s.challengeReturnStones = s.stones;
    s.challengeReturnSize = s.size;
    s.challengeReturnBlock = s.block;
    s.challengeReturnX = s.x;
    s.challengeReturnY = s.y;
    s.stones = [];
    s.size = C.blockSize * C.challengeSizeMultiplier;
    s.block = 0;
    s.challengeArena = true;
    s.challengeWon = false;
    s.challengeFailed = false;
    s.challengeRemaining = C.challengeDurationSeconds;
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      const kind: StoneKind = 'stone';
      const hp = stoneMaxHp(kind, C.blockCount - 1) * C.challengeStoneMultiplier;
      s.stones.push({ block: s.block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
    }
    this.rebuildIndex();
    s.x = Math.floor(s.size / 2); s.y = s.size; s.target = null; s.attackClock = 0;
    return true;
  }

  leaveChallenge1(): boolean {
    const s = this.state;
    if (!s.challengeArena) return false;
    s.stones = s.challengeReturnStones ?? [];
    s.challengeReturnStones = null;
    s.size = s.challengeReturnSize ?? C.blockSize + s.expansion;
    s.block = s.challengeReturnBlock ?? s.block;
    s.x = s.challengeReturnX ?? Math.floor(s.size / 2);
    s.y = s.challengeReturnY ?? s.size - 0.5;
    s.challengeReturnSize = s.challengeReturnBlock = s.challengeReturnX = s.challengeReturnY = null;
    s.challengeArena = false; s.challengeWon = false; s.challengeFailed = false; s.challengeRemaining = 0; s.target = null;
    this.rebuildIndex();
    return true;
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
