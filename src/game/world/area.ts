import type { Point } from '../core/model';
import type { TileBounds } from './mapAccess';

/** Координаты локальны для одной карты. Радиусы и размеры задаются в клетках. */
export type TileArea =
  | { shape: 'circle'; center: Point; radius: number }
  | { shape: 'arc'; center: Point; radius: number; direction: Point; degrees: number }
  | { shape: 'cross'; center: Point; radius: number }
  | { shape: 'rectangle'; bounds: TileBounds }
  | { shape: 'path'; from: Point; to: Point; radius: number };

export interface AreaSelection { mapId: string; area: TileArea; excludeTileIds?: readonly string[] }
export interface FalloffOptions { damage: number; radius: number; edgeMultiplier: number; exponent?: number; startDistance?: number; curve?: 'linear' | 'smoothstep' }

/** Создаёт правило урона для damageArea; броня и пробитие применяются отдельно. */
export function createFalloffDamage(options: FalloffOptions): (_tile: unknown, distance: number) => number {
  const { damage, radius, edgeMultiplier, exponent = 1, startDistance = 0, curve = 'linear' } = options;
  if (!Number.isFinite(damage) || damage < 0 || !validRadius(radius) || !Number.isFinite(edgeMultiplier) || edgeMultiplier < 0 || edgeMultiplier > 1 ||
      !validRadius(startDistance) || startDistance > radius || !Number.isFinite(exponent) || exponent <= 0 || (curve !== 'linear' && curve !== 'smoothstep')) throw new Error('Некорректные параметры затухания');
  return (_tile, distance) => {
    if (!Number.isFinite(distance) || distance < 0) throw new Error('Некорректное расстояние');
    const t = radius === startDistance ? Number(distance > startDistance) : Math.min(1, Math.max(0, (distance - startDistance) / (radius - startDistance)));
    const eased = curve === 'smoothstep' ? t * t * (3 - 2 * t) : t;
    return damage * (edgeMultiplier + (1 - edgeMultiplier) * (1 - eased) ** exponent);
  };
}

function validPoint(point: Point): boolean { return Number.isFinite(point.x) && Number.isFinite(point.y); }
function validRadius(radius: number): boolean { return Number.isFinite(radius) && radius >= 0; }

export function validateArea(area: TileArea): void {
  if (area.shape === 'rectangle') {
    const b = area.bounds;
    if (![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) || b.minX > b.maxX || b.minY > b.maxY) throw new Error('Некорректные границы области');
  } else if (area.shape === 'path') {
    if (!validPoint(area.from) || !validPoint(area.to) || !validRadius(area.radius)) throw new Error('Некорректная область траектории');
  } else {
    if (!validPoint(area.center) || !validRadius(area.radius)) throw new Error('Некорректная область');
    if (area.shape === 'arc' && (!validPoint(area.direction) || !Number.isFinite(area.degrees) || area.degrees < 0 || area.degrees > 360 || Math.hypot(area.direction.x, area.direction.y) === 0)) throw new Error('Некорректное направление или угол дуги');
  }
}

export function areaBounds(area: TileArea): TileBounds {
  if (area.shape === 'rectangle') return { ...area.bounds };
  if (area.shape === 'path') return { minX: Math.min(area.from.x, area.to.x) - area.radius, maxX: Math.max(area.from.x, area.to.x) + area.radius, minY: Math.min(area.from.y, area.to.y) - area.radius, maxY: Math.max(area.from.y, area.to.y) + area.radius };
  return { minX: area.center.x - area.radius, maxX: area.center.x + area.radius, minY: area.center.y - area.radius, maxY: area.center.y + area.radius };
}

/** Расстояние от клетки до центра, прямоугольника или ближайшей точки отрезка. */
export function areaDistance(area: TileArea, point: Point): number {
  if (area.shape === 'rectangle') {
    const b = area.bounds;
    return Math.hypot(Math.max(b.minX - point.x, 0, point.x - b.maxX), Math.max(b.minY - point.y, 0, point.y - b.maxY));
  }
  if (area.shape === 'path') {
    const dx = area.to.x - area.from.x, dy = area.to.y - area.from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - area.from.x) * dx + (point.y - area.from.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (area.from.x + t * dx), point.y - (area.from.y + t * dy));
  }
  return Math.hypot(point.x - area.center.x, point.y - area.center.y);
}

export function areaContains(area: TileArea, point: Point): boolean {
  const distance = areaDistance(area, point);
  if (area.shape === 'rectangle') return distance === 0;
  if (distance > area.radius + 1e-10) return false;
  if (area.shape === 'cross') return point.x === area.center.x || point.y === area.center.y;
  if (area.shape !== 'arc' || distance === 0 || area.degrees === 360) return true;
  const dx = point.x - area.center.x, dy = point.y - area.center.y;
  const dot = (dx * area.direction.x + dy * area.direction.y) / (distance * Math.hypot(area.direction.x, area.direction.y));
  return dot + 1e-10 >= Math.cos(area.degrees * Math.PI / 360);
}

/** Выборка не зависит от хранения карты: один и тот же расчёт подходит и переходной игре, и новой модели. */
export function selectItemsInArea<T>(items: Iterable<T>, area: TileArea, position: (item: T) => Point): T[] {
  validateArea(area);
  return Array.from(items).filter(item => areaContains(area, position(item)));
}
