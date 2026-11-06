import type { StateAccess } from '../core/contracts';
import { applyMechanicEffects } from '../upgrades/upgrade';
import type { ActiveMechanicEffect, MechanicEffectConsumer } from '../upgrades/upgrade';

/** Пример обработки эффекта в правилах забега, а не в классе улучшения. */
const startLayerConsumer: MechanicEffectConsumer<number> = {
  key: 'run.start-layer-offset',
  apply(layer, effect) {
    const offset = effect.parameters.layers;
    return effect.target.kind === 'game' && typeof offset === 'number' ? layer + offset * effect.level : layer;
  },
};

export function resolveStartingLayer(bus: StateAccess, baseLayer: number): number {
  const effects = bus.query('upgrades', { type: 'mechanics', payload: startLayerConsumer.key });
  return Array.isArray(effects) ? Math.max(0, applyMechanicEffects(baseLayer, effects as ActiveMechanicEffect[], startLayerConsumer)) : baseLayer;
}
