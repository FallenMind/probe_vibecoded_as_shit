import type { ResourceAmounts } from '../core/model';

export interface AreaConfig { shape: 'single' | 'circle' | 'arc' | 'cross'; center: 'character' | 'target'; radius: number; arcDegrees: number; falloffExponent: number; falloffCurve?: 'linear' | 'smoothstep'; falloffStartDistance?: number; edgeDamageMultiplier: number; splashDamageMultiplier: number }
export interface ComboConfig { enabled: boolean; attacksRequired: number; cooldownMultiplier: number; damageMultiplier: number; extraRadius: number; dashDistance: number }
export interface WeaponConfig {
  enabled: boolean; damageCategory: 'melee' | 'ranged'; damage: number; attackIntervalSeconds: number; interactionRange: number;
  attackSpeedPower?: number; attackSpeedFlatBonus?: number;
  maxAttacksPerTick: number; armorPenetration: number; elementalPenetration: number;
  area: AreaConfig; combo: ComboConfig;
  projectile: { speed: number; attackSpeedPower?: number; count: number; spread: number; pierce: number; burnSeconds: number; burnDamageFraction: number };
  beam: { travelSpeed: number; retargetSeconds: number; searchRadiusMultiplier: number };
  animation: { swingSeconds: number; chargedSeconds: number; impactEffect: boolean; trailEffect: boolean };
}

export interface AlchemyActionConfig { enabled: boolean; cost: ResourceAmounts; reward: ResourceAmounts }

export interface RecipeConfig {
  id: string; enabled: boolean; passive?: boolean; intervalSeconds: number; maxTicksPerUpdate: number;
  /** fixed = один обмен, fractional = доля запаса source за тик. */
  mode: 'fixed' | 'fractional'; source: string | null; fraction: number; minimumUnits: number;
  speedSourceAmount?: number; minimumIntervalSeconds?: number;
  inputsPerUnit: ResourceAmounts; outputsPerUnit: ResourceAmounts;
  requiredBalance: ResourceAmounts; overflow: 'block' | 'clamp';
}

export interface FrameworkConfig {
  simulation: { stepSeconds: number; maxStepsPerFrame: number; offlineProgress: boolean; maxOfflineSeconds: number };
  modules: { gameplay: boolean; movement: boolean; weapons: boolean; alchemy: boolean; upgrades: boolean; challenges: boolean; artifacts: boolean };
  world: {
    width: number; height: number; layers: number; expansionPerLevel: number; maxExpansion: number;
    stoneHealth: number; hardHealth: number; elementalHealth: number; hardSplashMultiplier: number;
    hpGrowthLinear: number; hpGrowthFraction: number; hpGrowthEveryLayers: number;
    oreRewardByKind: Record<'stone' | 'hard' | 'elemental', number>; oreRewardLinear: number; oreRewardFraction: number;
    postBossHealthMultiplier: number; postBossCompensationLayers: number;
    mineralNoiseScale: number; mineralNoiseOffsetX: number; mineralNoiseOffsetY: number;
    hardMineralSeed: number; elementalMineralSeed: number; hardMineralThreshold: number; bossHardThreshold: number;
    elementalMineralThreshold: number; elementalRampStartThreshold: number; elementalBossThreshold: number;
    hardMineralFirstLayer: number; elementalMineralFirstLayer: number; elementalMineralFullLayer: number;
    bossEveryLayers: number; bossHealthMultiplier: number; bossTimeSeconds: number;
    boundaryEnabled: boolean; boundarySpeed: number; compressorEnabled: boolean; compressorRemainingFraction: number; compressorUnlockLayer: number; compressorCost: number; finalChargeSeconds: number;
  };
  characters: { maxCount: number; baseMovementSpeed: number; baseAttackSpeed: number; spawnX: number; spawnY: number };
  movement: { strategy: string; stopDistance: number; retargetSeconds: number; diagonal: boolean; collision: boolean };
  weapons: Record<'fists' | 'pick' | 'spear' | 'needle' | 'emitter' | 'bombarda', WeaponConfig> & Record<string, WeaponConfig>;
  alchemy: { resources: Record<string, { amount: number; capacity: number | null }>;
    unlockCosts: Record<'water', ResourceAmounts>;
    recipes: Record<'earth' | 'water' | 'air' | 'fire' | 'vulcanization', RecipeConfig> & Record<string, RecipeConfig>;
    actions: Record<string, AlchemyActionConfig>;
    buffs: { earthDamageMultiplier: number; earthPerHit: number; elementalizationChance: number; airPerSecond: number; overloadSeconds: number; overloadUpgradeCost: ResourceAmounts; fireReactionUnlockCosts: { vulcanization: ResourceAmounts; decomposition: ResourceAmounts } } };
  progression: { breakthroughPerCompletion: number; resetOre: boolean; resetAlchemy: boolean; retainCrystals: boolean; retainUpgrades: boolean };
  input: { clickBufferCapacity: number; clickGainPerPress: number; clickFlatDecayPerSecond: number; clickFractionDecayPerSecond: number; miningSpeedBonus: number; movementSpeedBonus: number; emitterSpeedMaxBonus: number };
  artifacts: { enabled: boolean; adjacentMaps: number; neighborhoodRadius: number; isolationMultiplier: number; tickSeconds: number };
  challenges: Record<string, { enabled: boolean; width: number; height: number; timeLimitSeconds: number | null; stoneHealthMultiplier: number; stoneHealthMinimumMultiplier?: number; regenerationFractionPerSecond: number; allowSplash: boolean; allowArtifacts: boolean }>;
  presentation: { showDamage: boolean; showPredictions: boolean; animationSpeed: number; particlesEnabled: boolean; palettesEnabled: boolean };
  saving: { enabled: boolean; autosaveSeconds: number; schemaVersion: number };
}
