import type { StateAccess } from '../core/contracts';
import { applyMechanicEffects } from '../upgrades/upgrade';
import type { ActiveMechanicEffect, MechanicEffectConsumer } from '../upgrades/upgrade';

/** Лимит покупки радиуса принадлежит вооружению и пересчитывается по активным эффектам. */
export function resolveRadiusLevelLimit(bus: StateAccess, baseLimit: number, weaponId: string, category: 'melee' | 'ranged'): number {
  const consumer: MechanicEffectConsumer<number> = {
    key: 'weapon.radius-level-limit',
    apply(limit, effect) {
      const levels = effect.parameters.levels;
      const matches = effect.target.kind === 'weapon' && (effect.target.id === weaponId || effect.target.id === category);
      return matches && typeof levels === 'number' ? limit + levels * effect.level : limit;
    },
  };
  const effects = bus.query('upgrades', { type: 'mechanics', payload: consumer.key });
  return Array.isArray(effects) ? applyMechanicEffects(baseLimit, effects as ActiveMechanicEffect[], consumer) : baseLimit;
}
