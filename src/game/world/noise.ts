/** Детерминированный двумерный градиентный шум для генерации карты и её текстуры. */
const gradientDirections = new Map<number, readonly [number, number]>();

export function stoneTextureNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const gradient = (gx: number, gy: number, dx: number, dy: number) => {
    let hash = Math.imul(gx, 374761393) + Math.imul(gy, 668265263) + Math.imul(seed, 1274126177);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const key = (hash ^ (hash >>> 16)) >>> 0;
    let direction = gradientDirections.get(key);
    if (!direction) {
      const angle = key / 4294967296 * Math.PI * 2;
      direction = [Math.cos(angle), Math.sin(angle)];
      if (gradientDirections.size >= 32768) gradientDirections.clear();
      gradientDirections.set(key, direction);
    }
    return direction[0] * dx + direction[1] * dy;
  };
  const u = fade(fx), v = fade(fy);
  const a = gradient(ix, iy, fx, fy), b = gradient(ix + 1, iy, fx - 1, fy);
  const c = gradient(ix, iy + 1, fx, fy - 1), d = gradient(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
