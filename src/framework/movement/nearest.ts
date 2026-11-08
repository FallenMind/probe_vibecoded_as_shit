import type { GameModule, MovementIntent, MovementStrategy, StateAccess } from '../core/contracts';
import type { GameCommand, Point } from '../core/model';

export class DirectMovement implements MovementStrategy {
  readonly id = 'direct';
  nextPosition(from: Point, intent: MovementIntent, seconds: number, speed: number): Point {
    const dx = intent.destination.x - from.x;
    const dy = intent.destination.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= intent.stopDistance || distance === 0) return { ...from };
    const travel = Math.min(distance - intent.stopDistance, Math.max(0, speed * intent.speedMultiplier * seconds));
    return { x: from.x + dx / distance * travel, y: from.y + dy / distance * travel };
  }
}

/** Демонстрационный исполнитель перемещения; обход препятствий можно заменить стратегией. */
export class MovementModule implements GameModule {
  readonly id = 'movement';
  constructor(private readonly strategy: MovementStrategy) {}
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type === 'dash') {
      const payload = command.payload as { characterId?: unknown; destination?: Point; distance?: unknown };
      if (typeof payload?.characterId !== 'string' || !payload.destination ||
          !Number.isFinite(payload.destination.x) || !Number.isFinite(payload.destination.y) ||
          typeof payload.distance !== 'number' || !Number.isFinite(payload.distance) || payload.distance < 0) return false;
      const actor = bus.read().characters[payload.characterId];
      if (!actor?.enabled) return false;
      const from = { ...actor.position };
      const position = this.strategy.nextPosition(from, { characterId: payload.characterId, destination: payload.destination, stopDistance: 0, speedMultiplier: 1 }, 1, payload.distance);
      bus.update(state => { state.characters[payload.characterId as string].position = position; });
      bus.emit({ type: 'movement.dashed', source: this.id, payload: { characterId: payload.characterId, from, to: position } });
      return true;
    }
    if (command.type !== 'move') return false;
    const payload = command.payload as { intent: MovementIntent; seconds: number };
    if (!payload?.intent || !Number.isFinite(payload.seconds) || payload.seconds < 0) return false;
    const actor = bus.read().characters[payload.intent.characterId];
    if (!actor?.enabled) return false;
    const position = this.strategy.nextPosition(actor.position, payload.intent, payload.seconds, actor.movementSpeed);
    bus.update(state => { state.characters[payload.intent.characterId].position = position; });
    return true;
  }
}
