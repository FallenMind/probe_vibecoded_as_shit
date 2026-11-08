import type { GameModule, StateAccess } from './contracts';
import { createEmptyState } from './model';
import type { DeepReadonly, GameCommand, GameEvent, GameState, ResourceAmounts, ResourceId, ResourceState } from './model';

/** Представление одного ресурса во внешнем состоянии; снимок содержит значение, а не функции. */
export interface ResourceBinding {
  amount(): number;
  setAmount(amount: number): void;
  capacity(): number | null;
}

/** Общие ресурсы и диспетчер модулей. Не подключён к существующей игре. */
export class StateBus implements StateAccess {
  private state: GameState;
  private readonly modules = new Map<string, { instance: GameModule; enabled: boolean }>();
  private readonly listeners = new Set<(event: GameEvent) => void>();
  private orderedModules: GameModule[] = [];
  private orderDirty = true;

  constructor(initial: GameState = createEmptyState()) {
    this.state = structuredClone(initial);
    this.state.upgradeEnabled ??= {};
    this.state.upgradeSuppressions ??= {};
  }
  read(): DeepReadonly<GameState> { return this.state; }
  snapshot(): GameState { return structuredClone(this.state); }
  update(change: (state: GameState) => void): void { change(this.state); }

  registerResource(id: ResourceId, initial: ResourceState): void {
    if (this.state.resources[id]) throw new Error(`Ресурс уже зарегистрирован: ${id}`);
    if (!Number.isFinite(initial.amount) || initial.amount < 0 ||
      (initial.capacity !== null && (!Number.isFinite(initial.capacity) || initial.capacity < initial.amount))) {
      throw new Error(`Некорректный ресурс: ${id}`);
    }
    this.state.resources[id] = { ...initial };
  }

  bindResource(id: ResourceId, binding: ResourceBinding): void {
    if (this.state.resources[id]) throw new Error(`Ресурс уже зарегистрирован: ${id}`);
    const amount = binding.amount(), capacity = binding.capacity();
    if (!Number.isFinite(amount) || amount < 0 || (capacity !== null && (!Number.isFinite(capacity) || capacity < 0))) {
      throw new Error(`Некорректный ресурс: ${id}`);
    }
    const view = {} as ResourceState;
    Object.defineProperties(view, {
      amount: { enumerable: true, get: () => binding.amount(), set: (value: number) => binding.setAmount(value) },
      capacity: { enumerable: true, get: () => binding.capacity() },
    });
    this.state.resources[id] = view;
  }

  bindPaused(read: () => boolean, write: (value: boolean) => void): void {
    Object.defineProperty(this.state, 'paused', { enumerable: true, configurable: true, get: read, set: write });
  }

  exchange(cost: ResourceAmounts, reward: ResourceAmounts): boolean {
    const ids = new Set([...Object.keys(cost), ...Object.keys(reward)]);
    for (const id of ids) {
      const resource = this.state.resources[id];
      const spent = cost[id] ?? 0;
      const earned = reward[id] ?? 0;
      if (!resource || !Number.isFinite(spent) || !Number.isFinite(earned) || spent < 0 || earned < 0 || resource.amount < spent) return false;
      const next = resource.amount - spent + earned;
      // Временно сниженный лимит не должен блокировать расход уже накопленного избытка.
      if (resource.capacity !== null && next > resource.capacity && next > resource.amount) return false;
    }
    for (const id of ids) this.state.resources[id].amount += (reward[id] ?? 0) - (cost[id] ?? 0);
    return true;
  }

  register(module: GameModule): void {
    if (this.modules.has(module.id)) throw new Error(`Модуль уже зарегистрирован: ${module.id}`);
    this.modules.set(module.id, { instance: module, enabled: true });
    this.orderDirty = true;
    try { module.onRegister?.(this); } catch (error) { this.modules.delete(module.id); this.orderDirty = true; throw error; }
  }
  replace(module: GameModule): void {
    const previous = this.modules.get(module.id);
    if (!previous) throw new Error(`Модуль не зарегистрирован: ${module.id}`);
    previous.instance.onRemove?.(this);
    this.modules.set(module.id, { instance: module, enabled: previous.enabled });
    this.orderDirty = true;
    module.onRegister?.(this);
  }
  setEnabled(moduleId: string, enabled: boolean): void {
    const module = this.modules.get(moduleId);
    if (!module) throw new Error(`Модуль не зарегистрирован: ${moduleId}`);
    module.enabled = enabled;
    this.orderDirty = true;
  }
  setPaused(paused: boolean): void { this.state.paused = paused; }
  isEnabled(moduleId: string): boolean { return this.modules.get(moduleId)?.enabled ?? false; }
  listModules(): readonly { id: string; enabled: boolean; priority: number }[] {
    return [...this.modules.entries()].map(([id, module]) => ({ id, enabled: module.enabled, priority: module.instance.priority ?? 0 }));
  }
  invoke(moduleId: string, command: GameCommand): boolean {
    const module = this.modules.get(moduleId);
    return !this.state.paused && !!module?.enabled && (module.instance.command?.(this, command) ?? false);
  }
  query(moduleId: string, query: GameCommand): unknown {
    const module = this.modules.get(moduleId);
    return module?.enabled ? module.instance.query?.(this, query) : undefined;
  }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Некорректная длительность тика');
    if (this.state.paused || seconds === 0) return;
    this.state.elapsedSeconds += seconds;
    if (this.orderDirty) {
      this.orderedModules = [...this.modules.values()].filter(item => item.enabled).map(item => item.instance)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      this.orderDirty = false;
    }
    for (const module of this.orderedModules) module.tick?.(this, seconds);
  }
  subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: GameEvent): void { for (const listener of this.listeners) listener(event); }
}
