import { isCycleUpgradeActive } from '../framework/adapters/breachCycleEffects';
import { BREACH_CONFIG as C } from './breachConfig';
import type { BreachState, RangedWeaponId, Stone, StoneKind, WeaponId } from './breachTypes';
import { NearestStoneMovement } from './movement';
import { Weapons } from './weapons';
import { stoneNoise } from './stoneNoise';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, freshAlchemyState } from './alchemy';
import type { AlchemyNode, AlchemyResource, AlchemySwitch, AlchemyUpgrade } from './alchemy';
import { CHALLENGE_RULES, CHALLENGE_UPGRADE_RESTRICTIONS } from './challengeConfig';
import { BreachAlchemyProduction } from '../framework/adapters/breachAlchemyProduction';
import { BreachAlchemyEffects } from '../framework/adapters/breachAlchemyEffects';
import type { BreachAlchemyHost } from '../framework/adapters/breachAlchemyProduction';
import type { AlchemyProduction } from '../framework/alchemy/contracts';
import { BreachWorldRules } from '../framework/world/breachWorld';
import { BreachDamagePolicy } from '../framework/combat/breachDamage';
import { BREACH_REPEATABLES, BreachRepeatableShop } from '../framework/adapters/breachRepeatableShop';
import { BREACH_CHALLENGE_REWARDS, BreachChallengeRewards } from '../framework/adapters/breachChallengeRewards';
import { BreachMiningRewards } from '../framework/adapters/breachMiningRewards';
import { BreachNeedleProjectiles } from '../framework/adapters/breachNeedleProjectiles';
import type { NeedleProjectiles } from '../framework/adapters/breachNeedleProjectiles';
import { BreachIsolationArtifact } from '../framework/adapters/breachArtifact';
import { BreachInputBuffer } from '../framework/adapters/breachInputBuffer';
import { BreachChallenges } from '../framework/adapters/breachChallenges';
import { BreachRunLifecycle } from '../framework/adapters/breachRunLifecycle';
import { BreachProgression } from '../framework/adapters/breachProgression';
import { BreachWorldAccess } from '../framework/adapters/breachWorldAccess';
import { BreachCombat } from '../framework/adapters/breachCombat';
import type { BreachHitProcessor } from '../framework/adapters/breachCombat';
import { areaDistance, selectItemsInArea } from '../framework/world/area';
import { BreachMeleeDash } from '../framework/adapters/weapons/dash';
import { BreachAutonomousWeaponController, BreachControlledWeaponController } from '../framework/adapters/weapons/controllers';
import type { BreachWeaponControllerHost } from '../framework/adapters/weapons/controllers';
import { BreachRuntimeBus } from '../framework/adapters/breachRuntimeBus';
import { clearUpgradeSuppression } from '../framework/upgrades/upgradeModule';
import { isSpecialUpgradeActive } from '../framework/adapters/breachSpecialUpgrades';
import { isAlchemyUpgradeActive } from '../framework/adapters/breachAlchemyUpgrades';

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

const worldRules = new BreachWorldRules(C, stoneNoise);
const damagePolicy = new BreachDamagePolicy({ hardSplashMultiplier: C.hardSplashDamageMultiplier, elementalResistance: C.elementalMultiplier,
  elementalPierceEfficiency: C.elementalPierceEfficiency, earthPerStone: A.pickEarthPerStone, unoptimizedEarthMultiplier: 5,
  earthDamageMultiplier: A.pickDamageMultiplier, stoneWeights: A.stoneWeight });
const stoneMaxHp = (kind: StoneKind, block: number, applyBossScale = true): number => worldRules.stoneHealth(kind, block, applyBossScale);
const standardChallengeHp = (kind: StoneKind, block: number): number => worldRules.challengeHealth(kind, block);
const standardChallengeKind = (block: number, x: number, y: number, size: number): StoneKind => worldRules.stoneKind(block, x, y, size, { tutorial: false, bosses: false });
const isBossBlock = (block: number): boolean => worldRules.isBoss(block);
const oreReward = (kind: StoneKind, block: number): number => worldRules.oreReward(kind, block);

