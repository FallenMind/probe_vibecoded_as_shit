/** Детерминированный двумерный градиентный шум Перлина для палитры породы. */
export function stoneNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const gradient = (gx: number, gy: number, dx: number, dy: number) => {
    let hash = Math.imul(gx, 374761393) + Math.imul(gy, 668265263) + Math.imul(seed, 1274126177);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const angle = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296 * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };
  const u = fade(fx), v = fade(fy);
  const a = gradient(ix, iy, fx, fy), b = gradient(ix + 1, iy, fx - 1, fy);
  const c = gradient(ix, iy + 1, fx, fy - 1), d = gradient(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
