import type { AlchemyState } from './alchemy';

export const CHALLENGE_RULES = {
  1: {
    title: 'Перегрузка', unlockBlock: 34,
    unlock: 'Открывается после прохождения 35-го квадрата.',
    condition: 'Зачистить поле 50×50 с четырёхкратной прочностью породы за 60 секунд.',
    size: 50, durationSeconds: 60, stoneMultiplier: 4,
    attackSpeedMultiplier: 1, movementSpeedMultiplier: 1, weaponSplash: true,
    reward: 'Открывает Воздух и уникальные улучшения вооружения.',
  },
  2: {
    title: 'Скоростной прорыв', unlockBlock: 39,
    unlock: 'Открывается после прохождения 40-го квадрата.',
    condition: 'Зачистить поле 12×12 с четырёхкратной прочностью породы за 30 секунд.',
    size: 12, durationSeconds: 30, stoneMultiplier: 4,
    attackSpeedMultiplier: 1.5, movementSpeedMultiplier: 1.35, weaponSplash: false,
    reward: 'Награда за прохождение сохраняется между забегами.',
  },
  3: {
    title: 'Тепловой шифр', unlockBlock: 44,
    unlock: 'Открывается после прохождения 45-го квадрата и Challenge 1.',
    condition: 'Накопите 10 000 элементального камня на карте 50×50. Арена каждую секунду возвращает 10% карты обычной породой. Уже существующие камни не восстанавливают прочность.',
    size: 50, durationSeconds: 0, stoneMultiplier: 1,
    attackSpeedMultiplier: 1, movementSpeedMultiplier: 1, weaponSplash: true,
    alchemySeed: { stone: 5000, earth: 2500, elementalStone: 0, water: 1000, air: 0, fire: 0 } as Partial<AlchemyState>,
    regenFraction: 0.1,
    reward: 'Открывает стихию Огня и автопокупку кристаллов.',
  },
  4: {
    title: 'Теорема существования', unlockBlock: 49,
    unlock: 'Открывается после прохождения 50-го квадрата.',
    condition: 'Пройдите отдельный забег из 50 квадратов стандартного размера. На первых 49 квадратах каждую секунду появляются обычные камни в объёме 5% карты и восстанавливается прочность оставшихся; последний квадрат не регенерирует.',
    size: 25, durationSeconds: 0, stoneMultiplier: 1,
    attackSpeedMultiplier: 1, movementSpeedMultiplier: 1, weaponSplash: true,
    regenFraction: 0.05, finishFraction: 0.05,
    reward: '???',
  },
} as const;

export type ChallengeId = keyof typeof CHALLENGE_RULES;
export type PlayableChallengeId = 1 | 2 | 3 | 4;
