import type { AlchemyActionConfig } from '../config/schema';
import type { GameModule, StateAccess } from '../core/contracts';
import type { GameCommand } from '../core/model';

/** Ручные обмены, например кристаллизация; условия открытия добавятся на этапе переноса. */
export class AlchemyActions implements GameModule {
  readonly id = 'alchemy.actions';
  constructor(private readonly actions: Readonly<Record<string, AlchemyActionConfig>>) {}
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type !== 'exchange' || typeof command.payload !== 'string' || bus.read().paused) return false;
    const action = this.actions[command.payload];
    if (!action?.enabled || !bus.exchange(action.cost, action.reward)) return false;
    bus.emit({ type: 'alchemy.exchanged', source: this.id, payload: { action: command.payload } });
    return true;
  }
}
