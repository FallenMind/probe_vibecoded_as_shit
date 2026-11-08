import type { FrameworkConfig } from '../config/schema';
import type { AttackPlan } from '../core/contracts';
import type { GameEvent, Point, TileState } from '../core/model';
import type { StateBus } from '../core/stateBus';
import { AnimationClip, AnimationPlayer, type AnimationPose } from './animation';

export interface AttackVisual { actor: string; weapon: string; origin: Point; target: Point; combo: boolean; player: AnimationPlayer }
export interface DashVisual { actor: string; from: Point; to: Point; player: AnimationPlayer }
export interface ImpactVisual { position: Point; kind: string; radius?: number; player: AnimationPlayer }
export interface ResetVisualSnapshot { origin: Point; tiles: readonly TileState[] }
export interface TransitionVisual { kind: 'reset' | 'complete' | 'challenge-enter' | 'challenge-exit' | 'layer' | 'compress' | 'charge'; player: AnimationPlayer; snapshot?: ResetVisualSnapshot }

const pose = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, alpha = 1): AnimationPose => ({ x, y, rotation, scaleX, scaleY, alpha });
const frames = (weapon: string, combo: boolean) => {
  if (weapon === 'pick') return [{ at: 0, pose: pose(0, 0, -1.3) }, { at: combo ? 0.65 : 0.35, pose: pose(-0.12, -0.12, -1.65) }, { at: 1, pose: pose(0.3, 0, 0.65) }];
  if (weapon === 'spear') return [{ at: 0, pose: pose(0, 0, 0) }, { at: combo ? 0.7 : 0.5, pose: pose(0, 0, Math.PI * 2) }, { at: 1, pose: pose(0.3, 0, Math.PI * 4) }];
  return [{ at: 0, pose: pose() }, { at: 0.4, pose: pose(0.55, 0, 0.12, 1.12, 1.12) }, { at: 1, pose: pose() }];
};

