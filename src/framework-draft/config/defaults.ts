import type { FrameworkConfig, WeaponConfig } from './schema';

/** Пример настройки каркаса, а не точная копия текущего баланса. */
function weapon(overrides: Partial<WeaponConfig> = {}): WeaponConfig {
  return { enabled: true, damageCategory: 'melee', damage: 2, attackIntervalSeconds: 0.55, interactionRange: 1,
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
    stoneHealth: 3, hardHealth: 10, elementalHealth: 20, hardSplashMultiplier: 0.15,
    hpGrowthLinear: 1, hpGrowthFraction: 0.02, hpGrowthEveryLayers: 2, elementalFirstLayer: 20, elementalFullDensityLayer: 30,
    bossEveryLayers: 5, bossHealthMultiplier: 3, bossTimeSeconds: 60, boundaryEnabled: true, boundarySpeed: 1,
    compressorEnabled: true, compressorRemainingFraction: 0.05 },
  characters: { maxCount: 8, baseMovementSpeed: 2.5, baseAttackSpeed: 1, spawnX: 12, spawnY: 25 },
  movement: { strategy: 'nearest', stopDistance: 1, retargetSeconds: 0.25, diagonal: true, collision: true },
  weapons: {
    fists: weapon({ combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 1, extraRadius: 2, dashDistance: 0 } }),
    pick: weapon({ damage: 3, attackIntervalSeconds: 0.57, area: { shape: 'arc', center: 'character', radius: 2, arcDegrees: 210, falloffExponent: 1.5, edgeDamageMultiplier: 0.2, splashDamageMultiplier: 1 }, combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 3, extraRadius: 3, dashDistance: 3 } }),
    spear: weapon({ damage: 8, attackIntervalSeconds: 0.77, area: { shape: 'circle', center: 'character', radius: 4, arcDegrees: 360, falloffExponent: 1, edgeDamageMultiplier: 0.3, splashDamageMultiplier: 1 }, combo: { enabled: false, attacksRequired: 5, cooldownMultiplier: 2, damageMultiplier: 1, extraRadius: 0, dashDistance: 8 } }),
    needle: weapon({ damageCategory: 'ranged', damage: 1.2, attackIntervalSeconds: 0.45 }),
    emitter: weapon({ damageCategory: 'ranged', damage: 1.6, attackIntervalSeconds: 1.8, area: { shape: 'circle', center: 'target', radius: 1, arcDegrees: 360, falloffExponent: 2, edgeDamageMultiplier: 0.5, splashDamageMultiplier: 0.5 } }),
    bombarda: weapon({ damageCategory: 'ranged', damage: 1.6, attackIntervalSeconds: 1.8, area: { shape: 'circle', center: 'target', radius: 2, arcDegrees: 360, falloffExponent: 2, edgeDamageMultiplier: 0.3, splashDamageMultiplier: 1 } }),
  },
  alchemy: { resources: {
    ore: { amount: 0, capacity: null }, crystals: { amount: 0, capacity: null }, breakthrough: { amount: 0, capacity: null },
    stone: { amount: 0, capacity: null }, elementalStone: { amount: 0, capacity: null },
    earth: { amount: 0, capacity: 2000 }, water: { amount: 0, capacity: 100 }, air: { amount: 0, capacity: 100 }, fire: { amount: 0, capacity: 100 },
  }, recipes: {
    earth: { id: 'alchemy.earth', enabled: true, intervalSeconds: 0.2, maxTicksPerUpdate: 100, mode: 'fractional', source: 'stone', fraction: 0.1, minimumUnits: 1, inputsPerUnit: { stone: 1 }, outputsPerUnit: { earth: 1 }, requiredBalance: {}, overflow: 'block' },
    water: { id: 'alchemy.water', enabled: true, intervalSeconds: 2, maxTicksPerUpdate: 100, mode: 'fractional', source: 'earth', fraction: 0.1, minimumUnits: 1, inputsPerUnit: { earth: 1, elementalStone: 2 }, outputsPerUnit: { water: 1 }, requiredBalance: {}, overflow: 'block' },
    air: { id: 'alchemy.air', enabled: true, intervalSeconds: 2, maxTicksPerUpdate: 100, mode: 'fixed', source: null, fraction: 0, minimumUnits: 1, inputsPerUnit: { water: 2 }, outputsPerUnit: { air: 1 }, requiredBalance: {}, overflow: 'block' },
    fire: { id: 'alchemy.fire', enabled: true, intervalSeconds: 5, maxTicksPerUpdate: 100, mode: 'fixed', source: null, fraction: 0, minimumUnits: 1, inputsPerUnit: { earth: 100, air: 10 }, outputsPerUnit: { stone: 50, elementalStone: 10, earth: 100, water: 10, air: 10 }, requiredBalance: { fire: 1 }, overflow: 'clamp' },
  }, actions: { crystallize: { enabled: true, cost: { water: 100 }, reward: { crystals: 1 } } },
    buffs: { earthDamageMultiplier: 2, earthPerHit: 2, elementalizationChance: 0.5, airPerSecond: 1,
      overloadSeconds: 1800, overloadCost: { earth: 4000, water: 100 } } },
  progression: { breakthroughPerCompletion: 1, resetOre: true, resetAlchemy: true, retainCrystals: true, retainUpgrades: true },
  input: { clickBufferCapacity: 30, clickFlatDecayPerSecond: 3, clickFractionDecayPerSecond: 0.2, miningSpeedBonus: 0.3, movementSpeedBonus: 0.4 },
  artifacts: { enabled: true, adjacentMaps: 1, neighborhoodRadius: 2, isolationMultiplier: 4, tickSeconds: 1 },
  challenges: {
    one: { enabled: true, width: 50, height: 50, timeLimitSeconds: 60, stoneHealthMultiplier: 4, regenerationFractionPerSecond: 0, allowSplash: true, allowArtifacts: true },
    two: { enabled: true, width: 12, height: 12, timeLimitSeconds: 30, stoneHealthMultiplier: 4, regenerationFractionPerSecond: 0, allowSplash: false, allowArtifacts: false },
    three: { enabled: true, width: 50, height: 50, timeLimitSeconds: null, stoneHealthMultiplier: 1, regenerationFractionPerSecond: 0.1, allowSplash: true, allowArtifacts: true },
    four: { enabled: true, width: 25, height: 25, timeLimitSeconds: null, stoneHealthMultiplier: 1, regenerationFractionPerSecond: 0.05, allowSplash: true, allowArtifacts: true },
  },
  presentation: { showDamage: true, showPredictions: true, animationSpeed: 1, particlesEnabled: true, palettesEnabled: true },
  saving: { enabled: true, autosaveSeconds: 5, schemaVersion: 1 },
};
