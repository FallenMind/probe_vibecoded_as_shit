import type { CharacterId, DeepReadonly, GameCommand, GameEvent, GameState, ModuleId, Point, ResourceAmounts, ResourceId, ResourceState, TileState, WeaponId, WeaponRuntimeState } from './model';

export interface StateAccess {
  read(): DeepReadonly<GameState>;
  snapshot(): GameState;
  update(change: (state: GameState) => void): void;
  registerResource(id: ResourceId, initial: ResourceState): void;
  /** Атомарный обмен: при нехватке входа или места для выхода ничего не списывает. */
  exchange(cost: ResourceAmounts, reward: ResourceAmounts): boolean;
  emit(event: GameEvent): void;
  invoke(moduleId: ModuleId, command: GameCommand): boolean;
  query(moduleId: ModuleId, query: GameCommand): unknown;
  listModules(): readonly { id: ModuleId; enabled: boolean; priority: number }[];
}

export interface GameModule {
  readonly id: ModuleId;
  readonly priority?: number;
  onRegister?(bus: StateAccess): void;
  tick?(bus: StateAccess, seconds: number): void;
  command?(bus: StateAccess, command: GameCommand): boolean;
  query?(bus: StateAccess, query: GameCommand): unknown;
  onRemove?(bus: StateAccess): void;
}

/** Режим владеет правилами карты и победы; после Break Infinity его можно заменить. */
export interface GameplayMode extends GameModule {
  createMap(bus: StateAccess): void;
  resetRun(bus: StateAccess): void;
}

export interface MovementIntent { characterId: CharacterId; destination: Point; stopDistance: number; speedMultiplier: number }
export interface MovementStrategy {
  readonly id: string;
  nextPosition(from: Point, intent: MovementIntent, seconds: number, speed: number): Point;
}

export interface DirectHitPlan {
  targetId: string;
  point: Point;
  damage: number;
  penetration: number;
  elementalPenetration: number;
}

export interface SplashHitPlan {
  center: Point;
  shape: 'circle' | 'arc' | 'cross' | 'path' | 'projectile-path';
  path?: { from: Point; to: Point };
  arcDegrees: number;
  radius: number;
  damage: number;
  falloff: number;
  falloffCurve?: 'linear' | 'smoothstep';
  falloffStartDistance?: number;
  edgeDamageMultiplier: number;
  penetration: number;
  elementalPenetration: number;
  /** Основной блок обрабатывается отдельно, поэтому второй раз в сплеш не попадает. */
  excludedTargetId: string;
}

export interface AttackPlan {
  weaponId: WeaponId;
  characterId: CharacterId;
  origin: Point;
  delivery: 'contact' | 'projectile' | 'beam' | 'explosion';
  direct: DirectHitPlan;
  splash: SplashHitPlan[];
  projectileSpeed: number;
  projectileCount: number;
  projectileSpread: number;
  projectilePierce: number;
  burnSeconds: number;
  burnDamageFraction: number;
  beamTravelSpeed: number;
  beamRetargetSeconds: number;
  combo: boolean;
  dashDistance: number;
}

export interface WeaponContext {
  character: DeepReadonly<GameState['characters'][string]>;
  tiles: readonly DeepReadonly<TileState>[];
  runtime: DeepReadonly<WeaponRuntimeState>;
  seconds: number;
  /** Урон, уже зарезервированный летящими снарядами и атаками этого же шага. */
  predictedDamage?: Record<string, number>;
  /** Огненный режим игломёта пропускает уже горящие и зарезервированные клетки. */
  reservedFireTargets?: Set<string>;
  prioritizeUnburned?: boolean;
  predictProjectileDamage?: (plan: AttackPlan, target: DeepReadonly<TileState>) => number;
  resolveStat?: (base: number, keys: readonly string[]) => number;
}

export interface WeaponResult {
  runtime: WeaponRuntimeState;
  movement: MovementIntent | null;
  attacks: AttackPlan[];
}

/** Общий контракт: оружие либо ведёт персонажа к цели, либо действует автономно. */
export interface Weapon {
  readonly id: WeaponId;
  readonly control: 'movement' | 'autonomous';
  readonly comboAvailable: boolean;
  tick(context: WeaponContext): WeaponResult;
}

export interface Upgrade {
  readonly id: string;
  canBuy(bus: StateAccess): boolean;
  buy(bus: StateAccess): boolean;
  setEnabled(bus: StateAccess, enabled: boolean): boolean;
}
