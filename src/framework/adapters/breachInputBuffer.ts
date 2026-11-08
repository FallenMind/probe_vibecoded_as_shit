import { isCycleUpgradeActive } from './breachCycleEffects';
import type { BreachState } from '../../game/breachTypes';

export interface ClickBufferConfig {
  capacity: number; capacityUpgradeMultiplier: number; flatDrain: number; fractionDrain: number;
  heatThreshold: number; clicksPerSecondForHeat: number; heatDecayPerSecond: number;
}

/** Клики не сбрасывают перезарядку: они добавляют временное ускорение через буфер. */
export class BreachInputBuffer {
  constructor(private readonly config: ClickBufferConfig) {}
  click(state: BreachState): void {
    state.clickBuffer = Math.min(this.config.capacity * (isCycleUpgradeActive(state, 'cycle15') ? this.config.capacityUpgradeMultiplier : 1), state.clickBuffer + 1);
    state.clickWindowCount++;
  }
  tick(state: BreachState, seconds: number): void {
    const c = this.config;
    state.clickBuffer = Math.max(0, state.clickBuffer - (c.flatDrain + state.clickBuffer * c.fractionDrain) * seconds);
    state.clickWindowTime += seconds;
    while (state.clickWindowTime >= 1) {
      if (state.clickWindowCount >= c.clicksPerSecondForHeat) state.clickHeat = Math.min(c.heatThreshold, state.clickHeat + 1);
      else state.clickHeat = Math.max(0, state.clickHeat - c.heatDecayPerSecond);
      state.clickWindowCount = 0; state.clickWindowTime -= 1;
    }
  }
}
