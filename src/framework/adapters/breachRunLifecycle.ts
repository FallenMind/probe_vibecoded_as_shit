import { isCycleUpgradeActive } from './breachCycleEffects';
import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState } from '../../game/breachTypes';

export interface BreachRunHost {
  readonly state: BreachState;
  createMap(): void;
  beginResetEffect(): void;
  beginCompressorEffect(x: number, y: number): void;
  stopBeam(): void;
  isBoss(block: number): boolean;
  waterCapacity(): number;
}

/** Правила окончания и сброса забега, независимые от отображения эффектов. */
export class BreachRunLifecycle {
  constructor(private readonly host: BreachRunHost) {}
  resetOrdinaryResources(): void {
    const s = this.host.state;
    s.ore = 0; s.reagent = 0; s.reagentClock = 0; s.charges = 0; s.buffRemaining = 0;
    Object.assign(s.alchemy, { stone: 0, elementalStone: 0, earth: 0, water: 0, air: 0, fire: 0, earthClock: 0, waterClock: 0, fireClock: 0 });
    s.earthOverloadRemaining = 0; s.earthOverloadCounter = 0; s.earthOverloadUsed = false;
  }
  fail(): void {
    const s = this.host.state;
    this.host.beginResetEffect();
    this.host.stopBeam();
    this.resetOrdinaryResources();
    s.message = 'Граница настигла первопроходца. Улучшения и редкие ресурсы сохранены.';
    this.host.createMap();
  }
  failBoss(): void {
    const s = this.host.state;
    const failedWave = s.block + 1;
    const restartBlock = Math.floor((failedWave - 1) / C.bossEveryBlocks) * C.bossEveryBlocks;
    const furthestBlock = s.furthestBlock;
    this.host.beginResetEffect();
    this.host.stopBeam();
    this.host.createMap();
    s.block = restartBlock; s.furthestBlock = furthestBlock;
    s.x = Math.floor(s.size / 2); s.y = s.size - 0.5; s.target = null; s.bossRemaining = 0;
    s.boundary = s.tutorial === 'done' ? C.blockCount * s.size + C.boundaryHeadStart : null;
    s.message = `Время босса ${failedWave} истекло. Ресурсы сохранены; повторный заход с квадрата ${restartBlock + 1}.`;
  }
  complete(): void {
    const s = this.host.state;
    s.furthestBlock = Math.max(s.furthestBlock, C.blockCount);
    s.breakthrough++; s.completions++;
    s.message = 'Граница 50-го квадрата проломлена. Получено очко прорывателя.';
    this.resetOrdinaryResources();
    if (isCycleUpgradeActive(s, 'cycle7')) s.alchemy.water = Math.min(this.host.waterCapacity(), 100);
    this.host.createMap();
  }
  compress(): void {
    const s = this.host.state;
    s.block++;
    s.furthestBlock = Math.max(s.furthestBlock, s.block);
    const milestone = s.block < C.blockCount && s.block % 5 === 0;
    if (s.block < C.blockCount) {
      s.y = s.size - 0.5; s.target = null; s.projectiles = []; s.needleFollowUps = [];
      s.attackClock = 0; s.pickDash = false;
      this.host.stopBeam();
    }
    s.bossRemaining = this.host.isBoss(s.block) ? C.bossTimerSeconds : 0;
    s.y = s.size - 0.5; s.target = null; s.attackClock = 0; s.pickDash = false;
    this.host.stopBeam();
    s.message = 'Пространственный сжиматель перенёс вас на следующий слой.';
    if (milestone) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
    this.host.beginCompressorEffect(s.size / 2, s.size / 2);
  }
}
