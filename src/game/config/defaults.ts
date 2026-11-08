import type { FrameworkConfig, WeaponConfig } from './schema';

/** Настраиваемый баланс работающей версии каркаса. */
function weapon(overrides: Partial<WeaponConfig> = {}): WeaponConfig {
  return { enabled: true, damageCategory: 'melee', damage: 2, attackIntervalSeconds: 0.55, interactionRange: 1, attackSpeedPower: 1, attackSpeedFlatBonus: 0,
    maxAttacksPerTick: 100, armorPenetration: 0, elementalPenetration: 0,
    area: { shape: 'single', center: 'character', radius: 0, arcDegrees: 360, falloffExponent: 1, edgeDamageMultiplier: 1, splashDamageMultiplier: 1 },
    combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 2, extraRadius: 1, dashDistance: 0 },
    projectile: { speed: 20, count: 1, spread: 0, pierce: 0, burnSeconds: 0, burnDamageFraction: 0 },
    beam: { travelSpeed: 6, retargetSeconds: 0.8, searchRadiusMultiplier: 2 },
    animation: { swingSeconds: 0.32, chargedSeconds: 0.5, impactEffect: true, trailEffect: true }, ...overrides };
}

export const DEFAULT_CONFIG: FrameworkConfig = {
  simulation: { stepSeconds: 1 / 60, maxStepsPerFrame: 10, offlineProgress: false, maxOfflineSeconds: 3600 },
  modules: { gameplay: false, movement: true, weapons: true, alchemy: true, upgrades: true, challenges: false, artifacts: false },
  world: { width: 25, height: 25, layers: 50, expansionPerLevel: 1, maxExpansion: 3,
    stoneHealth: 3, hardHealth: 7, elementalHealth: 12, hardSplashMultiplier: 0.15,
    hpGrowthLinear: 1.5, hpGrowthFraction: 0.01, hpGrowthEveryLayers: 2,
    oreRewardByKind: { stone: 1, hard: 3, elemental: 4 }, oreRewardLinear: 0.5, oreRewardFraction: 0.01,
    postBossHealthMultiplier: 2, postBossCompensationLayers: 2,
    mineralNoiseScale: 6, mineralNoiseOffsetX: 0.37, mineralNoiseOffsetY: 0.61,
    hardMineralSeed: 42, elementalMineralSeed: 117, hardMineralThreshold: 0.32, bossHardThreshold: 0.02,
    elementalMineralThreshold: 0.32, elementalRampStartThreshold: 0.62, elementalBossThreshold: -0.72,
    hardMineralFirstLayer: 2, elementalMineralFirstLayer: 19, elementalMineralFullLayer: 29,
    bossEveryLayers: 5, bossHealthMultiplier: 3, bossTimeSeconds: 60, boundaryEnabled: true, boundarySpeed: 1,
    compressorEnabled: true, compressorRemainingFraction: 0.05, compressorUnlockLayer: 40, compressorCost: 150000, finalChargeSeconds: 5 },
  characters: { maxCount: 8, baseMovementSpeed: 2.5, baseAttackSpeed: 1, spawnX: 12, spawnY: 25 },
  movement: { strategy: 'nearest', stopDistance: 1, retargetSeconds: 0.25, diagonal: true, collision: true },
  weapons: {
    fists: weapon({ damage: 2, interactionRange: 1.25, combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 1, extraRadius: 2, dashDistance: 0 } }),
    pick: weapon({ damage: 3, attackIntervalSeconds: 0.38, interactionRange: 1.4, attackSpeedPower: 0.8, attackSpeedFlatBonus: 0.05, area: { shape: 'arc', center: 'character', radius: 2, arcDegrees: 210, falloffExponent: 1.5, falloffStartDistance: 1.05, edgeDamageMultiplier: 0.25, splashDamageMultiplier: 1 }, combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 3, extraRadius: 3, dashDistance: 3 } }),
    spear: weapon({ damage: 8, attackIntervalSeconds: 0.5133333333, interactionRange: 1.5, attackSpeedPower: 0.8, attackSpeedFlatBonus: 0.05, area: { shape: 'circle', center: 'character', radius: 4, arcDegrees: 360, falloffExponent: 1, edgeDamageMultiplier: 0.35, splashDamageMultiplier: 1 }, combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 1, extraRadius: 0, dashDistance: 8 } }),
    needle: weapon({ damageCategory: 'ranged', damage: 1.2, attackIntervalSeconds: 0.45, maxAttacksPerTick: 1000, projectile: { speed: 20, attackSpeedPower: 0.5, count: 1, spread: 1, pierce: 0, burnSeconds: 0, burnDamageFraction: 0.08 } }),
    emitter: weapon({ damageCategory: 'ranged', damage: 1.6, attackIntervalSeconds: 1.8, area: { shape: 'circle', center: 'target', radius: 1, arcDegrees: 360, falloffExponent: 2, edgeDamageMultiplier: 0.5, splashDamageMultiplier: 0.5 } }),
    bombarda: weapon({ damageCategory: 'ranged', damage: 1.6, attackIntervalSeconds: 0.38, interactionRange: 4,
      attackSpeedPower: 0.8, attackSpeedFlatBonus: 0.05,
      area: { shape: 'circle', center: 'target', radius: 3, arcDegrees: 360, falloffExponent: 1, falloffCurve: 'smoothstep', edgeDamageMultiplier: 0.35, splashDamageMultiplier: 1 },
      combo: { enabled: true, attacksRequired: 5, cooldownMultiplier: 1, damageMultiplier: 1.5, extraRadius: -2, dashDistance: 0 },
      projectile: { speed: 12, attackSpeedPower: 1.5, count: 1, spread: 0, pierce: 0, burnSeconds: 0, burnDamageFraction: 0 } }),
  },
  alchemy: { unlockCosts: { water: { ore: 5000, earth: 100 } }, resources: {
    ore: { amount: 0, capacity: null }, crystals: { amount: 0, capacity: null }, breakthrough: { amount: 0, capacity: null },
    stone: { amount: 0, capacity: 10000 }, elementalStone: { amount: 0, capacity: 10000 },
    earth: { amount: 0, capacity: 2000 }, water: { amount: 0, capacity: 100 }, air: { amount: 0, capacity: 100 }, fire: { amount: 0, capacity: 100 },
  }, recipes: {
    earth: { id: 'alchemy.earth', enabled: true, passive: true, intervalSeconds: 0.2, maxTicksPerUpdate: 100, mode: 'fractional', source: 'stone', fraction: 0.1, minimumUnits: 1, inputsPerUnit: { stone: 1 }, outputsPerUnit: { earth: 1 }, requiredBalance: {}, overflow: 'block' },
    water: { id: 'alchemy.water', enabled: true, passive: true, intervalSeconds: 2, maxTicksPerUpdate: 100, mode: 'fractional', source: 'earth', fraction: 0.1, minimumUnits: 1, inputsPerUnit: { earth: 1, elementalStone: 2 }, outputsPerUnit: { water: 1 }, requiredBalance: {}, overflow: 'block' },
    air: { id: 'alchemy.air', enabled: true, passive: true, intervalSeconds: 1, maxTicksPerUpdate: 100, mode: 'fractional', source: 'water', fraction: 0.01, minimumUnits: 0, inputsPerUnit: { water: 1 }, outputsPerUnit: { air: 1 }, requiredBalance: {}, overflow: 'clamp' },
    fire: { id: 'alchemy.fire', enabled: true, passive: true, intervalSeconds: 3, maxTicksPerUpdate: 100, mode: 'fractional', source: 'air', fraction: 0.01, minimumUnits: 0, inputsPerUnit: { air: 1 }, outputsPerUnit: { fire: 1 }, requiredBalance: {}, overflow: 'clamp' },
    vulcanization: { id: 'alchemy.vulcanization', enabled: false, intervalSeconds: 2, maxTicksPerUpdate: 10, mode: 'fixed', source: 'fire', fraction: 0, minimumUnits: 0, speedSourceAmount: 20, minimumIntervalSeconds: 0.1,
      inputsPerUnit: { fire: 0.2, air: 0.4, water: 2 }, outputsPerUnit: { stone: 22, elementalStone: 13 }, requiredBalance: {}, overflow: 'block' },
    decomposition: { id: 'alchemy.decomposition', enabled: false, intervalSeconds: 2, maxTicksPerUpdate: 10, mode: 'fixed', source: 'elementalStone', fraction: 0, minimumUnits: 0, speedSourceAmount: 100, minimumIntervalSeconds: 0.1,
      inputsPerUnit: { elementalStone: 10 }, outputsPerUnit: { stone: 20, earth: 20, water: 2, air: 2, fire: 0.2 }, requiredBalance: {}, overflow: 'block' },
  }, actions: { crystallize: { enabled: true, cost: { water: 100 }, reward: { crystals: 1 } } },
    buffs: { earthDamageMultiplier: 2, earthPerHit: 2, elementalizationChance: 0.5, airPerSecond: 1,
      overloadSeconds: 1800, overloadUpgradeCost: { water: 200, ore: 50000 }, fireReactionUnlockCosts: { vulcanization: { water: 200, ore: 50000 }, decomposition: { water: 200, ore: 50000 } } } },
  progression: { breakthroughPerCompletion: 1, resetOre: true, resetAlchemy: true, retainCrystals: true, retainUpgrades: true },
  input: { clickBufferCapacity: 30, clickGainPerPress: 10, clickFlatDecayPerSecond: 3, clickFractionDecayPerSecond: 0.2, miningSpeedBonus: 0.3, movementSpeedBonus: 0.4, emitterSpeedMaxBonus: 0.75 },
  artifacts: { enabled: true, adjacentMaps: 1, neighborhoodRadius: 2, isolationMultiplier: 4, tickSeconds: 1 },
  challenges: {
    one: { enabled: true, width: 50, height: 50, timeLimitSeconds: 60, stoneHealthMultiplier: 4, regenerationFractionPerSecond: 0, allowSplash: true, allowArtifacts: true },
    two: { enabled: true, width: 20, height: 20, timeLimitSeconds: 30, stoneHealthMultiplier: 4, regenerationFractionPerSecond: 0, allowSplash: false, allowArtifacts: false },
    three: { enabled: true, width: 50, height: 50, timeLimitSeconds: null, stoneHealthMultiplier: 1, regenerationFractionPerSecond: 0.3, allowSplash: true, allowArtifacts: true },
    four: { enabled: true, width: 25, height: 25, timeLimitSeconds: null, stoneHealthMultiplier: 3, regenerationFractionPerSecond: 0.05, allowSplash: true, allowArtifacts: true },
  },
  presentation: { showDamage: true, showPredictions: true, animationSpeed: 1, particlesEnabled: true, palettesEnabled: true },
  saving: { enabled: true, autosaveSeconds: 5, schemaVersion: 1 },
};
