import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachState, Stone } from '../../../game/breachTypes';
import type { DashPath } from './contracts';
import { isSpecialUpgradeActive } from '../breachSpecialUpgrades';

export interface MeleeDashHost {
  readonly state: BreachState;
  stones(): readonly Stone[];
  spearRadius(): number;
  clearBlocker(stone: Stone): void;
  showDash(path: DashPath): void;
  canDash(): boolean;
  teleport(x: number, y: number): boolean;
}

export class BreachMeleeDash {
  constructor(private readonly host: MeleeDashHost) {}
  spear(): DashPath | null {
    const s = this.host.state;
    if (!this.host.canDash()) return null;
    const stones = this.host.stones();
    const occupied = new Set(stones.map(stone => `${stone.x}:${stone.y}`));
    const radius = Math.min(C.spearRadiusMax, this.host.spearRadius());
    let destination: { x: number; y: number } | null = null;
    let blocker: Stone | undefined;
    let bestScore = -1, bestTravel = Infinity;
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      const travel = Math.hypot(x - s.x, y - s.y);
      if (travel > C.spearDashRange || occupied.has(`${x}:${y}`)) continue;
      const hitSet = new Set<Stone>();
      const dx = x - s.x, dy = y - s.y, length = Math.hypot(dx, dy);
      for (const stone of stones) {
        if (Math.hypot(stone.x - x, stone.y - y) <= radius) hitSet.add(stone);
        if (isSpecialUpgradeActive(s, 'spearEnchant') && length > 0) {
          const rx = stone.x - s.x, ry = stone.y - s.y;
          const along = (rx * dx + ry * dy) / length, across = Math.abs(rx * dy - ry * dx) / length;
          if (along >= 0 && along <= length && across <= 0.75) hitSet.add(stone);
        }
      }
      if (hitSet.size > bestScore || (hitSet.size === bestScore && travel < bestTravel)) {
        destination = { x, y }; bestScore = hitSet.size; bestTravel = travel;
      }
    }
    if (!destination) {
      blocker = stones.filter(stone => Math.hypot(stone.x - s.x, stone.y - s.y) <= C.spearDashRange)
        .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (!blocker) return null;
      destination = { x: blocker.x, y: blocker.y };
    }
    const path = { fromX: s.x, fromY: s.y, toX: destination.x, toY: destination.y };
    if (!this.host.teleport(destination.x, destination.y)) return null;
    if (blocker) this.host.clearBlocker(blocker);
    this.host.showDash(path);
    return path;
  }
  pick(target: Stone): DashPath | null {
    const s = this.host.state;
    if (!this.host.canDash()) return null;
    const dx = target.x - s.x, dy = target.y - s.y, distance = Math.hypot(dx, dy);
    const fromX = s.x, fromY = s.y;
    if (distance > 0) {
      const dash = Math.min(C.pickDashRange, distance);
      const toX = s.x + dx / distance * dash, toY = s.y + dy / distance * dash;
      if (!this.host.teleport(toX, toY)) return null;
      this.host.showDash({ fromX, fromY, toX, toY });
    }
    s.pickDash = true;
    return { fromX, fromY, toX: s.x, toY: s.y };
  }
}