function freshState(): BreachState {
  return {
    version: 1, balanceVersion: 5, alchemy: freshAlchemyState(), frameworkUpgradeEnabled: {}, frameworkUpgradeSuppressions: {}, paused: false, savedAt: Date.now(), tutorial: 'click', block: 0, furthestBlock: 0, size: C.blockSize,
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
  readonly bus: BreachRuntimeBus;
  private readonly repeatableShop = new BreachRepeatableShop(BREACH_REPEATABLES, upgradeOreCost, specialCrystalCost);
  private readonly challengeRewards = new BreachChallengeRewards(BREACH_CHALLENGE_REWARDS);
  private readonly alchemyProduction: AlchemyProduction;
  private readonly alchemyEffects: BreachAlchemyEffects;
  private readonly miningRewards: BreachMiningRewards;
  private readonly needleProjectiles: NeedleProjectiles;
  private readonly artifact: BreachIsolationArtifact;
  private readonly challenges: BreachChallenges;
  private readonly runLifecycle: BreachRunLifecycle;
  readonly world: BreachWorldAccess;
  private combat: BreachHitProcessor;
  private readonly meleeDash: BreachMeleeDash;
  private readonly clickBuffer = new BreachInputBuffer({ capacity: C.clickBufferCapacity, capacityUpgradeMultiplier: 1.1,
    flatDrain: C.clickBufferDrain, fractionDrain: C.clickBufferDecay, heatThreshold: C.clickHeatThreshold,
    clicksPerSecondForHeat: C.clickHeatClicksPerSecond, heatDecayPerSecond: C.clickHeatDecayPerSecond });
  private readonly movement = new NearestStoneMovement();
  readonly weapons = new Weapons();
  resetEffect: { stones: Stone[]; x: number; y: number; size: number; elapsed: number } | null = null;
  compressorEffect: { x: number; y: number; elapsed: number } | null = null;
  finalWallEffect: { elapsed: number } | null = null;
  challengeTransition: { type: 'enter' | 'exit' | 'result'; number: 1 | 2 | 3 | 4; elapsed: number; success?: boolean } | null = null;

  constructor(createAlchemyProduction: (host: BreachAlchemyHost) => AlchemyProduction = host => new BreachAlchemyProduction(host)) {
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
    this.meleeDash = new BreachMeleeDash({ state: this.state, stones: () => this.currentStones(),
      spearRadius: () => this.weapons.radius(this.state, 'spear'),
      clearBlocker: stone => this.hit(stone, stone.hp, false, false, true),
      showDash: path => this.weapons.dash(path.fromX, path.fromY, path.toX, path.toY),
      canDash: () => !this.state.paused && this.bus.isEnabled('movement'),
      teleport: (x, y) => this.bus.invoke('movement', { type: 'teleport', payload: { characterId: 'main', x, y } }),
    });
    this.world = new BreachWorldAccess(this.state, C.blockCount);
    this.combat = new BreachCombat({ state: this.state, canHit: stone => this.weapons.canHit(this.state, stone),
      armorPenetration: () => this.resolveStat(0, 'weapon.armorPenetration'), earthUnlocked: () => this.bus.isEnabled('alchemy') && this.alchemyNodeUnlocked('earth'),
      destroy: stone => this.destroy(stone),
    }, damagePolicy);
    this.runLifecycle = new BreachRunLifecycle({ state: this.state, createMap: () => this.createMap(),
      beginResetEffect: () => { const s = this.state; this.resetEffect = { stones: this.currentStones().map(stone => ({ ...stone })), x: s.x, y: s.y, size: s.size, elapsed: 0 }; },
      beginCompressorEffect: (x, y) => { this.compressorEffect = { x, y, elapsed: 0 }; },
      stopBeam: () => this.weapons.stopBeam(), isBoss: isBossBlock, waterCapacity: () => this.alchemyLimit('water'),
    });
    this.challenges = new BreachChallenges({ state: this.state,
      unlocked: number => number === 1 ? this.challenge1Unlocked : number === 2 ? this.challenge2Unlocked : number === 3 ? this.challenge3Unlocked : this.challenge4Unlocked,
      finalWallActive: () => this.finalWallEffect !== null, rebuildIndex: () => this.rebuildIndex(), addStones: stones => this.world.addStones(stones),
      setTransition: transition => { this.challengeTransition = transition; }, stoneHealth: stoneMaxHp,
      challengeHealth: standardChallengeHp, challengeKind: standardChallengeKind, random: () => Math.random(),
      applyUpgradeRestriction: number => {
        const rule = CHALLENGE_UPGRADE_RESTRICTIONS[number];
        return !rule || this.bus.invoke('upgrades', { type: 'set-suppression', payload: { source: `challenge:${number}`, ...rule } });
      },
      clearUpgradeRestriction: number => { clearUpgradeSuppression(this.bus, `challenge:${number}`); },
    });
    this.artifact = new BreachIsolationArtifact({ state: this.state,
      nearbyStones: (block, radius) => this.world.nearbyBlocks(block, radius),
      meleeDamage: () => this.weapons.currentMeleeDamage(this.state),
      hit: (stone, damage) => this.hit(stone, damage, false, false, false, false, false, false, 0xb88cff),
    }, { adjacentBlocks: C.artifactBlockRadius, damageMultiplier: C.artifactDamage,
      isolationBonus: C.artifactIsolationBonus, neighborhoodSize: 24, isolationExponent: 4 });
    this.needleProjectiles = new BreachNeedleProjectiles({ state: this.state,
      stones: () => this.currentStones(), getStone: (block, x, y) => this.world.getStone(block, x, y),
      fireActive: () => this.fireNeedleActive, canHit: stone => this.weapons.canHit(this.state, stone),
      currentMeleeDamage: () => this.weapons.currentMeleeDamage(this.state),
      baseDamage: () => this.weapons.baseDamage(this.state, 'needle'),
      rangedMultiplier: () => this.weapons.damageMultiplier(this.state, 'ranged'),
      pierceLevel: () => this.weapons.upgradeLevel('needlePierce', this.state.needlePierceLevel),
      hit: (stone, damage, pierce) => this.hit(stone, damage, true, false, false, false, pierce, false, pierce ? 0xff762e : 0xffc66e),
      random: () => Math.random(),
    });
    this.miningRewards = new BreachMiningRewards({ state: this.state, random: () => Math.random(),
      fireUnlocked: () => this.alchemyNodeUnlocked('fire'), fireCapacity: () => this.alchemyLimit('fire'),
      isBoss: isBossBlock, oreReward, remainingStones: () => this.currentStones().length,
      completeChallenge3: () => this.completeChallenge(3),
      elementalizationActive: () => this.bus.isEnabled('alchemy') && this.state.alchemy.elementalizationEnabled && this.state.alchemy.air > 0,
    }, { stoneWeights: A.stoneWeight, elementalCrystalChance: C.elementalCrystalDropChance,
      repeatableUnlockFraction: C.repeatableUnlockFraction, elementalizationChance: 0.5 });
    this.alchemyProduction = createAlchemyProduction({
      state: this.state,
      isResetting: () => this.resetEffect !== null,
      isUnlocked: node => this.alchemyNodeUnlocked(node),
    });
    this.alchemyEffects = new BreachAlchemyEffects({ state: this.state, crystallize: () => this.bus.invoke('alchemy', { type: 'crystallize', payload: null }) });
    if (saved) {
      const defaults = freshState();
      saved.frameworkUpgradeEnabled ??= {};
      saved.frameworkUpgradeSuppressions ??= {};
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
    const weaponHost: BreachWeaponControllerHost = {
      state: this.state, weapons: this.weapons, stones: () => this.currentStones(),
      target: () => this.movement.target(this.state, this.currentStones()),
      move: (x, y, seconds) => this.move(x, y, seconds),
      strike: (target, spear, pick) => this.strike(target, spear, pick),
      spearWindup: () => this.spearWindup(), spearDash: () => this.spearDash(), pickDash: target => this.pickDash(target),
      launchNeedle: () => this.launchNeedle(),
      laserHit: (stone, damage) => this.hit(stone, damage, true, false, false, true, isSpecialUpgradeActive(this.state, 'emitterPierce'), true, 0x51dce0),
    };
    const controlledWeapon = new BreachControlledWeaponController(weaponHost);
    const autonomousWeapon = new BreachAutonomousWeaponController(weaponHost);
    const progression = new BreachProgression({ state: this.state, remainingStones: () => this.currentStones().length,
      isBoss: isBossBlock, move: (x, y, seconds) => this.move(x, y, seconds), stopBeam: () => this.weapons.stopBeam(),
      rebuildIndex: () => this.rebuildIndex(), challengeKind: standardChallengeKind, challengeHealth: standardChallengeHp,
      completeChallenge4: () => this.completeChallenge(4), completeRun: () => this.completeRun(),
      fail: () => this.fail(), failBoss: () => this.failBoss(), compress: () => this.compressSpace(),
    });
    this.bus = new BreachRuntimeBus({ state: this.state, world: this.world, step: seconds => this.step(seconds),
      hit: (stone, amount, options) => this.combat.hit(stone, amount, options),
      move: (x, y, seconds) => this.movement.move(this.state, x, y, seconds),
      teleport: (x, y) => { this.state.x = x; this.state.y = y; },
      tickControlledWeapon: (seconds, target) => controlledWeapon.tick(seconds, target),
      tickAutonomousWeapon: (seconds, target) => autonomousWeapon.tick(seconds, target),
      tickProjectiles: seconds => { this.advanceProjectiles(seconds); this.advanceBurning(seconds); },
      tickArtifact: seconds => this.artifact.advance(seconds),
      click: () => this.applyClick(), tickInput: seconds => this.clickBuffer.tick(this.state, seconds),
      buy: id => this.buy(id as Upgrade), buyCycle: id => this.buyCycleUpgrade(id), buyAlchemy: id => this.buyAlchemyUpgrade(id),
      advanceAlchemy: seconds => this.advanceAlchemy(seconds),
      advanceAutoCrystallize: seconds => this.alchemyEffects.autoCrystallize(seconds),
      advanceAlchemyEffects: seconds => this.alchemyEffects.consumeElementalization(seconds),
      buySpectra: id => this.buySpectraUpgrade(id), unlockSpectra: () => this.buySpectraUnlock(),
      toggleAlchemy: name => this.toggleAlchemy(name), craftWater: () => this.craftWater(), crystallize: () => this.crystallizeWater(),
      toggleAutoCrystallize: () => this.toggleAutoCrystallize(), overload: () => this.startEarthOverload(),
      equip: weapon => {
        const s = this.state;
        const allowed = weapon === 'fists' || (weapon === 'pick' && s.pickUnlocked) || (weapon === 'spear' && s.spearUnlocked) || (weapon === 'bombarda' && s.bombardaUnlocked);
        if (allowed) this.equip(weapon);
        return allowed;
      },
      equipRanged: weapon => {
        const allowed = weapon === 'emitter' ? this.state.rangedUnlocked : this.state.needleUnlocked;
        if (allowed) this.equipRanged(weapon);
        return allowed;
      },
      burst: () => this.fireRangedBurst(), toggleCombo: () => {
        const s = this.state, weapon = s.weapon;
        if ((weapon !== 'fists' && weapon !== 'pick' && weapon !== 'spear') || !(weapon === 'fists' ? isSpecialUpgradeActive(s, 'fistCombo') || (s.challengeArena && s.challengeNumber === 2) : s.challenge2Completed)) return false;
        s.combos[weapon] = !s.combos[weapon];
        return true;
      },
      enterChallenge: number => this.enterChallenge(number), leaveChallenge: () => this.leaveChallenge1(),
      challengeModifier: kind => this.buyChallenge4Modifier(kind),
      tickChallengeTimer: seconds => this.challenges.advanceTimer(seconds),
      tickChallengeRegeneration: seconds => this.challenges.regenerate(seconds),
      tickProgression: (kind, seconds) => {
        if (kind === 'boss') return progression.tickBoss(seconds);
        if (kind === 'compress') return progression.compressIfReady();
        if (kind === 'cleared') return progression.tickCleared(seconds);
        progression.tickBoundary(seconds); return false;
      },
    });
    const resolveUpgradeStat = (base: number, key: string): number => {
      const value = this.bus.query('upgrades', { type: 'stat', payload: { base, keys: [key] } });
      return typeof value === 'number' && Number.isFinite(value) ? value : base;
    };
    this.movement.setUpgradeResolver(resolveUpgradeStat);
    this.weapons.setAreaDamageResolver((state, stones, area, damage, hit) => {
      if (stones === this.currentStones()) return this.world.damageArea(state.block, area, damage, hit);
      // Внешние вызовы могут передавать собственную выборку, не принадлежащую карте забега.
      for (const stone of selectItemsInArea(stones, area, item => item)) {
        const amount = damage(stone, areaDistance(area, stone));
        if (amount > 0) hit(stone, amount);
      }
    });
    this.weapons.setUpgradeResolver(
      resolveUpgradeStat,
      id => {
        const status = this.bus.query('upgrades', { type: 'status', payload: id }) as { active: boolean; level: number } | undefined;
        return status?.active ? status.level : 0;
      },
    );
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

  private rebuildIndex(): void { this.world.rebuild(); }
  currentStones(): readonly Stone[] { return this.world.stonesInBlock(this.state.block); }
  private move(x: number, y: number, seconds: number): void {
    this.bus.invoke('movement', { type: 'move', payload: { characterId: 'main', x, y, seconds } });
  }
  private progressionStep(kind: 'boss' | 'compress' | 'cleared', seconds: number): boolean {
    if (!this.bus.invoke('progression', { type: kind, payload: seconds })) return false;
    return this.bus.query('progression', { type: 'stopped', payload: null }) === true;
  }
  alchemyLimit(resource: 'earth' | 'water' | 'air' | 'fire'): number {
    return alchemyCapacity(this.state.alchemy, resource, id => isAlchemyUpgradeActive(this.state, id));
  }
  private resolveStat(base: number, key: string): number {
    const value = this.bus.query('upgrades', { type: 'stat', payload: { base, keys: [key] } });
    return typeof value === 'number' && Number.isFinite(value) ? value : base;
  }

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

  private get fireNeedleActive(): boolean { return this.alchemyNodeUnlocked('fire') && isSpecialUpgradeActive(this.state, 'needleFire'); }

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
    if (id === 'cycle7') s.alchemy.water = Math.min(Math.max(this.alchemyLimit('water'), s.alchemy.water), s.alchemy.water + 100);
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
    return this.alchemyProduction.craftWater();
  }

  private advanceAlchemy(dt: number): void {
    this.alchemyProduction.tick(dt);
  }

  private createMap(): void {
    const s = this.state;
    s.size = C.blockSize + this.resolveStat(0, 'world.expansion');
    s.block = isCycleUpgradeActive(s, 'cycle4') ? C.bossEveryBlocks : 0;
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
    s.stones = worldRules.generate(s.size, s.tutorial !== 'done', !isCycleUpgradeActive(s, 'cycle8'));
    s.boundary = s.tutorial === 'done' ? C.blockCount * s.size + C.boundaryHeadStart : null;
    this.rebuildIndex();
  }

  private destroy(stone: Stone): void {
    const s = this.state;
    if (!this.world.removeStone(stone)) return;
    this.miningRewards.award(stone);
    if (!s.challengeArena && s.bossRemaining > 0 && this.currentStones().length === 0) {
      s.bossRemaining = 0;
      s.message = `Босс ${s.block + 1}-го квадрата повержен.`;
    }
    if (s.challengeArena && s.challengeNumber !== 3 && s.challengeNumber !== 4 && !s.stones.length && !s.challengeWon) this.completeChallenge(s.challengeNumber);
  }

  private completeChallenge(number: 1 | 2 | 3 | 4): void {
    const s = this.state;
    if (!this.challengeRewards.complete(s, number)) return;
    this.challengeTransition = { type: 'result', number, elapsed: 0, success: true };
  }

  private hit(stone: Stone, amount: number, weaponHit = true, earthHit = false, ignoreArmor = false, area = false, windPierce = false, splash = area, flashColor = 0xe7c37c): void {
    this.bus.invoke('combat', { type: 'hit', payload: { stone, amount,
      options: { weaponHit, earthHit, ignoreArmor, splash, elementalPierce: windPierce, flashColor } } });
  }

  replaceCombat(combat: BreachHitProcessor): void { this.combat = combat; }

  private strike(target: Stone, spearDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null, pickDashPath?: { fromX: number; fromY: number; toX: number; toY: number } | null): void {
    const s = this.state;
    this.weapons.strike(s, target, this.currentStones(), (stone, damage, area, splash) => {
      this.hitWithEquippedWeapon(stone, damage, area, splash);
    }, s.weapon, spearDashPath, pickDashPath);
  }

  private hitWithEquippedWeapon(stone: Stone, damage: number, area = false, splash = area): void {
    const s = this.state;
    const elementalPierce = stone.kind === 'elemental' && ((s.weapon === 'spear' && isSpecialUpgradeActive(s, 'spearEnchant')) || (s.weapon === 'pick' && isSpecialUpgradeActive(s, 'pickInfinity')) || (s.weapon === 'ranged' && s.rangedWeapon === 'emitter' && isSpecialUpgradeActive(s, 'emitterPierce')));
    const flashColor = s.weapon === 'spear' ? 0x64d7cc : s.weapon === 'pick' ? 0xf0a84c : s.weapon === 'fists' ? 0xf4d189 : s.rangedWeapon === 'emitter' ? 0x5ce1e4 : 0xffbd68;
    this.hit(stone, damage, true, s.weapon === 'pick' || s.weapon === 'fists' || s.weapon === 'spear', s.weapon === 'spear' && area && isSpecialUpgradeActive(s, 'spearPierce') && stone.kind !== 'elemental', area, elementalPierce, splash, flashColor);
  }

  private spearWindup(): void {
    this.weapons.spearWindup(this.state, this.currentStones(), (stone, damage) => this.hitWithEquippedWeapon(stone, damage, true, true));
  }

  private applyClick(): boolean {
    const s = this.state;
    if (s.paused || this.resetEffect) return false;
    this.clickBuffer.click(s);
    return true;
  }

  click(): void { this.bus.invoke('input', { type: 'click', payload: null }); }

  private spearDash(): { fromX: number; fromY: number; toX: number; toY: number } | null { return this.meleeDash.spear(); }
  private pickDash(target: Stone): { fromX: number; fromY: number; toX: number; toY: number } | null { return this.meleeDash.pick(target); }

  private launchNeedle(followTarget?: Stone): boolean { return this.needleProjectiles.launch(followTarget); }
  private advanceProjectiles(dt: number): void { this.needleProjectiles.tick(dt); }
  private advanceBurning(dt: number): void { this.needleProjectiles.tickBurning(dt); }

  private artifactTick(): void {
    this.artifact.tick();
  }

  private fail(): void { this.runLifecycle.fail(); }
  private failBoss(): void { this.runLifecycle.failBoss(); }
  private completeRun(): void { this.runLifecycle.complete(); }

  private advanceChallengeRegeneration(dt: number): void { this.bus.invoke('challenges', { type: 'regenerate', payload: dt }); }

  private compressSpace(): void { this.runLifecycle.compress(); }

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
    this.bus.invoke('challenges', { type: 'timer', payload: dt });
    if (s.challengeArena && s.challengeWon) return;
    if (this.progressionStep('boss', dt)) return;
    if (this.progressionStep('compress', dt)) return;
    this.bus.invoke('alchemy', { type: 'tick', payload: dt });
    this.bus.invoke('alchemy', { type: 'auto-crystallize-tick', payload: dt });
    this.advanceChallengeRegeneration(dt);
    if (s.challengeWon) return;
    this.bus.invoke('alchemy', { type: 'effects-tick', payload: dt });
    this.bus.invoke('projectiles', { type: 'tick', payload: dt });
    for (const stone of s.stones) if ((stone.damageFlash ?? 0) > 0) stone.damageFlash = Math.max(0, (stone.damageFlash ?? 0) - dt * 4);
    this.weapons.advanceAnimation(dt);
    this.bus.invoke('input', { type: 'tick', payload: dt });
    if (s.buffRemaining > 0) s.buffRemaining = Math.max(0, s.buffRemaining - dt);
    if (s.earthOverloadRemaining > 0) s.earthOverloadRemaining = Math.max(0, s.earthOverloadRemaining - dt);
    this.bus.invoke('artifact', { type: 'tick', payload: dt });
    const target = this.movement.target(s, this.currentStones());
    s.target = target ? { x: target.x, y: target.y } : null;
    this.bus.invoke('controlled-weapon', { type: 'tick', payload: { seconds: dt, target } });
    if (target) {
      this.bus.invoke('autonomous-weapon', { type: 'tick', payload: { seconds: dt, target } });
      s.pickDash = false;
    } else if (this.progressionStep('cleared', dt)) return;
    this.bus.invoke('progression', { type: 'boundary', payload: dt });
  }

  advance(seconds: number): void {
    if (this.state.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, C.offlineLimitSeconds);
    while (remaining > 0) {
      const dt = Math.min(remaining, C.simulationStep);
      this.bus.tick(dt);
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
      this.progressionStep('compress', 0);
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
    return this.repeatableShop.buy(s, upgrade);
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

  private enterChallenge(number: 1 | 2 | 3 | 4): boolean { return this.challenges.enter(number); }
  leaveChallenge1(): boolean { return this.challenges.leave(); }

  equipRanged(weapon: RangedWeaponId): void {
    if (!this.state.paused && ((weapon === 'emitter' && this.state.rangedUnlocked) || (weapon === 'needle' && this.state.needleUnlocked))) {
      this.state.rangedWeapon = weapon;
      this.weapons.stopBeam();
      this.state.rangedClock = 0;
    }
  }

  fireRangedBurst(): boolean {
    const s = this.state;
    if (s.paused || !this.bus.isEnabled('autonomous-weapon') || !s.challenge2Completed || s.rangedBurstCharge < 1) return false;
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
    const radius = s.challengeArena && !CHALLENGE_RULES[s.challengeNumber].weaponSplash ? 0 : this.weapons.radius(s, 'emitter');
    const baseDamage = this.weapons.baseDamage(s, 'emitter') * shots * this.weapons.damageMultiplier(s, 'ranged');
    this.world.damageArea(s.block, { shape: 'circle', center: target, radius }, (_stone, distance) => {
      const t = distance / (radius + 1);
      const falloff = distance === 0 ? 1 : Math.max(0, 1 - t * t * (3 - 2 * t));
      return distance > radius ? 0 : baseDamage * falloff;
    }, (stone, damage) => this.hit(stone, damage, true, false, false, true, isSpecialUpgradeActive(s, 'emitterPierce'), true));
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
