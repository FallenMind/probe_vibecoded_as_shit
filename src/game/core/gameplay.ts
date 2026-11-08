import type { AttackPlan, GameModule, GameplayMode, StateAccess } from './contracts';
import type { DeepReadonly, GameCommand, GameState, MapState, ResourceAmounts, TileState } from './model';

/** Границы будущих заменяемых частей; действующая игра пока работает по старым правилам. */
export interface MapGenerator { generate(map: MapState, seed: number): TileState[] }
export interface TargetingPolicy { select(state: DeepReadonly<GameState>, characterId: string): string | null }
export interface CombatResolver { apply(bus: StateAccess, attack: AttackPlan): void }
export interface RewardPolicy { forDestroyedTile(tile: DeepReadonly<TileState>, state: DeepReadonly<GameState>): ResourceAmounts }
export interface RunRules {
  createMap(bus: StateAccess): void;
  resetRun(bus: StateAccess): void;
  tick(bus: StateAccess, seconds: number): void;
  command?(bus: StateAccess, command: GameCommand): boolean;
}
export interface ChallengeRules {
  readonly id: string;
  enter(bus: StateAccess): void;
  tick(bus: StateAccess, seconds: number): void;
  isComplete(state: DeepReadonly<GameState>): boolean;
  leave(bus: StateAccess): void;
}
export interface ArtifactEffect { readonly id: string; tick(bus: StateAccess, seconds: number): void }

/** Одна точка замены режима: правила передаются извне, шина и остальные модули остаются общими. */
export class GameplayController implements GameplayMode, GameModule {
  readonly id = 'gameplay';
  readonly priority = 0;
  constructor(private readonly rules: RunRules) {}
  createMap(bus: StateAccess): void { this.rules.createMap(bus); }
  resetRun(bus: StateAccess): void { this.rules.resetRun(bus); }
  tick(bus: StateAccess, seconds: number): void { this.rules.tick(bus, seconds); }
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type === 'create-map') { this.createMap(bus); return true; }
    if (command.type === 'reset-run') { this.resetRun(bus); return true; }
    return this.rules.command?.(bus, command) ?? false;
  }
}
