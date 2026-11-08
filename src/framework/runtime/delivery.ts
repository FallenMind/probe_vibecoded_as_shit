import type { AttackPlan, GameModule, StateAccess } from '../core/contracts';
import { EARTH_MARKED_TAG, type GameCommand } from '../core/model';
import { CombatModule, type HitPolicy } from '../combat/combatModule';
import { StateMapAccess } from '../world/mapAccess';

interface Flight { attack: AttackPlan; remaining: number; duration: number; reservedDamage?: number; ignitesTarget?: boolean; ricochet?: boolean }
interface DeliveryState { flights: Flight[]; flashes: { x: number; y: number; remaining: number; kind: string }[]; burnClock?: number }
interface DeliveryOptions { burnTickSeconds?: number; burnDamageFraction?: number; earthDamageMultiplier?: number; meleeHitDamage?: (bus: StateAccess) => number }

/** Доставка планов оружия: контакт, перелёт снаряда и упрощённый импульс луча. */
export class DeliveryModule implements GameModule {
  readonly id = 'combat';
  readonly priority = 30;
  private readonly impacts: CombatModule;
  constructor(policy: HitPolicy, private readonly options: DeliveryOptions = {}) { this.impacts = new CombatModule(policy); }
  onRegister(bus: StateAccess): void { bus.update(s => { s.moduleData.delivery ??= { flights: [], flashes: [] } satisfies DeliveryState; }); }
  query(bus: StateAccess, command: GameCommand): unknown {
    const state = bus.read(), delivery = state.moduleData.delivery as DeliveryState;
    if (command.type === 'fire-target-reservations' && typeof command.payload === 'string') {
      return (delivery?.flights ?? []).filter(flight => flight.ignitesTarget && state.tiles[flight.attack.direct.targetId])
        .map(flight => flight.attack.direct.targetId);
    }
    if (command.type !== 'projectile-reservations' || typeof command.payload !== 'string') return undefined;
    const reserved: Record<string, number> = {};
    for (const flight of delivery?.flights ?? []) {
      const attack = flight.attack;
      if (attack.weaponId !== 'needle' || !state.tiles[attack.direct.targetId]) continue;
      const tile = state.tiles[attack.direct.targetId];
      const elementalFactor = tile.kind === 'elemental' ? Math.max(0.2, Math.min(1, attack.direct.elementalPenetration)) : 1;
      const predicted = flight.reservedDamage ?? attack.direct.damage * elementalFactor;
      reserved[tile.id] = (reserved[tile.id] ?? 0) + predicted;
    }
    return reserved;
  }
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type !== 'attack' || !command.payload || typeof command.payload !== 'object') return false;
    let plan = command.payload as AttackPlan;
    if (!plan.direct || !Array.isArray(plan.splash)) return false;
    if (plan.combo && plan.dashDistance > 0 && (plan.weaponId === 'pick' || plan.weaponId === 'spear')) {
      const from = { ...bus.read().characters[plan.characterId]!.position };
      const moved = bus.invoke('movement', { type: 'dash', payload: { characterId: plan.characterId, destination: plan.direct.point, distance: plan.dashDistance } });
      const position = bus.read().characters[plan.characterId]?.position;
      if (moved && position) plan = { ...plan, origin: { ...position }, splash: plan.splash.map(area => area.shape === 'path'
        ? { ...area, center: { ...position }, path: { from, to: { ...position } } }
        : { ...area, center: { ...position } }) };
    }
    if (plan.delivery === 'projectile') {
      const distance = Math.hypot(plan.direct.point.x - plan.origin.x, plan.direct.point.y - plan.origin.y);
      const duration = Math.max(0.05, distance / Math.max(0.01, plan.projectileSpeed));
      const target = bus.read().tiles[plan.direct.targetId];
      const fireUpgrade = plan.weaponId === 'needle' && (bus.query('upgrades', { type: 'status', payload: 'needle.elemental' }) as { active?: boolean } | undefined)?.active;
      const run = bus.read().moduleData.run as { earthBuff?: boolean; challenge?: number; stimpackRemaining?: number } | undefined;
      const alreadyMarked = !!target?.tags.includes(EARTH_MARKED_TAG);
      // Existing Earth marks apply before impact; an unmarked ranged hit may create its mark on landing.
      const empowered = !!run?.earthBuff && alreadyMarked;
      const elementalFactor = target?.kind === 'elemental'
        ? empowered ? 1 : Math.max(0.2, Math.min(1, plan.direct.elementalPenetration)) : 1;
      const cycleElemental = (bus.query('upgrades', { type: 'status', payload: 'cycle.14' }) as { active?: boolean } | undefined)?.active;
      const challengeBonus = run?.challenge === 4 && (run.stimpackRemaining ?? 0) > 0 ? 1.5 : 1;
      const reservedDamage = plan.direct.damage * elementalFactor * (empowered ? (this.options.earthDamageMultiplier ?? 2) : 1) *
        (target?.kind === 'elemental' && cycleElemental ? 1.1 : 1) * challengeBonus;
      bus.update(s => { (s.moduleData.delivery as DeliveryState).flights.push({ attack: structuredClone(plan), remaining: duration, duration, reservedDamage, ignitesTarget: !!fireUpgrade }); });
      return true;
    }
    return this.impact(bus, plan);
  }
  tick(bus: StateAccess, seconds: number): void {
    const current = bus.read().moduleData.delivery as DeliveryState;
    const ready: Flight[] = [];
    let burn = false;
    bus.update(s => {
      const d = s.moduleData.delivery as DeliveryState;
      d.burnClock = (d.burnClock ?? 0) + seconds;
      const interval = this.options.burnTickSeconds ?? 0.5;
      if (d.burnClock >= interval) { d.burnClock %= interval; burn = true; }
      for (const flight of d.flights) { flight.remaining -= seconds; if (flight.remaining <= 0) ready.push(flight); }
      d.flights = d.flights.filter(flight => flight.remaining > 0);
      for (const flash of d.flashes) flash.remaining -= seconds;
      d.flashes = d.flashes.filter(flash => flash.remaining > 0);
    });
    if (!current) return;
    for (const flight of ready) {
      const landed = this.impact(bus, flight.attack);
      if (landed && !flight.ricochet && flight.attack.weaponId === 'bombarda' &&
          (bus.query('upgrades', { type: 'status', payload: 'bombarda.elemental' }) as { active?: boolean } | undefined)?.active) {
        this.launchBombardaRicochet(bus, flight.attack);
      }
    }
    if (burn) {
      const state = bus.read();
      const cap = Math.max(0, this.options.meleeHitDamage?.(bus) ?? 2) * 0.5;
      const world = new StateMapAccess(bus);
      for (const tile of Object.values(state.tiles)) if (tile.tags.includes('burning')) world.damageTile(tile.id, Math.min(tile.maxHealth * (this.options.burnDamageFraction ?? 0.08), cap));
    }
  }
  private impact(bus: StateAccess, attack: AttackPlan): boolean {
    const delivery = attack.delivery;
    const hit: AttackPlan = { ...attack, delivery: attack.weaponId === 'bombarda' || delivery === 'explosion' ? 'explosion' : 'contact',
      splash: attack.splash.filter(area => area.shape !== 'projectile-path') };
    const result = this.impacts.command(bus, { type: 'attack', payload: hit });
    const fire = bus.query('upgrades', { type: 'status', payload: 'needle.elemental' }) as { active?: boolean } | undefined;
    if (result && attack.weaponId === 'needle' && fire?.active && bus.read().tiles[attack.direct.targetId]) bus.update(s => {
      const tile = s.tiles[attack.direct.targetId];
      if (tile && !tile.tags.includes('burning')) tile.tags.push('burning');
    });
    if (result) {
      bus.update(s => { (s.moduleData.delivery as DeliveryState).flashes.push({ ...attack.direct.point, remaining: 0.15, kind: delivery }); });
      bus.emit({ type: 'combat.impact', source: this.id, payload: { actor: attack.characterId, weapon: attack.weaponId, point: { ...attack.direct.point }, combo: attack.combo,
        splashRadius: Math.max(0, ...attack.splash.filter(area => area.shape !== 'projectile-path').map(area => area.radius)) } });
    }
    return result;
  }

  private launchBombardaRicochet(bus: StateAccess, primary: AttackPlan): void {
    const state = bus.read(), actor = state.characters[primary.characterId];
    if (!actor) return;
    const candidates = Object.values(state.tiles).filter(tile => tile.mapId === actor.mapId && tile.health > 0 && tile.id !== primary.direct.targetId);
    if (!candidates.length) return;
    const splash = primary.splash[0];
    const radius = Math.max(0, splash?.radius ?? 0);
    let target: typeof candidates[number] | undefined, bestScore = 0;
    for (const point of candidates) {
      let score = 0;
      for (const tile of candidates) {
        const distance = Math.hypot(tile.position.x - point.position.x, tile.position.y - point.position.y);
        if (distance <= radius) score += 0.35 + 0.65 * Math.max(0, 1 - distance / Math.max(0.01, radius));
      }
      if (score > bestScore) { bestScore = score; target = point; }
    }
    if (!target) return;
    const damage = primary.direct.damage * 0.4;
    const attack: AttackPlan = { ...structuredClone(primary), origin: { ...primary.direct.point }, delivery: 'projectile',
      direct: { ...primary.direct, targetId: target.id, point: { ...target.position }, damage },
      splash: primary.splash.map(area => ({ ...area, center: { ...target!.position }, damage: area.damage * 0.4, excludedTargetId: target!.id })),
      combo: false, dashDistance: 0 };
    const duration = Math.max(0.05, Math.hypot(target.position.x - attack.origin.x, target.position.y - attack.origin.y) / Math.max(0.01, attack.projectileSpeed));
    bus.update(s => { (s.moduleData.delivery as DeliveryState).flights.push({ attack, remaining: duration, duration, ricochet: true }); });
  }
}