/** Только визуальное состояние: игровые события не откладываются и не сохраняются в сейв. */
export class GameVisuals {
  readonly attacks = new Map<string, AttackVisual>();
  readonly dashes = new Map<string, DashVisual>();
  readonly damageFlashes = new Map<string, number>();
  readonly targets = new Map<string, Point>();
  impacts: ImpactVisual[] = [];
  transition: TransitionVisual | null = null;
  elapsed = 0;
  terrainRevision = 0;
  readonly terrainDirtyTiles = new Map<string, { mapId: string; position: Point }>();
  terrainFullyDirty = true;
  private readonly latestWeapon = new Map<string, string>();
  private readonly unsubscribe: () => void;
  constructor(private readonly bus: StateBus, readonly config: FrameworkConfig) {
    this.unsubscribe = bus.subscribe(event => this.onEvent(event));
    const run = bus.read().moduleData.run as { endChargeRemaining?: number } | undefined;
    if (run?.endChargeRemaining && run.endChargeRemaining > 0) {
      this.onEvent({ type: 'run.visual-transition', source: 'gameplay', payload: { kind: 'charge' } });
      if (this.transition) this.transition.player.elapsedSeconds = Math.max(0, this.transition.player.clip.durationSeconds - run.endChargeRemaining);
    }
  }
  dispose(): void { this.unsubscribe(); }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Некорректная длительность анимации');
    if (this.bus.read().paused) return;
    const dt = seconds * Math.max(0, this.config.presentation.animationSpeed);
    this.elapsed += dt;
    for (const [id, visual] of this.attacks) { visual.player.tick(dt); if (visual.player.finished) this.attacks.delete(id); }
    for (const [id, visual] of this.dashes) { visual.player.tick(dt); if (visual.player.finished) this.dashes.delete(id); }
    for (const visual of this.impacts) visual.player.tick(dt);
    this.impacts = this.impacts.filter(visual => !visual.player.finished);
    for (const [id, remaining] of this.damageFlashes) {
      if (remaining <= dt) this.damageFlashes.delete(id); else this.damageFlashes.set(id, remaining - dt);
    }
    if (this.transition) { this.transition.player.tick(dt); if (this.transition.player.finished) this.transition = null; }
  }
  actorPosition(actor: string, fallback: Point): Point {
    const visual = this.dashes.get(actor);
    if (visual) {
      const t = visual.player.pose().x;
      return { x: visual.from.x + (visual.to.x - visual.from.x) * t, y: visual.from.y + (visual.to.y - visual.from.y) * t };
    }
    if (this.transition?.kind === 'reset') {
      const t = Math.min(1, this.transition.player.elapsedSeconds / this.transition.player.clip.durationSeconds);
      const from = this.transition.snapshot?.origin ?? { x: fallback.x, y: fallback.y - 2 };
      const ease = 1 - (1 - t) ** 3;
      return { x: from.x + (fallback.x - from.x) * ease, y: from.y + (fallback.y - from.y) * ease - Math.sin(t * Math.PI) * 1.5 };
    }
    return fallback;
  }
  private player(id: string, duration: number, keyframes: ConstructorParameters<typeof AnimationClip>[2]): AnimationPlayer {
    return new AnimationPlayer(new AnimationClip(id, duration, keyframes));
  }
  private onEvent(event: GameEvent): void {
    if (event.type === 'run.visual-transition' || event.type === 'terrain.full-dirty') {
      this.terrainRevision++; this.terrainFullyDirty = true; this.terrainDirtyTiles.clear();
    } else if (event.type === 'tile.damaged') {
      const value = event.payload as { tile: TileState };
      this.terrainRevision++; this.terrainDirtyTiles.set(value.tile.id, { mapId: value.tile.mapId, position: { ...value.tile.position } });
    } else if (event.type === 'tile.added' || event.type === 'tile.removed') {
      const value = event.payload as { mapId: string; tileId: string; position: Point };
      this.terrainRevision++; this.terrainDirtyTiles.set(value.tileId, { mapId: value.mapId, position: { ...value.position } });
    }
    if (event.type === 'combat.attack-planned') {
      const attack = event.payload as AttackPlan;
      const config = this.config.weapons[attack.weaponId];
      if (!config || !attack.direct) return;
      const actor = this.bus.read().characters[attack.characterId];
      const speed = this.bus.query('upgrades', { type: 'stat', payload: { base: actor?.attackSpeed ?? 1, keys: ['character.attackSpeed', `weapon.${attack.weaponId}.attackSpeed`] } });
      const duration = Math.max(0.08, (attack.combo ? config.animation.chargedSeconds : config.animation.swingSeconds) / Math.max(0.1, typeof speed === 'number' ? speed : 1));
      this.latestWeapon.set(attack.characterId, attack.weaponId);
      if (['fists', 'pick', 'spear', 'bombarda'].includes(attack.weaponId)) this.targets.set(attack.characterId, { ...attack.direct.point });
      this.attacks.set(`${attack.characterId}:${attack.weaponId}`, { actor: attack.characterId, weapon: attack.weaponId,
        origin: { ...attack.origin }, target: { ...attack.direct.point }, combo: attack.combo,
        player: this.player(`attack:${attack.weaponId}`, duration, frames(attack.weaponId, attack.combo)) });
    } else if (event.type === 'movement.requested') {
      const value = event.payload as { characterId: string; destination: Point };
      this.targets.set(value.characterId, { ...value.destination });
    } else if (event.type === 'movement.dashed') {
      const value = event.payload as { characterId: string; from: Point; to: Point };
      const attack = this.attacks.get(`${value.characterId}:${this.latestWeapon.get(value.characterId)}`);
      const spear = attack?.weapon === 'spear';
      this.dashes.set(value.characterId, { actor: value.characterId, from: { ...value.from }, to: { ...value.to },
        player: this.player('dash', spear ? attack.player.clip.durationSeconds : 0.24,
          [{ at: 0, pose: pose(0) }, { at: spear ? 0.65 : 0.35, pose: pose(spear ? 0 : 0.08) }, { at: 1, pose: pose(1) }]) });
    } else if (event.type === 'combat.damage') {
      if (!this.config.presentation.showDamage) return;
      const value = event.payload as { hits: readonly { tile: { id: string }; destroyed: boolean }[] };
      for (const hit of value.hits) if (!hit.destroyed) this.damageFlashes.set(hit.tile.id, 0.16);
      while (this.damageFlashes.size > 160) this.damageFlashes.delete(this.damageFlashes.keys().next().value!);
    } else if (event.type === 'combat.impact') {
      if (!this.config.presentation.particlesEnabled) return;
      const value = event.payload as { point: Point; weapon: string; combo: boolean; splashRadius?: number };
      this.impacts.push({ position: { ...value.point }, kind: value.weapon === 'bombarda' ? 'bombarda' : value.combo ? 'combo' : value.weapon,
        ...(value.weapon === 'bombarda' ? { radius: value.splashRadius ?? 3 } : {}),
        player: this.player('impact', value.weapon === 'bombarda' ? 0.42 : value.combo ? 0.4 : 0.25,
          [{ at: 0, pose: pose(0, 0, 0, 0.18, 0.18, 1) }, { at: 0.32, pose: pose(0, 0, 0, 1.15, 1.15, 0.72) }, { at: 1, pose: pose(0, 0, 0, 1.7, 1.7, 0) }]) });
      if (this.impacts.length > 48) this.impacts.splice(0, this.impacts.length - 48);
    } else if (event.type === 'run.visual-transition') {
      const { kind, snapshot } = event.payload as { kind: TransitionVisual['kind']; snapshot?: ResetVisualSnapshot };
      this.attacks.clear(); this.dashes.clear(); this.damageFlashes.clear(); this.impacts = []; this.targets.clear();
      const duration = kind === 'charge' ? Math.max(0.01, this.config.world.finalChargeSeconds) : kind === 'reset' ? 0.8 : 0.6;
      const keyframes = kind === 'charge'
        ? [{ at: 0, pose: pose(0, 0, 0, 0.15, 0.15, 0.1) }, { at: 1, pose: pose(0, 0, 0, 0.75, 0.75, 0.9) }]
        : [{ at: 0, pose: pose(0, 0, 0, 0.1, 0.1, 0.5) }, { at: 1, pose: pose(0, 0, 0, 2, 2, 0) }];
      this.transition = { kind, player: this.player('transition', duration, keyframes), snapshot };
    }
  }
}
