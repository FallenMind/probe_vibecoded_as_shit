export type StoneKind = 'stone' | 'hard' | 'elemental';
export type WeaponId = 'fists' | 'pick' | 'ranged';
export type RangedWeaponId = 'emitter' | 'needle';
export type TutorialStep = 'click' | 'auto' | 'second' | 'penetration' | 'third' | 'done';

export interface Stone {
  block: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  kind: StoneKind;
  neighbors: number;
}

export interface Projectile {
  block: number; x: number; y: number; fromX: number; fromY: number;
  duration: number; remaining: number; damage: number; pierce: number;
}

export interface BreachState {
  version: 1;
  balanceVersion: number;
  paused: boolean;
  savedAt: number;
  tutorial: TutorialStep;
  block: number;
  furthestBlock: number;
  size: number;
  stones: Stone[];
  x: number;
  y: number;
  target: { x: number; y: number } | null;
  shot: { x: number; y: number; remaining: number } | null;
  ore: number;
  crystals: number;
  breakthrough: number;
  completions: number;
  expansion: number;
  auto: boolean;
  pickUnlocked: boolean;
  repeatablesUnlocked: boolean;
  attackClock: number;
  penetration: number;
  meleeLevel: number;
  rangedLevel: number;
  fistLevel: number;
  pickLevel: number;
  needleLevel: number;
  fistFinisherLevel: number;
  pickReachLevel: number;
  needlePierceLevel: number;
  emitterSpreadLevel: number;
  emitterAreaLevel: number;
  beamSpeedLevel: number;
  rangedWeapon: RangedWeaponId;
  needleUnlocked: boolean;
  needleAltUnlocked: boolean;
  needleAltClock: number;
  projectiles: Projectile[];
  clickLevel: number;
  speedLevel: number;
  movementLevel: number;
  weapon: WeaponId;
  rangedUnlocked: boolean;
  artifactUnlocked: boolean;
  artifactClock: number;
  rangedClock: number;
  boundary: number | null;
  reagent: number;
  reagentClock: number;
  charges: number;
  buffRemaining: number;
  message: string;
}
