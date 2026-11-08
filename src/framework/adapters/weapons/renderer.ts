import type Phaser from 'phaser';
import { BREACH_CONFIG as C } from '../../../game/breachConfig';
import type { BreachState, WeaponId } from '../../../game/breachTypes';

export interface BreachWeaponAnimation { weapon: WeaponId; angle: number; x: number; y: number; remaining: number; charged: boolean; dashFromX?: number; dashFromY?: number; dashToX?: number; dashToY?: number }
export interface BreachDashAnimation { fromX: number; fromY: number; toX: number; toY: number; remaining: number }
export interface BreachWeaponVisuals {
  animations: readonly BreachWeaponAnimation[]; dashes: readonly BreachDashAnimation[];
  beam: { x: number; y: number } | null; beamTarget: { x: number; y: number } | null;
  emitterBlastRadius(level: number): number;
}

/** Phaser-адаптер отображения; игровые попадания вычисляются отдельно. */
export class BreachWeaponRenderer {
  draw(g: Phaser.GameObjects.Graphics, state: BreachState, tile: number, px: (x: number) => number, py: (y: number) => number, pickSprite: Phaser.GameObjects.Image, spearSprite: Phaser.GameObjects.Image, visual: { x: number; y: number; alpha: number; previousBeam: { x: number; y: number } | null; offset: number }, data: BreachWeaponVisuals): void {
    const x = px(visual.x), y = py(visual.y);
    for (const dash of data.dashes) {
      const progress = Math.max(0, Math.min(1, 1 - (dash.remaining - visual.offset) / C.dashEffectSeconds));
      g.lineStyle(Math.max(3, tile * 0.3), 0x79e5df, (1 - progress) * 0.35);
      g.lineBetween(px(dash.fromX), py(dash.fromY), px(dash.toX), py(dash.toY));
      g.lineStyle(Math.max(1, tile * 0.08), 0xd9fff4, (1 - progress) * 0.85);
      g.lineBetween(px(dash.fromX), py(dash.fromY), px(dash.toX), py(dash.toY));
      g.fillStyle(0x9df5ed, (1 - progress) * 0.5);
      g.fillCircle(px(dash.toX), py(dash.toY), tile * (0.3 + progress * 0.5));
    }
    if (data.beam && state.rangedWeapon === 'emitter') {
      const from = visual.previousBeam ?? data.beam;
      const bx = px(from.x + (data.beam.x - from.x) * visual.alpha);
      const by = py(from.y + (data.beam.y - from.y) * visual.alpha);
      g.lineStyle(Math.max(5, tile * 0.38), 0x39c8d1, 0.25);
      g.lineBetween(x, y, bx, by);
      g.lineStyle(Math.max(2, tile * 0.13), 0xb9ffff, 0.95);
      g.lineBetween(x, y, bx, by);
      g.fillStyle(0x6fe4df, 0.18);
      g.fillCircle(bx, by, tile * (data.emitterBlastRadius(state.emitterAreaLevel) + 0.4));
      if (data.beamTarget) {
        g.lineStyle(Math.max(1, tile * 0.06), 0xffe19a, 0.7);
        g.strokeCircle(px(data.beamTarget.x), py(data.beamTarget.y), tile * (data.emitterBlastRadius(state.emitterAreaLevel) + 0.4));
        g.lineBetween(bx, by, px(data.beamTarget.x), py(data.beamTarget.y));
      }
    }
    const pickEffect = data.animations.find(effect => effect.weapon === 'pick');
    const spearEffect = data.animations.find(effect => effect.weapon === 'spear');
    let pickAngle = state.target ? Math.atan2(state.target.y - visual.y, state.target.x - visual.x) : -Math.PI / 2;
    if (pickEffect) {
      const duration = pickEffect.charged ? C.chargedAttackSeconds : C.animationSeconds;
      const progress = Math.max(0, Math.min(1, 1 - (pickEffect.remaining - visual.offset) / duration));
      const sweep = C.pickArcDegrees * Math.PI / 180;
      if (pickEffect.charged) {
        const swing = progress < 0.68 ? 0 : Math.min(1, (progress - 0.68) / 0.32);
        pickAngle = pickEffect.angle - 1.1 + (swing * 1.1);
      } else pickAngle = pickEffect.angle - sweep / 2 + sweep * progress;
    }
    pickSprite.setVisible(state.weapon === 'pick');
    const pickSize = tile * (3.2 + 0.5 * state.pickLevel + 0.5 * state.pickReachLevel);
    const spearLength = tile * (4.2 + 0.5 * state.spearLevel + 0.5 * state.spearReachLevel);
    if (state.weapon === 'pick') pickSprite.setPosition(x, y).setDisplaySize(pickSize, pickSize).setRotation(pickAngle + Math.PI / 4);
    spearSprite.setVisible(state.weapon === 'spear');
    if (state.weapon === 'spear' && !spearEffect?.charged) {
      const spin = spearEffect ? Math.max(0, Math.min(1, 1 - (spearEffect.remaining - visual.offset) / C.animationSeconds)) * Math.PI * 4 : 0;
      spearSprite.setPosition(x, y).setDisplaySize(spearLength, spearLength * 0.29).setRotation(spin + Math.PI / 4);
    }
    for (const effect of data.animations) {
    if (effect.weapon !== 'ranged' && effect.weapon !== state.weapon) continue;
    const duration = effect.charged ? C.chargedAttackSeconds : C.animationSeconds;
    const progress = Math.max(0, Math.min(1, 1 - (effect.remaining - visual.offset) / duration));
    if (effect.weapon === 'ranged') {
      g.lineStyle(Math.max(2, tile * 0.15), 0x8fe2df, 1 - progress);
      g.lineBetween(x, y, px(effect.x), py(effect.y));
      g.fillStyle(0xb5ffff, 1 - progress);
      g.fillCircle(px(effect.x), py(effect.y), tile * (0.35 + progress * 0.4));
      continue;
    }
    if (effect.weapon === 'pick') {
      if (effect.charged) {
        const impactProgress = Math.max(0, Math.min(1, (progress - 0.68) / 0.32));
        const radius = tile * (0.35 + impactProgress * 0.9);
        g.lineStyle(Math.max(2, tile * 0.12), 0xffcf82, (1 - impactProgress) * 0.85);
        g.strokeCircle(px(effect.x), py(effect.y), radius);
        g.fillStyle(0xffe7ad, Math.max(0, 0.25 * (1 - impactProgress)));
        g.fillCircle(px(effect.x), py(effect.y), radius * 0.55);
      } else {
        const direction = effect.angle - Math.PI * 0.8 + progress * Math.PI * 1.6;
        const reach = tile * (1.05 + progress * 0.25);
        g.lineStyle(Math.max(2, tile * 0.1), 0xffc16c, 0.8 * (1 - progress * 0.4));
        g.lineBetween(x, y, x + Math.cos(direction) * reach, y + Math.sin(direction) * reach);
        g.strokeCircle(px(effect.x), py(effect.y), tile * (0.16 + 0.3 * (1 - progress)));
      }
      continue;
    }
    if (effect.weapon === 'spear') {
      if (effect.charged) {
        const fromX = effect.dashFromX ?? visual.x, fromY = effect.dashFromY ?? visual.y;
        const toX = effect.dashToX ?? effect.x, toY = effect.dashToY ?? effect.y;
        const sourceX = px(fromX), sourceY = py(fromY), landingX = px(toX), landingY = py(toY);
        const flightAngle = Math.atan2(landingY - sourceY, landingX - sourceX) + Math.PI / 4;
        if (progress < 0.22) {
          const spin = progress / 0.22;
          spearSprite.setVisible(true).setPosition(sourceX, sourceY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(spin * Math.PI * 8 + Math.PI / 4);
          g.lineStyle(Math.max(2, tile * 0.08), 0x9d78e8, 0.48 * spin);
          g.strokeCircle(sourceX, sourceY, tile * (0.45 + spin * 1.15));
        } else if (progress < 0.68) {
          const flight = Math.max(0, Math.min(1, (progress - 0.22) / 0.46));
          const easeFlight = flight * flight * (3 - 2 * flight);
          const spearX = sourceX + (landingX - sourceX) * easeFlight;
          const spearY = sourceY + (landingY - sourceY) * easeFlight;
          spearSprite.setVisible(true).setPosition(spearX, spearY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(flightAngle);
          g.lineStyle(Math.max(2, tile * 0.13), 0x9df4ec, 0.65 * (1 - flight));
          g.lineBetween(sourceX, sourceY, spearX, spearY);
        } else {
          const impact = Math.max(0, Math.min(1, (progress - 0.68) / 0.32));
          const targetX = px(effect.x), targetY = py(effect.y);
          spearSprite.setVisible(true).setPosition(landingX, landingY).setDisplaySize(spearLength, spearLength * 0.3).setRotation(flightAngle);
          g.fillStyle(0x9df4ec, 0.18 * (1 - impact));
          g.fillCircle(landingX, landingY, tile * (0.35 + impact * 0.8));
          g.lineStyle(Math.max(2, tile * 0.14), 0x8df4e6, 0.8 * (1 - impact));
          g.strokeCircle(targetX, targetY, tile * (0.45 + impact * 1.25));
          g.lineStyle(Math.max(1, tile * 0.07), 0xd1a6ff, 0.7 * (1 - impact));
          g.strokeCircle(landingX, landingY, tile * (0.25 + impact * 0.55));
        }
      } else {
        const rotation = progress * Math.PI * 4;
        const radius = tile * 1.65;
        g.lineStyle(Math.max(2, tile * 0.07), 0x75d9cf, 0.3);
        g.strokeCircle(x, y, radius);
        const impactRadius = tile * (0.25 + progress * 0.65);
        g.lineStyle(Math.max(2, tile * 0.1), 0x83eee1, (1 - progress) * 0.8);
        g.strokeCircle(px(effect.x), py(effect.y), impactRadius);
        spearSprite.setVisible(true).setPosition(x, y).setDisplaySize(spearLength, spearLength * 0.29).setRotation(rotation + Math.PI / 4);
      }
      continue;
    }
    const sweep = Math.PI / 3;
    const direction = effect.angle - sweep / 2 + sweep * progress;
    const radius = tile * 1.1;
    g.lineStyle(Math.max(3, tile * 0.2), 0xeac99f, 1 - progress * 0.5);
    g.lineBetween(x, y, x + Math.cos(direction) * radius, y + Math.sin(direction) * radius);
    g.fillStyle(0xffe5b0, 1 - progress);
    g.fillCircle(x + Math.cos(direction) * radius, y + Math.sin(direction) * radius, Math.max(3, tile * 0.25));
    }
  }
}
