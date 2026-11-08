import type { FrameworkConfig } from '../config/schema';

export interface StonePalette { stone: string; hard: string; elemental: string }

export const STONE_PALETTES: readonly StonePalette[] = [
  { stone: '#6e7b86', hard: '#8d758e', elemental: '#51a3a0' }, { stone: '#716f8d', hard: '#9b7796', elemental: '#65a7cc' },
  { stone: '#697d70', hard: '#8e8a63', elemental: '#83b179' }, { stone: '#81706c', hard: '#a28567', elemental: '#d38b62' },
  { stone: '#617d84', hard: '#718c9d', elemental: '#78c7d1' }, { stone: '#777084', hard: '#9a7899', elemental: '#c094d5' },
  { stone: '#77796b', hard: '#9c9069', elemental: '#c3b36e' }, { stone: '#66777d', hard: '#7e9392', elemental: '#8ac9b5' },
  { stone: '#766b68', hard: '#9a7771', elemental: '#d58c83' }, { stone: '#687083', hard: '#8086a3', elemental: '#a5b9ea' },
];

/** Общая палитра карты для Canvas и HTML-легенды, основанная на одном и том же индексе слоя. */
export function stonePaletteForLayer(layer: number, config: FrameworkConfig): StonePalette {
  const boss = (layer + 1) % config.world.bossEveryLayers === 0 && layer < config.world.layers - 1;
  const index = layer === config.world.layers - 1 ? 9 : (Math.floor(layer / config.world.bossEveryLayers) * 2 + Number(boss)) % STONE_PALETTES.length;
  return STONE_PALETTES[config.presentation.palettesEnabled ? index : 0];
}
