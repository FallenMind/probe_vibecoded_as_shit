import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, RangedWeaponId, Stone, StoneKind, WeaponId } from './breachTypes';
import { NearestStoneMovement } from './movement';
import { Weapons } from './weapons';
import { stoneNoise } from './stoneNoise';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, alchemyTickSeconds, freshAlchemyState } from './alchemy';
import type { AlchemyNode, AlchemyResource, AlchemySwitch, AlchemyUpgrade } from './alchemy';
import { CHALLENGE_RULES } from './challengeConfig';
import { airProductionTickSeconds } from './alchemy';

const SAVE_KEY = 'pioneer-breach-v1';

/** Удаляет только сохранение текущего прототипа. */
export function clearBreachSave(): boolean {
  try { localStorage.removeItem(SAVE_KEY); return true; } catch { return false; }
}
type Upgrade = 'pick' | 'pickOptimization' | 'spear' | 'spatialCompressor' | 'fistCombo' | 'fistComboRadius' | 'spearDamage' | 'spearReach' | 'spearSpeed' | 'spearMastery' | 'spearPierce' | 'spearEnchant' | 'pickInfinity' | 'fistUnique' | 'emitterPierce' | 'needleFire' | 'auto' | 'penetration' | 'melee' | 'fistSpeed' | 'fistMastery' | 'pickDamage' | 'pickSpeed' | 'pickMastery' | 'rangedDamage' | 'needleDamage' | 'needleSpeed' | 'needleMastery' | 'emitterSpeed' | 'emitterMastery' | 'fistFinisher' | 'pickReach' | 'needlePierce' | 'emitterSpread' | 'emitterArea' | 'beamSpeed' | 'movement' | 'ranged' | 'needle' | 'needleAlt' | 'artifact' | 'expansion';

export const CYCLE_UPGRADE_DEFS = [
  { id: 'cycle1', group: 1, name: 'Кинетический контур', description: 'Урон ближнего боя ×1,5.', cost: 1 },
  { id: 'cycle2', group: 1, name: 'Полный залп', description: 'Пассивный игломёт стреляет с полной скоростью. Активный игломёт стреляет в 1,5 раза быстрее.', cost: 1 },
  { id: 'cycle3', group: 1, name: 'Раскрытая дуга', description: 'Открывает ещё два уровня улучшения радиуса ближнего оружия.', cost: 2 },
  { id: 'cycle4', group: 1, name: 'Старт после босса', description: 'Каждый новый цикл начинается с квадрата сразу после первого босса.', cost: 2 },
  { id: 'cycle5', group: 2, name: 'Усилитель дальнего контура', description: 'Урон дальнего оружия ×1,5.', cost: 1 },
  { id: 'cycle6', group: 2, name: 'Ритм разгона', description: 'Комбо кирки и копья срабатывает на два удара раньше и больше не замедляет атаку.', cost: 1 },
  { id: 'cycle7', group: 2, name: 'Водный запас', description: 'В начале каждого цикла выдаёт 100 Воды.', cost: 2 },
  { id: 'cycle8', group: 2, name: 'Снятие печати босса', description: 'Боссы сохраняют обычное здоровье и не получают множитель здоровья босса.', cost: 2 },
  { id: 'cycle9', group: 3, name: 'Каменный резерв', description: 'Количество Камня за добычу +10%.', cost: 2 },
  { id: 'cycle10', group: 3, name: 'Стабилизатор породы', description: 'Урон по твёрдой породе +10%.', cost: 4 },
  { id: 'cycle11', group: 3, name: 'Тихий катализ', description: 'Алхимические циклы работают на 5% быстрее.', cost: 7 },
  { id: 'cycle12', group: 3, name: 'Сейсмический след', description: 'Скорость атак +10%.', cost: 10 },
  { id: 'cycle13', group: 4, name: 'Архив боссов', description: 'Добыча руды с босса удваивается.', cost: 10 },
  { id: 'cycle14', group: 4, name: 'Глубинная память', description: 'Урон по элементальной породе +10%.', cost: 25 },
  { id: 'cycle15', group: 4, name: 'Сборочная волна', description: 'Вместимость скрытого буфера кликов +10%.', cost: 60 },
  { id: 'cycle16', group: 4, name: 'Наследие цикла', description: 'Стоимость повторяемых улучшений снижается на 3%.', cost: 250 },
] as const;

export const SPECTRA_UPGRADE_DEFS = [
  { id: 'twin', name: 'Двойник', description: 'Второй контур атакует вместе с пилотом: +35% скорости атаки.', ore: 250000, crystals: 100 },
  { id: 'skipLayers', name: 'Складка маршрута', description: 'После босса пропускает два обычных слоя.', ore: 500000, crystals: 250 },
  { id: 'bombarda', name: 'Бомбарда', description: 'Открывает основное оружие: ходит к породе и забрасывает её бомбами по области. Комбо пока нет.', ore: 750000, crystals: 300 },
  { id: 'spectrumDrive', name: 'Спектральный привод', description: 'Урон оружия +20%.', ore: 1000000, crystals: 400 },
  { id: 'phaseStep', name: 'Фазовый шаг', description: 'Скорость движения +20%.', ore: 1500000, crystals: 500 },
] as const;

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

function stoneMaxHp(kind: StoneKind, block: number, applyBossScale = true): number {
  let hp = kind === 'hard' ? C.hardStoneHp : kind === 'elemental' ? C.elementalStoneHp : 3;
  const boss = isBossBlock(block);
  const hpSteps = boss && !applyBossScale ? 0 : Math.floor(block / 2);
  for (let step = 0; step < hpSteps; step++) hp += C.stoneHpLinearPerTwoBlocks + hp * C.stoneHpPercentPerTwoBlocks;
  const wave = block + 1;
  if (block >= C.bossEveryBlocks && block < C.blockCount - 1 && block % C.bossEveryBlocks < C.postBossCompensationBlocks) hp *= C.postBossHpMultiplier;
  if (boss && applyBossScale) hp *= C.bossStoneHpMultiplier;
  return hp;
}

function standardChallengeHp(kind: StoneKind, block: number): number {
  let hp = kind === 'hard' ? C.hardStoneHp : kind === 'elemental' ? C.elementalStoneHp : 3;
  for (let step = 0; step < Math.floor(block / 2); step++) hp += C.stoneHpLinearPerTwoBlocks + hp * C.stoneHpPercentPerTwoBlocks;
  return hp;
}

function standardChallengeKind(block: number, x: number, y: number, size: number): StoneKind {
  const worldY = block * size + size - 1 - y;
  const nx = (x + C.mineralNoiseOffsetX) / C.mineralNoiseScale;
  const ny = (worldY + C.mineralNoiseOffsetY) / C.mineralNoiseScale;
  const ramp = Math.min(1, Math.max(0, (block - C.elementalMineralStartBlock) / (C.elementalMineralNormalBlock - C.elementalMineralStartBlock)));
  const elementalThreshold = C.elementalMineralRampStartThreshold + (C.elementalMineralThreshold - C.elementalMineralRampStartThreshold) * ramp;
  if (block >= C.elementalMineralStartBlock && stoneNoise(nx, ny, C.elementalMineralSeed) > elementalThreshold) return 'elemental';
  if (block >= C.hardMineralStartBlock && stoneNoise(nx, ny, C.hardMineralSeed) > C.hardMineralThreshold) return 'hard';
  return 'stone';
}

function isBossBlock(block: number): boolean {
  const wave = block + 1;
  return wave % C.bossEveryBlocks === 0 && wave < C.blockCount;
}

function oreReward(kind: StoneKind, block: number): number {
  let reward = kind === 'elemental' ? 4 : kind === 'hard' ? 3 : 1;
  for (let step = 0; step < Math.floor(block / 2); step++) reward += C.oreRewardLinearPerTwoBlocks + reward * C.oreRewardPercentPerTwoBlocks;
  return Math.floor(reward);
}

