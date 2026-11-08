import { BREACH_CONFIG as C } from '../../game/breachConfig';
import type { BreachState, StoneKind } from '../../game/breachTypes';
import { isSpecialUpgradeActive } from './breachSpecialUpgrades';
import { isSpectraUpgradeActive } from './breachSpectraUpgrades';

export interface BreachProgressionHost {
  readonly state: BreachState;
  remainingStones(): number;
  isBoss(block: number): boolean;
  move(x: number, y: number, seconds: number): void;
  stopBeam(): void;
  rebuildIndex(): void;
  challengeKind(block: number, x: number, y: number, size: number): StoneKind;
  challengeHealth(kind: StoneKind, block: number): number;
  completeChallenge4(): void;
  completeRun(): void;
  fail(): void;
  failBoss(): void;
  compress(): void;
}

/** Сменные правила продвижения по картам, ограничения времени и окончания забега. */
export class BreachProgression {
  constructor(private readonly host: BreachProgressionHost) {}
  tickBoss(seconds: number): boolean {
    const s = this.host.state;
    if (s.bossRemaining <= 0) return false;
    s.bossRemaining = Math.max(0, s.bossRemaining - seconds);
    if (s.bossRemaining > 0) return false;
    this.host.failBoss();
    return true;
  }
  compressIfReady(): boolean {
    const s = this.host.state;
    if (!isSpecialUpgradeActive(s, 'spatialCompressor') || s.challengeArena || this.host.isBoss(s.block) ||
      s.block >= C.blockCount - 1 || this.host.remainingStones() / (s.size * s.size) > 0.05) return false;
    this.host.compress();
    return true;
  }
  /** true означает, что данный шаг завершён и границу в нём двигать не нужно. */
  tickCleared(seconds: number): boolean {
    const s = this.host.state;
    this.host.stopBeam();
    this.host.move(s.x, -0.5, seconds);
    if (s.challengeArena && s.challengeNumber === 4) {
      if (s.y <= -0.5) {
        if (s.block >= C.blockCount - 1) { this.host.completeChallenge4(); return true; }
        s.block++;
        s.stones = [];
        for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
          const kind = this.host.challengeKind(s.block, x, y, s.size);
          const hp = this.host.challengeHealth(kind, s.block) * s.challenge4StoneMultiplier;
          s.stones.push({ block: s.block, x, y, hp, maxHp: hp, kind, neighbors: 0 });
        }
        this.host.rebuildIndex();
        s.x = Math.floor(s.size / 2); s.y = s.size - 0.5; s.target = null;
        s.projectiles = []; s.needleFollowUps = [];
      }
      return true;
    }
    if (s.block === C.blockCount - 1 && this.host.remainingStones() === 0) {
      if (s.y <= -0.5 && s.endChargeRemaining <= 0) {
        s.endChargeRemaining = C.finalChargeSeconds;
        s.message = 'Финальная граница. Зарядите пробивной удар.';
      }
      return true;
    }
    if (s.y <= -0.5) {
      const cleared = s.block;
      s.block++;
      if (isSpectraUpgradeActive(s, 'skipLayers') && this.host.isBoss(cleared)) s.block = Math.min(C.blockCount - 1, s.block + 2);
      if (s.tutorial === 'third' && s.block >= 3) {
        s.tutorial = 'done'; s.boundary = C.blockCount * s.size + C.boundaryHeadStart;
        s.message = 'Граница приближается. Продолжайте прорыв.';
      }
      s.furthestBlock = Math.max(s.furthestBlock, s.block);
      if (s.block % 5 === 0) { s.crystals++; s.message = 'Найден редкий кристалл.'; }
      if (s.block >= C.blockCount) this.host.completeRun();
      else {
        s.bossRemaining = this.host.isBoss(s.block) ? C.bossTimerSeconds : 0;
        s.y = s.size - 0.5; s.target = null; s.projectiles = []; s.needleFollowUps = [];
      }
    }
    return false;
  }
  tickBoundary(seconds: number): void {
    const s = this.host.state;
    if (s.boundary === null || s.challengeArena || s.bossRemaining > 0 || s.block >= C.blockCount - 1) return;
    s.boundary -= C.boundarySpeed * seconds;
    if (s.boundary <= s.block * s.size + s.size - s.y) this.host.fail();
  }
}
