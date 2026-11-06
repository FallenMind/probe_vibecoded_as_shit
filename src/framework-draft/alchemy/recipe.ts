import type { RecipeConfig } from '../config/schema';
import type { GameModule, StateAccess } from '../core/contracts';
import type { GameCommand, ResourceAmounts } from '../core/model';

interface RecipeState { elapsed: number; enabled: boolean }

/** Один рецепт — один модуль с отдельным таймером и доступом к общей шине ресурсов. */
export class AlchemyRecipe implements GameModule {
  readonly id: string;
  readonly priority = 10;
  constructor(protected readonly config: RecipeConfig) {
    if (!(config.intervalSeconds > 0) || !Number.isFinite(config.intervalSeconds) || config.maxTicksPerUpdate < 1) throw new Error('Некорректный интервал рецепта');
    this.id = config.id;
  }
  onRegister(bus: StateAccess): void {
    bus.update(state => { state.moduleData[this.id] ??= { elapsed: 0, enabled: this.config.enabled } satisfies RecipeState; });
  }
  command(bus: StateAccess, command: GameCommand): boolean {
    if (command.type !== 'set-enabled' || typeof command.payload !== 'boolean') return false;
    bus.update(state => { (state.moduleData[this.id] as RecipeState).enabled = command.payload as boolean; });
    return true;
  }
  tick(bus: StateAccess, seconds: number): void {
    const stored = bus.read().moduleData[this.id] as Readonly<RecipeState> | undefined;
    if (!stored?.enabled) return;
    let elapsed = stored.elapsed + seconds;
    let ticks = 0;
    while (elapsed + 1e-9 >= this.config.intervalSeconds && ticks++ < this.config.maxTicksPerUpdate) {
      if (!this.convert(bus)) { elapsed = 0; break; }
      elapsed = Math.max(0, elapsed - this.config.intervalSeconds);
    }
    bus.update(state => { (state.moduleData[this.id] as RecipeState).elapsed = elapsed; });
  }
  protected convert(bus: StateAccess): boolean {
    const resources = bus.read().resources;
    for (const [id, minimum] of Object.entries(this.config.requiredBalance)) if (!resources[id] || resources[id].amount < minimum) return false;
    const source = this.config.source ? resources[this.config.source] : undefined;
    if (this.config.mode === 'fractional' && !source) return false;
    let units = this.config.mode === 'fixed' ? 1 : Math.max(this.config.minimumUnits, Math.floor(source!.amount * this.config.fraction));
    for (const [id, amount] of Object.entries(this.config.inputsPerUnit)) {
      if (!resources[id] || !Number.isFinite(amount) || amount <= 0) return false;
      units = Math.min(units, Math.floor(resources[id].amount / amount));
    }
    if (this.config.overflow === 'block') for (const [id, amount] of Object.entries(this.config.outputsPerUnit)) {
      const resource = resources[id];
      if (!resource || !Number.isFinite(amount) || amount <= 0) return false;
      const net = amount - (this.config.inputsPerUnit[id] ?? 0);
      if (resource.capacity !== null && net > 0) units = Math.min(units, Math.floor((resource.capacity - resource.amount) / net));
    }
    if (units < 1 || !Number.isFinite(units)) return false;
    const cost: ResourceAmounts = {};
    const reward: ResourceAmounts = {};
    for (const [id, amount] of Object.entries(this.config.inputsPerUnit)) cost[id] = amount * units;
    for (const [id, amount] of Object.entries(this.config.outputsPerUnit)) {
      const resource = resources[id];
      if (!resource || !Number.isFinite(amount) || amount <= 0) return false;
      const space = resource.capacity === null ? Infinity : resource.capacity - resource.amount + (cost[id] ?? 0);
      reward[id] = this.config.overflow === 'clamp' ? Math.min(amount * units, Math.max(0, space)) : amount * units;
    }
    if (!bus.exchange(cost, reward)) return false;
    bus.emit({ type: 'alchemy.converted', source: this.id, payload: { units, cost, reward } });
    return true;
  }
}
