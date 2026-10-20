/** Настройки появления игровых событий. Время указано в секундах, вероятность — от 0 до 1. */
export const EVENT_CONFIG = {
  exploration: {
    baseDurationSeconds: 12,
    minDurationSeconds: 4,
    durationReductionPerAntennaLevel: 0.9,
  },
  travel: {
    baseDurationSeconds: 3,
    minDurationSeconds: 1.5,
    durationReductionPerScannerLevel: 0.35,
  },
  asteroid: {
    baseHP: 20,
    hpGrowthPerSector: 0.06,
    baseOre: 14,
    orePerSector: 4,
    oreBonusPerScannerLevel: 0.1,
    minRichnessMultiplier: 0.85,
    richnessMultiplierSpread: 0.3,
    names: [
      'Церерия-7',
      'Рудный Обломок',
      'Камень Кеплера',
      'Глыба Ноктис',
      'Кусок Хаоса',
      'Осколок Валентины',
      'Астероид Люмен',
      'Гость Сириуса',
      'Камень Мёрфи',
      'Харон-малый',
    ],
  },
  storm: {
    chanceAfterMining: 0.35,
    durationSeconds: 6,
    graceSeconds: 2,
    baseDamagePerSecond: 5,
    damageGrowthPerSector: 0.03,
    maxHullDamagePerSecond: 0.33,
  },
  mystery: {
    baseDataRequired: 250,
    dataRequirementGrowth: 1.9,
    // Накопительные пороги: руда 40%, ремонт 30%, энергия 20%, данные — оставшиеся 10%.
    outcomeThresholds: { ore: 0.4, repair: 0.7, energy: 0.9 },
  },
} as const;
