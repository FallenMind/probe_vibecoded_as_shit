/** Черновые данные движка. Идентификаторы открыты для новых модулей. */
export type ResourceId = string;
export type CharacterId = string;
export type WeaponId = string;
export type UpgradeId = string;
export type ModuleId = string;

export const EARTH_MARKED_TAG = 'earth-marked';

export interface Point { x: number; y: number }
export interface ResourceState { amount: number; capacity: number | null }
export type ResourceAmounts = Record<ResourceId, number>;

export interface TileState {
  id: string;
  mapId: string;
  position: Point;
  kind: string;
  health: number;
  maxHealth: number;
  armor: number;
  tags: string[];
}

export interface WeaponRuntimeState {
  elapsed: number;
  attacks: number;
  enabled: boolean;
  comboEnabled: boolean;
  movementLockSeconds?: number;
}

export interface MapState { id: string; layer: number; width: number; height: number; tags: string[] }

/** Независимое временное ограничение, например со стороны испытания. */
export interface UpgradeSuppression {
  all: boolean;
  upgradeIds: UpgradeId[];
  tags: string[];
}

export interface CharacterState {
  id: CharacterId;
  mapId: string;
  position: Point;
  movementSpeed: number;
  attackSpeed: number;
  enabled: boolean;
  /** Одно оружие управляет движением, остальные работают автономно. */
  controlledWeapon: WeaponId | null;
  autonomousWeapons: WeaponId[];
  weaponStates: Record<WeaponId, WeaponRuntimeState>;
  tags: string[];
}

export interface GameState {
  version: number;
  paused: boolean;
  elapsedSeconds: number;
  primaryCharacterId: CharacterId | null;
  characters: Record<CharacterId, CharacterState>;
  maps: Record<string, MapState>;
  resources: Record<ResourceId, ResourceState>;
  tiles: Record<string, TileState>;
  upgradeLevels: Record<UpgradeId, number>;
  upgradeEnabled: Record<UpgradeId, boolean>;
  upgradeSuppressions: Record<string, UpgradeSuppression>;
  /** Сохраняемые данные принадлежат модулям и ключуются их id. */
  moduleData: Record<ModuleId, unknown>;
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export interface GameEvent<T = unknown> { type: string; source: ModuleId; payload: T }
export interface GameCommand<T = unknown> { type: string; payload: T }

export function createEmptyState(): GameState {
  return { version: 1, paused: false, elapsedSeconds: 0, primaryCharacterId: null,
    characters: {}, maps: {}, resources: {}, tiles: {}, upgradeLevels: {}, upgradeEnabled: {}, upgradeSuppressions: {}, moduleData: {} };
}
