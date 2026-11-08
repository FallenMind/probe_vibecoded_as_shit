import type { BreachState } from '../../game/breachTypes';

export interface BreachAlchemyEffectsHost {
  readonly state: BreachState;
  crystallize(): boolean;
}

/** Периодические эффекты алхимии не принадлежат производственным рецептам. */
export class BreachAlchemyEffects {
  constructor(private readonly host: BreachAlchemyEffectsHost) {}
  autoCrystallize(seconds: number): void {
    const s = this.host.state;
    if (!s.autoCrystallizeEnabled || !s.challenge3Completed) { s.autoCrystallizeClock = 0; return; }
    s.autoCrystallizeClock += seconds;
    while (s.autoCrystallizeClock >= 0.5) {
      s.autoCrystallizeClock -= 0.5;
      if (!this.host.crystallize()) { s.autoCrystallizeClock = Math.min(s.autoCrystallizeClock, 0.5); break; }
    }
  }
  consumeElementalization(seconds: number): void {
    const a = this.host.state.alchemy;
    if (a.elementalizationEnabled && a.air > 0) a.air = Math.max(0, a.air - seconds);
  }
}