function freshState(): BreachState {
  return {
    version: 1, balanceVersion: 5, alchemy: freshAlchemyState(), paused: false, savedAt: Date.now(), tutorial: 'click', block: 0, furthestBlock: 0, size: C.blockSize,
    stones: [], x: Math.floor(C.blockSize / 2), y: C.blockSize, target: null, shot: null,
    ore: 0, crystals: 0, breakthrough: 0, completions: 0, expansion: 0, auto: false, pickUnlocked: false, repeatablesUnlocked: true, attackClock: 0, penetration: 0,
    meleeLevel: 0, fistLevel: 0, pickLevel: 0, rangedLevel: 0, needleLevel: 0, rangedWeapon: 'needle', needleUnlocked: false,
    fistFinisherLevel: 0, pickReachLevel: 0, needlePierceLevel: 0, emitterSpreadLevel: 0, emitterAreaLevel: 0, beamSpeedLevel: 0,
    fistSpeedLevel: 0, pickSpeedLevel: 0, spearSpeedLevel: 0, needleSpeedLevel: 0, emitterSpeedLevel: 0,
    weaponMasteries: { fist: false, pick: false, spear: false, needle: false, emitter: false },
    clickLevel: 0, speedLevel: 0, movementLevel: 0, weapon: 'fists', rangedUnlocked: false,
    artifactUnlocked: false, artifactClock: 0, rangedClock: 0, boundary: null, reagent: 0, reagentClock: 0,
    needleAltUnlocked: false, needleAltClock: 0, needleRecheckClock: 0, projectiles: [], needleFollowUps: [], charges: 0, buffRemaining: 0, message: '',
    spearUnlocked: false, spearLevel: 0, spearReachLevel: 0, spearPierce: false, spearEnchant: false, spatialCompressorUnlocked: false, challenge1Completed: false, challenge2Completed: false, challenge3Completed: false, challengeNumber: 1,
    challenge3Transmuted: 0, challenge3WaterProduced: false, challenge3AirProduced: false,
    challenge4Completed: false, spectraUnlocked: false, bombardaUnlocked: false, spectraUpgrades: {}, cycleUpgrades: {}, autoCrystallizeEnabled: false, autoCrystallizeClock: 0, challengeRegenClock: 0,
    challenge4StoneMultiplier: 1, challenge4DamageMultiplier: 1, challenge4RangeBonus: 0,
    pickInfinityEnchant: false, fistUniqueUpgrade: false, emitterPierceUpgrade: false, needleFireUpgrade: false, rangedBurstCharge: 0,
    fistComboUnlocked: false, fistComboRadiusLevel: 0, fistComboRadiusRewardedLevels: 0, combos: { fists: false, pick: false, spear: false }, comboCounts: { fists: 0, pick: 0, spear: 0 }, pickDash: false, pickDashCharge: 0, spearDashCharge: 0, clickBuffer: 0, alchemyHelpSeen: false, seenFeatures: {},
    clickHeat: 0, clickWindowCount: 0, clickWindowTime: 0, challengeArena: false, challengeWon: false, challengeFailed: false, challengeRemaining: 0, challengeReturnStones: null, challengeReturnSize: null, challengeReturnBlock: null, challengeReturnX: null, challengeReturnY: null, challengeReturnAlchemy: null,
    bossRemaining: 0, earthOverloadRemaining: 0, earthOverloadCounter: 0, earthOverloadUsed: false, pickAlchemyOptimized: false, endChargeRemaining: 0, challengeReturnBossRemaining: null, challengeReturnEndChargeRemaining: null,
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
  compressorEffect: { x: number; y: number; elapsed: number } | null = null;
  finalWallEffect: { elapsed: number } | null = null;
  challengeTransition: { type: 'enter' | 'exit' | 'result'; number: 1 | 2 | 3 | 4; elapsed: number; success?: boolean } | null = null;

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
      for (const key of ['spearUnlocked', 'spearLevel', 'spearReachLevel', 'spearPierce', 'spearEnchant', 'spatialCompressorUnlocked', 'challenge1Completed', 'challenge2Completed', 'challenge3Completed', 'challengeNumber', 'challenge3Transmuted', 'challenge3WaterProduced', 'challenge3AirProduced', 'pickInfinityEnchant', 'fistUniqueUpgrade', 'emitterPierceUpgrade', 'needleFireUpgrade', 'rangedBurstCharge', 'fistComboUnlocked', 'fistComboRadiusLevel', 'pickDash', 'pickDashCharge', 'spearDashCharge', 'clickBuffer', 'clickHeat', 'clickWindowCount', 'clickWindowTime', 'challengeArena', 'challengeWon', 'challengeFailed', 'challengeRemaining', 'challengeReturnStones', 'challengeReturnSize', 'challengeReturnBlock', 'challengeReturnX', 'challengeReturnY', 'challengeReturnAlchemy', 'challengeReturnBossRemaining', 'challengeReturnEndChargeRemaining', 'alchemyHelpSeen', 'bossRemaining', 'earthOverloadRemaining', 'earthOverloadCounter', 'earthOverloadUsed', 'pickAlchemyOptimized', 'endChargeRemaining'] as const) {
        if (saved[key] === undefined) Object.assign(saved, { [key]: defaults[key] });
      }
      saved.challenge4Completed ??= false;
      saved.spectraUnlocked ??= false;
      saved.bombardaUnlocked ??= false;
      saved.spectraUpgrades ??= {};
      saved.cycleUpgrades ??= {};
      saved.autoCrystallizeEnabled ??= false;
      saved.autoCrystallizeClock ??= 0;
      saved.challengeRegenClock ??= 0;
      saved.challenge4StoneMultiplier ??= 1;
      saved.challenge4DamageMultiplier ??= 1;
      saved.challenge4RangeBonus ??= 0;
      saved.repeatablesUnlocked = true;
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
      saved.alchemy.fire ??= 0;
      saved.alchemy.airProductionEnabled ??= false;
      saved.alchemy.elementalizationEnabled ??= false;
      saved.alchemy.airProductionClock ??= 0;
      saved.bossRemaining ??= isBossBlock(saved.block) ? C.bossTimerSeconds : 0;
      if (saved.bossRemaining === 0 && isBossBlock(saved.block) && saved.stones.some(stone => stone.block === saved!.block)) saved.bossRemaining = C.bossTimerSeconds;
      if (saved.balanceVersion !== 5) {
        for (const stone of saved.stones) {
          const fraction = stone.maxHp > 0 ? Math.max(0, Math.min(1, stone.hp / stone.maxHp)) : 1;
          if (stone.block === 24) {
            const worldY = stone.block * saved.size + saved.size - 1 - stone.y;
            const noiseX = (stone.x + C.mineralNoiseOffsetX) / C.mineralNoiseScale;
            const noiseY = (worldY + C.mineralNoiseOffsetY) / C.mineralNoiseScale;
            if (stoneNoise(noiseX, noiseY, C.elementalMineralSeed + 250) > C.elementalBossNoiseThreshold) stone.kind = 'elemental';
          }
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
        saved.balanceVersion = 5;
      }
      saved.pickUnlocked ??= saved.auto || saved.weapon === 'pick';
      saved.repeatablesUnlocked = true;
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

  get challenge1Unlocked(): boolean { return this.state.furthestBlock > CHALLENGE_RULES[1].unlockBlock; }
  get challenge2Unlocked(): boolean { return this.state.furthestBlock > CHALLENGE_RULES[2].unlockBlock; }
  get challenge3Unlocked(): boolean { return this.state.challenge1Completed && this.state.furthestBlock > CHALLENGE_RULES[3].unlockBlock; }
  get challenge4Unlocked(): boolean { return this.state.furthestBlock > CHALLENGE_RULES[4].unlockBlock; }

  alchemyNodeUnlocked(node: AlchemyNode): boolean {
    if (node === 'earth') return this.state.furthestBlock > A.earthUnlockBlock;
    if (node === 'water') return this.state.furthestBlock > A.waterUnlockBlock;
    if (node === 'air') return this.state.challenge1Completed || (this.state.challengeArena && this.state.challengeNumber === 3);
    if (node === 'fire') return this.state.challenge3Completed;
    return false;
  }

  private get fireNeedleActive(): boolean { return this.alchemyNodeUnlocked('fire') && this.state.needleFireUpgrade; }

  toggleAlchemy(name: AlchemySwitch): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect) return false;
    if (name === 'waterEnabled' ? !this.alchemyNodeUnlocked('water') : name === 'airProductionEnabled' || name === 'elementalizationEnabled' ? !this.alchemyNodeUnlocked('air') : !this.alchemyNodeUnlocked('earth')) return false;
    if (name === 'pickEnabled' && !s.pickUnlocked && !s.spearUnlocked) return false;
    const wasEnabled = s.alchemy[name];
    s.alchemy[name] = !wasEnabled;
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

  toggleAutoCrystallize(): boolean {
    const s = this.state;
    if (s.paused || !s.challenge3Completed) return false;
    s.autoCrystallizeEnabled = !s.autoCrystallizeEnabled;
    s.autoCrystallizeClock = 0;
    return true;
  }

  buySpectraUnlock(): boolean {
    const s = this.state;
    if (s.paused || !s.challenge4Completed || s.spectraUnlocked || s.crystals < 1000) return false;
    s.crystals -= 1000;
    s.spectraUnlocked = true;
    return true;
  }

  buySpectraUpgrade(id: string): boolean {
    const s = this.state;
    const upgrade = SPECTRA_UPGRADE_DEFS.find(item => item.id === id);
    if (!upgrade || s.paused || !s.spectraUnlocked || s.spectraUpgrades[id] || s.ore < upgrade.ore || s.crystals < upgrade.crystals) return false;
    s.ore -= upgrade.ore;
    s.crystals -= upgrade.crystals;
    s.spectraUpgrades[id] = true;
    if (id === 'bombarda') s.bombardaUnlocked = true;
    return true;
  }

  buyCycleUpgrade(id: string): boolean {
    const s = this.state;
    const upgrade = CYCLE_UPGRADE_DEFS.find(item => item.id === id);
    if (!upgrade || s.paused || s.completions < 1 || s.cycleUpgrades[id] || s.breakthrough < upgrade.cost) return false;
    s.breakthrough -= upgrade.cost;
    s.cycleUpgrades[id] = true;
    if (id === 'cycle7') s.alchemy.water = Math.min(alchemyCapacity(s.alchemy, 'water'), s.alchemy.water + 100);
    if (id === 'cycle8') {
      for (const stone of s.stones) {
        if (!isBossBlock(stone.block)) continue;
        const healthFraction = stone.maxHp > 0 ? stone.hp / stone.maxHp : 1;
        stone.maxHp = stoneMaxHp(stone.kind, stone.block, false);
        stone.hp = stone.maxHp * healthFraction;
      }
    }
    return true;
  }

  startEarthOverload(): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect || s.challengeArena || !this.alchemyNodeUnlocked('water') || s.earthOverloadUsed || s.alchemy.water < A.earthOverloadCost.water || s.alchemy.earth < A.earthOverloadCost.earth) return false;
    s.alchemy.water -= A.earthOverloadCost.water;
    s.alchemy.earth -= A.earthOverloadCost.earth;
    s.earthOverloadUsed = true;
    s.earthOverloadRemaining = A.earthOverloadCost.seconds;
    s.earthOverloadCounter = 0;
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
    if (s.challengeArena && s.challengeNumber === 3) s.challenge3WaterProduced = true;
    return true;
  }

  private advanceAlchemy(dt: number): void {
    const a = this.state.alchemy;
    const earth = A.earthRecipe;
    if (a.earthEnabled && this.alchemyNodeUnlocked('earth') && a.stone >= 1 && a.earth < alchemyCapacity(a, 'earth')) {
      a.earthClock += dt;
      const seconds = alchemyTickSeconds(a, 'earth') * (this.state.cycleUpgrades.cycle11 ? 0.95 : 1);
      while (a.earthClock + 1e-9 >= seconds && a.stone >= 1 && a.earth < alchemyCapacity(a, 'earth')) {
        a.earthClock = Math.max(0, a.earthClock - seconds);
        const amount = Math.min(Math.max(1, Math.floor(a.stone * earth.fraction)), a.stone, alchemyCapacity(a, 'earth') - a.earth);
        a.stone -= amount; a.earth += amount;
      }
      if (a.stone < 1 || a.earth >= alchemyCapacity(a, 'earth')) a.earthClock = 0;
    } else a.earthClock = 0;

    if (a.waterEnabled && this.alchemyNodeUnlocked('water') && a.earth >= 1 && a.elementalStone >= A.waterRecipe.elementalPerWater && a.water < alchemyCapacity(a, 'water')) {
      a.waterClock += dt;
      const seconds = alchemyTickSeconds(a, 'water') * (this.state.cycleUpgrades.cycle11 ? 0.95 : 1);
      while (a.waterClock + 1e-9 >= seconds) {
        a.waterClock = Math.max(0, a.waterClock - seconds);
        if (!this.craftWater()) { a.waterClock = 0; break; }
      }
    } else a.waterClock = 0;

    if (a.airProductionEnabled && this.alchemyNodeUnlocked('air') && a.water >= A.airRecipe.waterPerAir && a.air < alchemyCapacity(a, 'air')) {
      a.airProductionClock += dt;
      const challengeAirBonus = this.state.challengeArena && this.state.challengeNumber === 3 ? 0.5 : 1;
      const airTickSeconds = airProductionTickSeconds(a) * challengeAirBonus * (this.state.cycleUpgrades.cycle11 ? 0.95 : 1);
      while (a.airProductionClock + 1e-9 >= airTickSeconds && a.water >= A.airRecipe.waterPerAir && a.air < alchemyCapacity(a, 'air')) {
        a.airProductionClock = Math.max(0, a.airProductionClock - airTickSeconds);
        a.water -= A.airRecipe.waterPerAir;
        a.air = Math.min(alchemyCapacity(a, 'air'), a.air + 1);
        if (this.state.challengeArena && this.state.challengeNumber === 3) this.state.challenge3AirProduced = true;
      }
    } else a.airProductionClock = 0;

    if (this.alchemyNodeUnlocked('fire') && a.fire > 0) {
      const cycleMultiplier = ALCHEMY_UPGRADES.reduce((multiplier, upgrade) =>
        upgrade.fireCycleMultiplier && a.upgrades[upgrade.id] ? multiplier * upgrade.fireCycleMultiplier : multiplier, 1);
      const seconds = A.fireCycle.seconds * cycleMultiplier;
      const canFeedFire = a.earth >= A.fireCycle.earthCostPerTick && a.air >= A.fireCycle.airCostPerTick;
      if (canFeedFire) a.fireClock += dt;
      else a.fireClock = 0;
      while (a.fireClock + 1e-9 >= seconds && a.earth >= A.fireCycle.earthCostPerTick && a.air >= A.fireCycle.airCostPerTick) {
        a.fireClock = Math.max(0, a.fireClock - seconds);
        a.earth -= A.fireCycle.earthCostPerTick;
        a.air -= A.fireCycle.airCostPerTick;
        a.stone += A.fireCycle.stonePerTick;
        a.elementalStone += A.fireCycle.elementalPerTick;
        a.earth = Math.min(alchemyCapacity(a, 'earth'), a.earth + A.fireCycle.earthPerTick);
        a.water = Math.min(alchemyCapacity(a, 'water'), a.water + A.fireCycle.waterPerTick);
        a.air = Math.min(alchemyCapacity(a, 'air'), a.air + A.fireCycle.airPerTick);
      }
    } else a.fireClock = 0;
  }

  private createMap(): void {
    const s = this.state;
    s.size = C.blockSize + s.expansion;
    s.block = s.cycleUpgrades.cycle4 ? C.bossEveryBlocks : 0;
    s.x = Math.floor(s.size / 2);
    s.y = s.size;
    s.target = null;
    s.shot = null;
    s.projectiles = [];
    s.needleFollowUps = [];
    s.needleRecheckClock = 0;
    s.pickDash = false;
    s.clickBuffer = 0;
    s.bossRemaining = isBossBlock(s.block) ? C.bossTimerSeconds : 0;
    s.endChargeRemaining = 0;
    this.finalWallEffect = null;
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
          const bossWave = block + 1;
          const elementalNoise = stoneNoise(nx, ny, C.elementalMineralSeed);
          const bossElementalNoise = stoneNoise(nx, ny, C.elementalMineralSeed + 250);
          if (bossWave === 25 && bossElementalNoise > C.elementalBossNoiseThreshold) kind = 'elemental';
          else if (block >= C.elementalMineralStartBlock && elementalNoise > elementalThreshold) kind = 'elemental';
          else if (block >= C.hardMineralStartBlock && stoneNoise(nx, ny, C.hardMineralSeed) > (isBossBlock(block) && bossWave < 25 ? C.bossHardNoiseThreshold : C.hardMineralThreshold)) kind = 'hard';
        }
        const hp = stoneMaxHp(kind, block, !s.cycleUpgrades.cycle8);
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
    if (s.challengeArena && s.challengeNumber === 3) {
      const weight = A.stoneWeight[stone.kind];
      const elementalized = stone.kind !== 'elemental' && s.alchemy.elementalizationEnabled && s.alchemy.air > 0 && Math.random() < 0.5;
      s.alchemy.stone += weight - Number(elementalized);
      if (stone.kind === 'elemental') s.alchemy.elementalStone += 1;
      if (elementalized) {
        s.alchemy.elementalStone += 1;
        s.challenge3Transmuted++;
        if (s.challenge3Transmuted >= 10000) this.completeChallenge(3);
        s.message = `Элементальный камень: ${s.challenge3Transmuted} / 10000`;
      }
    } else if (!s.challengeArena) {
      const weight = A.stoneWeight[stone.kind];
      const elementalized = stone.kind !== 'elemental' && s.alchemy.elementalizationEnabled && s.alchemy.air > 0 && Math.random() < 0.5;
      s.alchemy.stone += weight - Number(elementalized);
      if (s.cycleUpgrades.cycle9) s.alchemy.stone += weight * 0.1;
      if (stone.kind === 'elemental') s.alchemy.elementalStone += 1;
      if (stone.kind === 'elemental' && this.alchemyNodeUnlocked('fire')) s.alchemy.fire = Math.min(alchemyCapacity(s.alchemy, 'fire'), s.alchemy.fire + 1);
      if (elementalized) s.alchemy.elementalStone += 1;
      if (s.earthOverloadRemaining > 0 && ++s.earthOverloadCounter % 2 === 0) s.alchemy.elementalStone += 1;
      if (stone.kind === 'elemental' && Math.random() < C.elementalCrystalDropChance) {
        s.crystals++;
        s.message = 'Элементальная руда принесла кристалл.';
      }
      const oreMultiplier = 1 + (s.cycleUpgrades.cycle13 && isBossBlock(stone.block) ? 1 : 0);
      s.ore += oreReward(stone.kind, stone.block) * oreMultiplier;
      if (stone.block === s.block && this.currentStones().length <= s.size * s.size * (1 - C.repeatableUnlockFraction)) s.repeatablesUnlocked = true;
      if (s.tutorial === 'click') { s.ore += 2; s.tutorial = 'auto'; }
    }
    if (!s.challengeArena && s.bossRemaining > 0 && this.currentStones().length === 0) {
      s.bossRemaining = 0;
      s.message = `Босс ${s.block + 1}-го квадрата повержен.`;
    }
    if (s.challengeArena && s.challengeNumber !== 3 && s.challengeNumber !== 4 && !s.stones.length && !s.challengeWon) this.completeChallenge(s.challengeNumber);
  }

  private completeChallenge(number: 1 | 2 | 3 | 4): void {
    const s = this.state;
    if (s.challengeWon) return;
    s.challengeWon = true;
    s.challengeFailed = false;
    s.challengeRemaining = 0;
    if (number === 1) {
      s.challenge1Completed = true;
      s.message = 'Challenge 1 пройден: открыт Воздух и уникальные улучшения.';
    } else if (number === 2) {
      s.challenge2Completed = true;
      s.message = 'Challenge 2 пройден.';
    } else if (number === 3) {
      s.challenge3Completed = true;
      s.alchemy.earthEnabled = true;
      s.alchemy.waterEnabled = true;
      s.alchemy.airProductionEnabled = true;
      s.alchemy.elementalizationEnabled = true;
      s.message = 'Тепловой шифр разгадан: открыт Огонь.';
    }
    if (number === 4) {
      s.challenge4Completed = true;
      s.message = 'Теорема существования доказана. Награда: ???';
    }
    this.challengeTransition = { type: 'result', number, elapsed: 0, success: true };
  }

  private hit(stone: Stone, amount: number, weaponHit = true, earthHit = false, ignoreArmor = false, area = false, windPierce = false, splash = area, flashColor = 0xe7c37c): void {
    const s = this.state;
    if (s.challengeArena && s.challengeNumber === 4) amount *= s.challenge4DamageMultiplier;
    amount *= 1 + (s.cycleUpgrades.cycle10 && stone.kind === 'hard' ? 0.1 : 0) + (s.cycleUpgrades.cycle14 && stone.kind === 'elemental' ? 0.1 : 0) + (s.spectraUpgrades.spectrumDrive ? 0.2 : 0);
    if (!ignoreArmor && !this.weapons.canHit(s, stone)) return;
    const pickCostMultiplier = s.pickAlchemyOptimized ? 1 : 5;
    const earthCost = A.pickEarthPerStone * pickCostMultiplier * A.stoneWeight[stone.kind];
    const empowered = earthHit && s.alchemy.pickEnabled && this.alchemyNodeUnlocked('earth') && s.alchemy.earth >= earthCost;
    if (empowered) amount *= A.pickDamageMultiplier;
    if (stone.kind === 'hard' && splash && s.penetration <= 0) amount *= C.hardSplashDamageMultiplier;
    if (weaponHit && stone.kind === 'elemental') {
      amount *= empowered ? 1 : windPierce ? C.elementalPierceEfficiency : 1 / C.elementalMultiplier;
    }
    if (amount > 0) { stone.damageFlash = 1; stone.damageFlashColor = flashColor; }
    stone.hp -= amount;
    if (stone.hp <= 0) {
      if (empowered) s.alchemy.earth -= earthCost;
      this.destroy(stone);
    }
  }

  private strike(target: Stone, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null, pickDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const s = this.state;
    this.weapons.strike(s, target, this.currentStones(), (stone, damage, area, splash) => {
      this.hitWithEquippedWeapon(stone, damage, area, splash);
    }, s.weapon, spearDashPath, pickDashPath);
  }

  private hitWithEquippedWeapon(stone: Stone, damage: number, area = false, splash = area): void {
    const s = this.state;
    const elementalPierce = stone.kind === 'elemental' && ((s.weapon === 'spear' && s.spearEnchant) || (s.weapon === 'pick' && s.pickInfinityEnchant) || (s.weapon === 'ranged' && s.rangedWeapon === 'emitter' && s.emitterPierceUpgrade));
    const flashColor = s.weapon === 'spear' ? 0x64d7cc : s.weapon === 'pick' ? 0xf0a84c : s.weapon === 'fists' ? 0xf4d189 : s.rangedWeapon === 'emitter' ? 0x5ce1e4 : 0xffbd68;
    this.hit(stone, damage, true, s.weapon === 'pick' || s.weapon === 'fists' || s.weapon === 'spear', s.weapon === 'spear' && area && s.spearPierce && stone.kind !== 'elemental', area, elementalPierce, splash, flashColor);
  }

  private spearWindup(): void {
    this.weapons.spearWindup(this.state, this.currentStones(), (stone, damage) => this.hitWithEquippedWeapon(stone, damage, true, true));
  }

  click(): void {
    const s = this.state;
    if (s.paused || this.resetEffect) return;
    s.clickBuffer = Math.min(C.clickBufferCapacity * (s.cycleUpgrades.cycle15 ? 1.1 : 1), s.clickBuffer + 1);
    s.clickWindowCount++;
  }

  private spearDash(): { fromX: number; fromY: number; toX: number; toY: number } | null {
    const s = this.state;
    const stones = this.currentStones();
    const occupied = new Set(stones.map(stone => `${stone.x}:${stone.y}`));
    const radius = Math.min(C.spearRadiusMax, C.spearRadius + s.spearReachLevel * C.spearRadiusPerLevel);
    let destination: { x: number; y: number } | null = null;
    let bestScore = -1;
    let bestTravel = Infinity;
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      const travel = Math.hypot(x - s.x, y - s.y);
      if (travel > C.spearDashRange || occupied.has(`${x}:${y}`)) continue;
      const hitSet = new Set<Stone>();
      const dx = x - s.x, dy = y - s.y;
      const length = Math.hypot(dx, dy);
      for (const stone of stones) {
        if (Math.hypot(stone.x - x, stone.y - y) <= radius) hitSet.add(stone);
        if (s.spearEnchant && length > 0) {
          const rx = stone.x - s.x, ry = stone.y - s.y;
          const along = (rx * dx + ry * dy) / length;
          const across = Math.abs(rx * dy - ry * dx) / length;
          if (along >= 0 && along <= length && across <= 0.75) hitSet.add(stone);
        }
      }
      if (hitSet.size > bestScore || (hitSet.size === bestScore && travel < bestTravel)) {
        destination = { x, y }; bestScore = hitSet.size; bestTravel = travel;
      }
    }
    if (!destination) {
      const blocker = stones.filter(stone => Math.hypot(stone.x - s.x, stone.y - s.y) <= C.spearDashRange)
        .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (!blocker) return null;
      destination = { x: blocker.x, y: blocker.y };
      this.hit(blocker, blocker.hp, false, false, true);
    }
    const path = { fromX: s.x, fromY: s.y, toX: destination.x, toY: destination.y };
    this.weapons.dash(path.fromX, path.fromY, path.toX, path.toY);
    s.x = destination.x; s.y = destination.y;
    return path;
  }
  private pickDash(target: Stone): { fromX: number; fromY: number; toX: number; toY: number } {
    const s = this.state;
    const dx = target.x - s.x, dy = target.y - s.y;
    const distance = Math.hypot(dx, dy);
    const fromX = s.x, fromY = s.y;
    if (distance > 0) {
      const dash = Math.min(C.pickDashRange, distance);
      s.x += dx / distance * dash;
      s.y += dy / distance * dash;
      this.weapons.dash(fromX, fromY, s.x, s.y);
    }
    s.pickDash = true;
    return { fromX, fromY, toX: s.x, toY: s.y };
  }

  private launchNeedle(followTarget?: Stone): boolean {
    const s = this.state;
    const damage = (C.needleDamage + s.needleLevel * C.needleDamagePerLevel) * (s.cycleUpgrades.cycle5 ? 1.5 : 1);
    let best: Stone | undefined;
    let remainingHp = 0;
    const candidates: { stone: Stone; remaining: number }[] = [];
    for (const stone of this.currentStones()) {
      if (followTarget && stone !== followTarget) continue;
      if (!followTarget && this.fireNeedleActive && stone.ignited) continue;
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
      damage: shotDamage, pierce: shotDamage * Math.min(1, s.needlePierceLevel * C.needlePierceBonus), followUp: !!followTarget, elementalPierce: this.fireNeedleActive });
    if (!followTarget && this.fireNeedleActive) best.ignited = true;
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
      if (target) this.hit(target, shot.damage, true, false, false, false, !!shot.elementalPierce, false, shot.elementalPierce ? 0xff762e : 0xffc66e);
      if (target && target.hp > 0 && shot.elementalPierce) {
        if (!target.burning) target.burnTickRemaining = C.needleBurnTickSeconds;
        target.burning = true;
      }
      if (target && target.hp > 0 && !shot.followUp && !this.fireNeedleActive) s.needleFollowUps.push({ block: shot.block, x: shot.x, y: shot.y, remaining: Math.max(0, C.needleFollowUpDelay + shot.remaining) });
      const behind = shot.y > 0 ? this.cells.get(this.key(shot.x, this.globalY({ block: shot.block, y: shot.y - 1 }))) : undefined;
      if (behind && shot.pierce > 0) {
        this.hit(behind, shot.pierce, true, false, false, false, !!shot.elementalPierce, false, shot.elementalPierce ? 0xff762e : 0xffc66e);
        if (behind.hp > 0 && shot.elementalPierce) {
          behind.ignited = true;
          if (!behind.burning) behind.burnTickRemaining = C.needleBurnTickSeconds;
          behind.burning = true;
        }
      }
    }
  }

  private advanceBurning(dt: number): void {
    // Ignition has no duration: the burn stops only when the rock is destroyed or removed.
    for (const stone of [...this.state.stones]) {
      if (!stone.burning) continue;
      stone.burnTickRemaining = (stone.burnTickRemaining ?? C.needleBurnTickSeconds) - dt;
      while (stone.burnTickRemaining <= 1e-9 && stone.hp > 0) {
        stone.burnTickRemaining += C.needleBurnTickSeconds;
        const percentDamage = stone.maxHp * C.needleBurnDamagePercentPerTick;
        const cappedDamage = Math.min(percentDamage, this.weapons.currentMeleeDamage(this.state) * 0.5);
        this.hit(stone, cappedDamage, true, false, false, false, true, false, 0xff762e);
      }
    }
  }

  private artifactTick(): void {
    const s = this.state;
    if (s.challengeArena && s.challengeNumber === 2) return;
    // Сначала рассчитываем все попадания, затем удаляем камни: порядок не влияет на изоляцию.
    const nearby = this.blocks.slice(Math.max(0, s.block - C.artifactBlockRadius), Math.min(C.blockCount, s.block + C.artifactBlockRadius + 1)).flat();
    const hits = nearby.map((stone) => ({ stone, damage: C.artifactDamage * this.weapons.currentMeleeDamage(s) * (1 + C.artifactIsolationBonus * (1 - stone.neighbors / 24) ** 4) }));
    for (const { stone, damage } of hits) this.hit(stone, damage, false, false, false, false, false, false, 0xb88cff);
  }

  private resetOrdinaryResources(): void {
    const s = this.state;
    s.ore = 0;
    s.reagent = 0;
    s.reagentClock = 0;
    s.charges = 0;
    s.buffRemaining = 0;
    Object.assign(s.alchemy, { stone: 0, elementalStone: 0, earth: 0, water: 0, air: 0, fire: 0, earthClock: 0, waterClock: 0, fireClock: 0 });
    s.earthOverloadRemaining = 0;
    s.earthOverloadCounter = 0;
    s.earthOverloadUsed = false;
  }

  private fail(): void {
    const s = this.state;
    this.resetEffect = { stones: this.currentStones().map(stone => ({ ...stone })), x: s.x, y: s.y, size: s.size, elapsed: 0 };
    this.weapons.stopBeam();
    this.resetOrdinaryResources();
    s.message = 'Граница настигла первопроходца. Улучшения и редкие ресурсы сохранены.';
    this.createMap();
  }

  private failBoss(): void {
    const s = this.state;
    const failedWave = s.block + 1;
    const previousBossWave = Math.floor((failedWave - 1) / C.bossEveryBlocks) * C.bossEveryBlocks;
    const restartBlock = previousBossWave;
    const furthestBlock = s.furthestBlock;
    this.resetEffect = { stones: this.currentStones().map(stone => ({ ...stone })), x: s.x, y: s.y, size: s.size, elapsed: 0 };
    this.weapons.stopBeam();
    this.createMap();
    s.block = restartBlock;
    s.furthestBlock = furthestBlock;
    s.x = Math.floor(s.size / 2);
    s.y = s.size - 0.5;
    s.target = null;
    s.bossRemaining = 0;
    s.boundary = s.tutorial === 'done' ? C.blockCount * s.size + C.boundaryHeadStart : null;
    s.message = `Время босса ${failedWave} истекло. Ресурсы сохранены; повторный заход с квадрата ${restartBlock + 1}.`;
  }

  private completeRun(): void {
    const s = this.state;
    s.furthestBlock = Math.max(s.furthestBlock, C.blockCount);
    s.breakthrough++;
    s.completions++;
    s.message = 'Граница 50-го квадрата проломлена. Получено очко прорывателя.';
    this.resetOrdinaryResources();
    if (s.cycleUpgrades.cycle7) s.alchemy.water = Math.min(alchemyCapacity(s.alchemy, 'water'), 100);
    this.createMap();
  }

  private advanceChallengeRegeneration(dt: number): void {
    const s = this.state;
    if (!s.challengeArena || s.challengeWon || (s.challengeNumber !== 3 && s.challengeNumber !== 4)) return;
    const rules = CHALLENGE_RULES[s.challengeNumber];
    const remaining = s.stones.length / (s.size * s.size);
    if (s.challengeNumber === 4 && remaining <= CHALLENGE_RULES[4].finishFraction) return;
    if (s.challengeNumber === 4 && s.block >= C.blockCount - 1) return;
    if (s.challengeNumber === 4) {
      const repairPerSecond = C.needleBurnDamagePercentPerTick / C.needleBurnTickSeconds;
      for (const stone of s.stones) stone.hp = Math.min(stone.maxHp, stone.hp + stone.maxHp * repairPerSecond * dt);
    }
    s.challengeRegenClock += dt;
    while (s.challengeRegenClock >= 1) {
      s.challengeRegenClock -= 1;
      const missing: { x: number; y: number }[] = [];
      const occupied = new Set(s.stones.map(stone => `${stone.x}:${stone.y}`));
      for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) if (!occupied.has(`${x}:${y}`)) missing.push({ x, y });
      const count = Math.min(missing.length, Math.ceil(s.size * s.size * (rules.regenFraction ?? 0)));
      for (let i = 0; i < count; i++) {
        const pick = Math.floor(Math.random() * missing.length);
        const [{ x, y }] = missing.splice(pick, 1);
        const block = s.block;
        const hp = (s.challengeNumber === 4 ? standardChallengeHp('stone', block) * s.challenge4StoneMultiplier : stoneMaxHp('stone', C.blockCount - 1)) * rules.stoneMultiplier;
        s.stones.push({ block, x, y, hp, maxHp: hp, kind: 'stone', neighbors: 0 });
      }
      this.rebuildIndex();
    }
  }

  private compressSpace(): void {
    const s = this.state;
    s.block++;
    s.furthestBlock = Math.max(s.furthestBlock, s.block);
    const milestone = s.block < C.blockCount && s.block % 5 === 0;
    if (s.block < C.blockCount) {
      s.y = s.size - 0.5;
      s.target = null;
      s.projectiles = [];
      s.needleFollowUps = [];
      s.attackClock = 0;
      s.pickDash = false;
      this.weapons.stopBeam();
    }
    s.bossRemaining = isBossBlock(s.block) ? C.bossTimerSeconds : 0;
    s.y = s.size - 0.5;
    s.target = null;
    s.attackClock = 0;
    s.pickDash = false;
    this.weapons.stopBeam();
    s.message = 'Пространственный сжиматель перенёс вас на следующий слой.';
    if (milestone) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
    this.compressorEffect = { x: s.size / 2, y: s.size / 2, elapsed: 0 };
  }

  private step(dt: number): void {
    const s = this.state;
    if (s.paused) return;
    if (this.challengeTransition) {
      this.challengeTransition.elapsed += dt;
      if (this.challengeTransition.elapsed < C.challengeTransitionSeconds) return;
      this.challengeTransition = null;
    }
    if (this.compressorEffect) {
      this.compressorEffect.elapsed += dt;
      if (this.compressorEffect.elapsed >= C.compressorAnimationSeconds) this.compressorEffect = null;
    }
    if (this.resetEffect) {
      this.resetEffect.elapsed += dt;
      if (this.resetEffect.elapsed >= C.resetAnimationSeconds) this.resetEffect = null;
      return;
    }
    if (this.finalWallEffect) {
      this.finalWallEffect.elapsed += dt;
      if (this.finalWallEffect.elapsed >= 0.65) this.completeRun();
      return;
    }
    if (s.endChargeRemaining > 0) {
      s.endChargeRemaining = Math.max(0, s.endChargeRemaining - dt);
      if (s.endChargeRemaining <= 0) {
        this.finalWallEffect = { elapsed: 0 };
        s.y = Math.min(s.size - 0.5, s.y + 1.5);
      }
      return;
    }
    if (s.challengeArena && s.challengeWon) return;
    if (s.challengeArena && s.challengeRemaining > 0) {
      s.challengeRemaining = Math.max(0, s.challengeRemaining - dt);
      if (s.challengeRemaining <= 0) {
        s.challengeFailed = true;
        s.challengeWon = true;
        s.message = `Время Challenge ${s.challengeNumber} вышло.`;
        this.challengeTransition = { type: 'result', number: s.challengeNumber, elapsed: 0, success: false };
        return;
      }
    }
    if (s.bossRemaining > 0) {
      s.bossRemaining = Math.max(0, s.bossRemaining - dt);
      if (s.bossRemaining <= 0) { this.failBoss(); return; }
    }
    if (s.spatialCompressorUnlocked && !s.challengeArena && !isBossBlock(s.block) && s.block < C.blockCount - 1 && this.currentStones().length / (s.size * s.size) <= 0.05) {
      this.compressSpace();
      return;
    }
    this.advanceAlchemy(dt);
    if (s.autoCrystallizeEnabled && s.challenge3Completed) {
      s.autoCrystallizeClock += dt;
      while (s.autoCrystallizeClock >= 0.5) {
        s.autoCrystallizeClock -= 0.5;
        if (!this.crystallizeWater()) { s.autoCrystallizeClock = Math.min(s.autoCrystallizeClock, 0.5); break; }
      }
    } else s.autoCrystallizeClock = 0;
    this.advanceChallengeRegeneration(dt);
    if (s.challengeWon) return;
    if (s.alchemy.elementalizationEnabled && s.alchemy.air > 0) s.alchemy.air = Math.max(0, s.alchemy.air - dt);
    this.advanceProjectiles(dt);
    this.advanceBurning(dt);
    for (const stone of s.stones) if ((stone.damageFlash ?? 0) > 0) stone.damageFlash = Math.max(0, (stone.damageFlash ?? 0) - dt * 4);
    this.weapons.advanceAnimation(dt);
    s.clickBuffer = Math.max(0, s.clickBuffer - (C.clickBufferDrain + s.clickBuffer * C.clickBufferDecay) * dt);
    s.clickWindowTime += dt;
    while (s.clickWindowTime >= 1) {
      if (s.clickWindowCount >= C.clickHeatClicksPerSecond) s.clickHeat = Math.min(C.clickHeatThreshold, s.clickHeat + 1);
      else s.clickHeat = Math.max(0, s.clickHeat - C.clickHeatDecayPerSecond);
      s.clickWindowCount = 0; s.clickWindowTime -= 1;
    }
    if (s.buffRemaining > 0) s.buffRemaining = Math.max(0, s.buffRemaining - dt);
    if (s.earthOverloadRemaining > 0) s.earthOverloadRemaining = Math.max(0, s.earthOverloadRemaining - dt);
    if (s.artifactUnlocked && !(s.challengeArena && s.challengeNumber === 2)) {
      s.artifactClock += dt;
      while (s.artifactClock >= C.artifactInterval) { s.artifactClock -= C.artifactInterval; this.artifactTick(); }
    }
    const target = this.movement.target(s, this.currentStones());
    s.target = target ? { x: target.x, y: target.y } : null;
    const comboEnabled = ((s.weapon === 'pick' && s.combos.pick) || (s.weapon === 'spear' && s.combos.spear)) && s.challenge2Completed;
    const mining = !!target && Math.hypot(target.x - s.x, target.y - s.y) <= this.weapons.interactionRange(s);
    if (comboEnabled && !mining) {
      const chargeSpeed = this.weapons.speedMultiplier(s, s.weapon);
      if (s.weapon === 'pick') s.pickDashCharge = Math.min(1, s.pickDashCharge + dt * chargeSpeed / C.pickDashChargeSeconds);
      else s.spearDashCharge = Math.min(1, s.spearDashCharge + dt * chargeSpeed / C.spearDashChargeSeconds);
    }
    if (target) {
      if (s.tutorial === 'second' && s.block === 2 && target.kind === 'hard') s.tutorial = 'penetration';
      const distance = Math.hypot(target.x - s.x, target.y - s.y);
      const interactionRange = this.weapons.interactionRange(s);
      if (distance > interactionRange) this.movement.move(s, target.x, target.y, dt);
      const canAttack = s.auto || s.tutorial === 'click';
      if (canAttack && s.tutorial !== 'auto' && Math.hypot(target.x - s.x, target.y - s.y) <= interactionRange) {
        const attacks = this.weapons.tick(s, dt, this.weapons.speedMultiplier(s, s.weapon));
        for (let i = 0; i < attacks; i++) {
          const next = this.movement.target(s, this.currentStones());
          if (!next || Math.hypot(next.x - s.x, next.y - s.y) > interactionRange) break;
          const comboCadence = C.comboAttackCount - (s.cycleUpgrades.cycle6 ? 2 : 0);
          const pickCombo = s.weapon === 'pick' && s.challenge2Completed && s.combos.pick && (s.comboCounts.pick % comboCadence === comboCadence - 1 || s.pickDashCharge >= 1);
          const spearCombo = s.weapon === 'spear' && s.challenge2Completed && s.combos.spear && (s.comboCounts.spear % comboCadence === comboCadence - 1 || s.spearDashCharge >= 1);
          const pickDashPath = pickCombo ? this.pickDash(next) : null;
          if (spearCombo) this.spearWindup();
          const spearDashPath = spearCombo ? this.spearDash() : null;
          const impact = spearCombo ? this.movement.target(s, this.currentStones()) : next;
          if (!impact) continue;
          this.strike(impact, spearDashPath, pickDashPath);
          if (spearCombo) { s.attackClock = 0; break; }
          if (s.challengeArena && s.challengeWon) break;
        }
      }
      if (s.rangedUnlocked || s.needleUnlocked) {
        const speed = this.weapons.speedMultiplier(s, 'ranged');
        if (s.rangedWeapon === 'emitter') {
          s.needleRecheckClock = 0;
          const emitterAttacks = this.weapons.tick(s, dt, speed, 'ranged');
          s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + emitterAttacks);
          this.weapons.laser(s, this.currentStones(), dt, speed, (stone, damage) => this.hit(stone, damage, true, false, false, true, s.emitterPierceUpgrade, true, 0x51dce0));
        } else {
          this.weapons.stopBeam();
          const attacks = this.weapons.tick(s, dt, speed, 'ranged');
          for (let i = 0; i < attacks; i++) {
            if (!this.launchNeedle()) break;
            if (s.challenge2Completed) s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + 1);
          }
          s.needleRecheckClock += dt;
          if (s.needleRecheckClock >= C.needleRecheckInterval) {
            s.needleRecheckClock -= C.needleRecheckInterval;
            if (this.launchNeedle() && s.challenge2Completed) s.rangedBurstCharge = Math.min(C.rangedBurstMax, s.rangedBurstCharge + 1);
          }
        }
      }
      s.pickDash = false;
      if (s.needleAltUnlocked && s.needleUnlocked && s.rangedWeapon !== 'needle') {
      s.needleAltClock += dt * this.weapons.needleSpeedMultiplier(s) / (C.needleInterval * (s.cycleUpgrades.cycle2 ? 1 : C.needleAltIntervalMultiplier));
        while (s.needleAltClock >= 1 - 1e-9) { s.needleAltClock = Math.max(0, s.needleAltClock - 1); if (!this.launchNeedle()) break; }
      }
    } else {
      if (s.challengeArena && s.challengeNumber === 4) {
        this.weapons.stopBeam();
        this.movement.move(s, s.x, -0.5, dt);
        if (s.y <= -0.5) {
          if (s.block >= C.blockCount - 1) {
            this.completeChallenge(4);
            return;
          }
          s.block++;
          s.stones = [];
          for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
            const kind = standardChallengeKind(s.block, x, y, s.size);
            const hp = standardChallengeHp(kind, s.block) * s.challenge4StoneMultiplier;
            s.stones.push({ block: s.block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
          }
          this.rebuildIndex();
          s.x = Math.floor(s.size / 2);
          s.y = s.size - 0.5;
          s.target = null;
          s.projectiles = [];
          s.needleFollowUps = [];
        }
        return;
      }
      if (s.block === C.blockCount - 1 && this.currentStones().length === 0) {
        this.weapons.stopBeam();
        this.movement.move(s, s.x, -0.5, dt);
        if (s.y <= -0.5 && s.endChargeRemaining <= 0) {
          s.endChargeRemaining = C.finalChargeSeconds;
          s.message = 'Финальная граница. Зарядите пробивной удар.';
        }
        return;
      }
      this.weapons.stopBeam();
      this.movement.move(s, s.x, -0.5, dt);
      if (s.y <= -0.5) {
        const clearedBlock = s.block;
        s.block++;
        if (s.spectraUpgrades.skipLayers && isBossBlock(clearedBlock)) s.block = Math.min(C.blockCount - 1, s.block + 2);
        if (s.tutorial === 'third' && s.block >= 3) {
          s.tutorial = 'done';
          s.boundary = C.blockCount * s.size + C.boundaryHeadStart;
          s.message = 'Граница приближается. Продолжайте прорыв.';
        }
        s.furthestBlock = Math.max(s.furthestBlock, s.block);
        if (s.block % 5 === 0) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
        if (s.block >= C.blockCount) {
          this.completeRun();
        } else {
          s.bossRemaining = isBossBlock(s.block) ? C.bossTimerSeconds : 0;
          s.y = s.size - 0.5;
          s.target = null;
          s.projectiles = [];
          s.needleFollowUps = [];
        }
      }
    }
    if (s.boundary !== null && !s.challengeArena && s.bossRemaining <= 0 && s.block < C.blockCount - 1) {
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
    if (upgrade === 'pickOptimization') {
      if (!s.pickUnlocked || s.furthestBlock < 25 || s.challengeArena || s.pickAlchemyOptimized || s.ore < A.pickOptimizationCost.ore || s.alchemy.earth < A.pickOptimizationCost.earth || s.alchemy.water < A.pickOptimizationCost.water) return false;
      s.ore -= A.pickOptimizationCost.ore;
      s.alchemy.earth -= A.pickOptimizationCost.earth;
      s.alchemy.water -= A.pickOptimizationCost.water;
      s.pickAlchemyOptimized = true;
      s.message = 'Оптимизация кирки вернула расход Земли к норме.';
      return true;
    }
    if (upgrade === 'artifact') {
      if (s.artifactUnlocked || s.furthestBlock <= C.artifactUnlockBlock || s.crystals < C.costs.artifact) return false;
      s.crystals -= C.costs.artifact; s.artifactUnlocked = true; return true;
    }
    if (upgrade === 'expansion') {
      if (!s.completions || s.expansion >= C.maxExpansion || s.breakthrough < C.costs.expansion) return false;
      s.breakthrough -= C.costs.expansion; s.expansion++; s.message = 'Расширение применится в следующей попытке.'; return true;
    }
    if (upgrade === 'spatialCompressor') {
      if (s.spatialCompressorUnlocked || s.furthestBlock <= C.spatialCompressorUnlockBlock || s.challengeArena || s.ore < C.spatialCompressorCost) return false;
      s.ore -= C.spatialCompressorCost;
      s.spatialCompressorUnlocked = true;
      s.message = 'Сжиматель открыт навсегда и сработает при остатке породы ≤5%.';
      if (!s.challengeArena && !isBossBlock(s.block) && s.block < C.blockCount - 1 && this.currentStones().length / (s.size * s.size) <= 0.05) {
        this.compressSpace();
      }
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
      if (!s.auto || s.furthestBlock <= C.pickUnlockBlock || s.pickUnlocked || s.ore < C.costs.pick) return false;
      s.ore -= C.costs.pick; s.pickUnlocked = true; s.weapon = 'pick'; s.attackClock = 0; return true;
    }
    if (upgrade === 'spear') {
      if (s.spearUnlocked || s.furthestBlock <= C.spearUnlockBlock || s.ore < C.costs.spear || s.crystals < C.costs.spearCrystals) return false;
      s.ore -= C.costs.spear; s.crystals -= C.costs.spearCrystals; s.spearUnlocked = true; return true;
    }
    if (upgrade === 'fistCombo') {
      if (s.fistComboUnlocked || s.ore < C.costs.fistCombo) return false;
      s.ore -= C.costs.fistCombo; s.fistComboUnlocked = true; s.combos.fists = true;
      if (s.fistComboRadiusLevel === 0) s.fistComboRadiusLevel = 1;
      if (s.fistComboRadiusRewardedLevels < 1) { s.crystals++; s.fistComboRadiusRewardedLevels = 1; }
      return true;
    }
    if (upgrade === 'spearPierce') {
      if (!s.spearUnlocked || s.spearPierce || s.ore < C.costs.spearPierce) return false;
      s.ore -= C.costs.spearPierce; s.spearPierce = true; return true;
    }
    if (upgrade === 'spearEnchant') {
      if (!s.spearUnlocked || !s.challenge1Completed || s.spearEnchant || s.alchemy.air < A.spearEnchantUnlockAir) return false;
      s.alchemy.air -= A.spearEnchantUnlockAir; s.spearEnchant = true; return true;
    }
    if (upgrade === 'fistUnique') {
      if (!s.challenge1Completed || s.fistUniqueUpgrade || s.alchemy.earth < C.fistUniqueEarthCost) return false;
      s.alchemy.earth -= C.fistUniqueEarthCost; s.fistUniqueUpgrade = true; return true;
    }
    if (upgrade === 'pickInfinity') {
      if (!s.challenge1Completed || !s.pickUnlocked || s.pickInfinityEnchant || s.alchemy.earth < C.pickEnchantEarthCost) return false;
      s.alchemy.earth -= C.pickEnchantEarthCost; s.pickInfinityEnchant = true; return true;
    }
    if (upgrade === 'emitterPierce') {
      if (!s.challenge1Completed || !s.rangedUnlocked || s.emitterPierceUpgrade || s.alchemy.water < C.emitterPierceWaterCost) return false;
      s.alchemy.water -= C.emitterPierceWaterCost; s.emitterPierceUpgrade = true; return true;
    }
      if (upgrade === 'needleFire') {
      if (!this.alchemyNodeUnlocked('fire') || !s.needleUnlocked || s.needleFireUpgrade || s.alchemy.fire < C.needleFireUpgradeCost) return false;
      s.alchemy.fire -= C.needleFireUpgradeCost; s.needleFireUpgrade = true; return true;
    }
    if (upgrade === 'ranged') {
      if (!s.needleUnlocked || s.rangedUnlocked || s.furthestBlock <= C.rangedUnlockBlock || s.ore < C.costs.ranged) return false;
      s.ore -= C.costs.ranged; s.rangedUnlocked = true; return true;
    }
    if (upgrade === 'needle') {
      if (!s.auto || s.needleUnlocked || s.ore < C.costs.needle) return false;
      s.ore -= C.costs.needle; s.needleUnlocked = true;
      if (!s.rangedUnlocked) s.rangedWeapon = 'needle';
      return true;
    }
    if (upgrade === 'needleAlt') {
      if (!s.needleUnlocked || s.needleAltUnlocked || s.furthestBlock <= C.needleAltUnlockBlock || s.crystals < C.costs.needleAlt) return false;
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
    const level = upgrade === 'fistComboRadius' ? s.fistComboRadiusLevel : upgrade === 'spearDamage' ? s.spearLevel : upgrade === 'spearReach' ? s.spearReachLevel : upgrade === 'spearSpeed' ? s.spearSpeedLevel : upgrade === 'melee' ? s.fistLevel : upgrade === 'fistSpeed' ? s.fistSpeedLevel : upgrade === 'pickDamage' ? s.pickLevel : upgrade === 'pickSpeed' ? s.pickSpeedLevel : upgrade === 'rangedDamage' ? s.rangedLevel : upgrade === 'needleDamage' ? s.needleLevel : upgrade === 'needleSpeed' ? s.needleSpeedLevel : upgrade === 'emitterSpeed' ? s.emitterSpeedLevel : upgrade === 'fistFinisher' ? s.fistFinisherLevel : upgrade === 'pickReach' ? s.pickReachLevel : upgrade === 'needlePierce' ? s.needlePierceLevel : upgrade === 'emitterSpread' ? s.emitterSpreadLevel : upgrade === 'emitterArea' ? s.emitterAreaLevel : upgrade === 'beamSpeed' ? s.beamSpeedLevel : upgrade === 'movement' ? s.movementLevel : s.movementLevel;
    const meleeRadiusLevels = s.cycleUpgrades.cycle3 ? 2 : 0;
    if (upgrade === 'fistComboRadius' && (!s.fistComboUnlocked || level >= C.comboFistRadiusMaxLevel + meleeRadiusLevels || (level >= 3 && s.furthestBlock <= C.comboFistRadiusLevel4UnlockBlock))) return false;
    if ((upgrade === 'spearDamage' || upgrade === 'spearReach' || upgrade === 'spearSpeed') && (!s.spearUnlocked || (upgrade === 'spearReach' && level >= C.spearReachMaxLevel + meleeRadiusLevels))) return false;
    if (upgrade === 'pickDamage' && !s.pickUnlocked) return false;
    if (upgrade === 'pickSpeed' && !s.pickUnlocked) return false;
    if (upgrade === 'pickReach' && (!s.pickUnlocked || level >= C.pickReachMaxLevel + meleeRadiusLevels)) return false;
    if (upgrade === 'rangedDamage' && !s.rangedUnlocked) return false;
    if (upgrade === 'needleDamage' && !s.needleUnlocked) return false;
    if (upgrade === 'needleSpeed' && !s.needleUnlocked) return false;
    if (upgrade === 'emitterSpeed' && !s.rangedUnlocked) return false;
    if (upgrade === 'needlePierce' && (!s.needleUnlocked || level >= C.needlePierceMaxLevel)) return false;
    if (upgrade === 'emitterSpread' && (!s.rangedUnlocked || level >= C.emitterSpreadMaxLevel)) return false;
    if (upgrade === 'emitterArea' && (!s.rangedUnlocked || level >= C.emitterAreaMaxLevel)) return false;
    if (upgrade === 'beamSpeed' && !s.rangedUnlocked) return false;
    const cost = Math.ceil(upgradeOreCost(upgrade, level) * (s.cycleUpgrades.cycle16 ? 0.97 : 1));
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
    if (!this.state.paused && (weapon === 'fists' || (weapon === 'pick' && this.state.pickUnlocked) || (weapon === 'spear' && this.state.spearUnlocked) || (weapon === 'bombarda' && this.state.bombardaUnlocked))) { this.state.weapon = weapon; this.state.attackClock = 0; }
  }

  buyChallenge4Modifier(kind: 'stone' | 'damage' | 'range'): boolean {
    const s = this.state;
    if (s.paused || s.challengeArena || !this.challenge4Unlocked) return false;
    const costs = kind === 'stone' ? { earth: 1000, water: 100 } : kind === 'damage' ? { fire: 100, air: 50 } : { water: 500, air: 50 };
    if (kind === 'stone' && s.challenge4StoneMultiplier <= 0.401) return false;
    if (kind === 'damage' && s.challenge4DamageMultiplier >= 2) return false;
    if (kind === 'range' && s.challenge4RangeBonus >= 3) return false;
    if (s.alchemy.earth < (costs.earth ?? 0) || s.alchemy.water < (costs.water ?? 0) || s.alchemy.air < (costs.air ?? 0) || s.alchemy.fire < (costs.fire ?? 0)) return false;
    s.alchemy.earth -= costs.earth ?? 0;
    s.alchemy.water -= costs.water ?? 0;
    s.alchemy.air -= costs.air ?? 0;
    s.alchemy.fire -= costs.fire ?? 0;
    if (kind === 'stone') s.challenge4StoneMultiplier = Math.max(0.4, s.challenge4StoneMultiplier * 0.8);
    else if (kind === 'damage') s.challenge4DamageMultiplier = Math.min(2, s.challenge4DamageMultiplier + 0.25);
    else s.challenge4RangeBonus++;
    return true;
  }

  enterChallenge1(): boolean { return this.enterChallenge(1); }
  enterChallenge2(): boolean { return this.enterChallenge(2); }
  enterChallenge3(): boolean { return this.enterChallenge(3); }
  enterChallenge4(): boolean { return this.enterChallenge(4); }

  private enterChallenge(number: 1 | 2 | 3 | 4): boolean {
    const s = this.state;
    const unlocked = number === 1 ? this.challenge1Unlocked : number === 2 ? this.challenge2Unlocked : number === 3 ? this.challenge3Unlocked : this.challenge4Unlocked;
    if (s.paused || s.challengeArena || !unlocked || (number === 3 && s.alchemy.air < 1) || s.endChargeRemaining > 0 || this.finalWallEffect) return false;
    s.challengeReturnStones = s.stones;
    s.challengeReturnSize = s.size;
    s.challengeReturnBlock = s.block;
    s.challengeReturnX = s.x;
    s.challengeReturnY = s.y;
    s.challengeReturnBossRemaining = s.bossRemaining;
    s.challengeReturnEndChargeRemaining = s.endChargeRemaining;
    s.bossRemaining = 0;
    s.endChargeRemaining = 0;
    if (number === 3) {
      const seed = CHALLENGE_RULES[3].alchemySeed;
      s.alchemy.stone += seed.stone ?? 0;
      s.alchemy.earth += seed.earth ?? 0;
      s.alchemy.elementalStone += seed.elementalStone ?? 0;
      s.alchemy.water += seed.water ?? 0;
      s.challenge3Transmuted = 0;
      s.challenge3WaterProduced = false;
      s.challenge3AirProduced = false;
      s.alchemy.earthEnabled = true;
      s.alchemy.waterEnabled = true;
      s.alchemy.airProductionEnabled = true;
    }
    s.challengeRegenClock = 0;
    s.stones = [];
    const rules = CHALLENGE_RULES[number];
    s.size = rules.size;
    s.block = 0;
    s.challengeArena = true;
    s.challengeNumber = number;
    s.challengeWon = false;
    s.challengeFailed = false;
    s.challengeRemaining = rules.durationSeconds;
    // Fists get their special area strike in Challenge 2 even though regular weapon splash is off.
    if (number === 2) s.combos.fists = true;
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      const kind: StoneKind = number === 4 ? standardChallengeKind(s.block, x, y, s.size) : 'stone';
      const hp = (number === 4 ? standardChallengeHp(kind, s.block) : stoneMaxHp(kind, C.blockCount - 1)) * rules.stoneMultiplier * (number === 4 ? s.challenge4StoneMultiplier : 1);
      s.stones.push({ block: s.block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
    }
    this.rebuildIndex();
    s.x = Math.floor(s.size / 2); s.y = s.size; s.target = null; s.attackClock = 0;
    s.comboCounts = { fists: 0, pick: 0, spear: 0 };
    this.challengeTransition = { type: 'enter', number, elapsed: 0 };
    return true;
  }

  leaveChallenge1(): boolean {
    const s = this.state;
    if (!s.challengeArena) return false;
    const number = s.challengeNumber;
    this.challengeTransition = { type: 'exit', number, elapsed: 0, success: s.challengeWon && !s.challengeFailed };
    s.stones = s.challengeReturnStones ?? [];
    s.challengeReturnStones = null;
    s.size = s.challengeReturnSize ?? C.blockSize + s.expansion;
    s.block = s.challengeReturnBlock ?? s.block;
    s.x = s.challengeReturnX ?? Math.floor(s.size / 2);
    s.y = s.challengeReturnY ?? s.size - 0.5;
    if (s.challengeReturnAlchemy) {
      s.alchemy = s.challengeReturnAlchemy;
      s.challengeReturnAlchemy = null;
    }
    if (number === 3 && s.challenge3Completed) {
      s.alchemy.earthEnabled = true;
      s.alchemy.waterEnabled = true;
      s.alchemy.airProductionEnabled = true;
      s.alchemy.elementalizationEnabled = true;
    }
    s.bossRemaining = s.challengeReturnBossRemaining ?? 0;
    s.endChargeRemaining = s.challengeReturnEndChargeRemaining ?? 0;
    s.challengeReturnBossRemaining = null;
    s.challengeReturnEndChargeRemaining = null;
    if (number === 2 && !s.fistComboUnlocked) s.combos.fists = false;
    if (number === 4) { s.challenge4StoneMultiplier = 1; s.challenge4DamageMultiplier = 1; s.challenge4RangeBonus = 0; }
    s.challengeReturnSize = s.challengeReturnBlock = s.challengeReturnX = s.challengeReturnY = null;
    s.challengeArena = false; s.challengeWon = false; s.challengeFailed = false; s.challengeRemaining = 0; s.challengeNumber = 1; s.target = null;
    s.challenge3Transmuted = 0; s.challenge3WaterProduced = false; s.challenge3AirProduced = false;
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

  fireRangedBurst(): boolean {
    const s = this.state;
    if (s.paused || !s.challenge2Completed || s.rangedBurstCharge < 1) return false;
    const shots = Math.min(C.rangedBurstMax, Math.floor(s.rangedBurstCharge));
    if (s.rangedWeapon === 'needle') {
      let fired = 0;
      while (fired < shots && this.launchNeedle()) fired++;
      if (!fired) return false;
      s.rangedBurstCharge -= fired;
      return true;
    }
    const target = this.weapons.rangedTarget(s, this.currentStones());
    if (!target) return false;
    const radius = s.challengeArena && !CHALLENGE_RULES[s.challengeNumber].weaponSplash ? 0 : C.rangedBlastRadius + s.emitterAreaLevel;
    const baseDamage = (C.rangedDamage + s.rangedLevel * C.rangedDamagePerLevel) * shots * (s.cycleUpgrades.cycle5 ? 1.5 : 1);
    for (const stone of [...this.currentStones()]) {
      const distance = Math.hypot(stone.x - target.x, stone.y - target.y);
      if (distance > radius) continue;
      const t = distance / (radius + 1);
      const falloff = distance === 0 ? 1 : Math.max(0, 1 - t * t * (3 - 2 * t));
      this.hit(stone, baseDamage * falloff, true, false, false, true, s.emitterPierceUpgrade, true);
    }
    s.rangedBurstCharge -= shots;
    return true;
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
