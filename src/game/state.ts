/**
 * Ядро IDLE-игры «Зонд „Пионер“».
 *
 * Игрок управляет автономным исследовательским зондом в далёкой системе.
 * Основной цикл: Исследование → Встреча с астероидом → Добыча → Перелёт
 * (иногда — солнечная буря). Всему мешают медленное накопление данных,
 * износ корпуса и ограниченная энергия.
 */

export type Activity = 'explore' | 'mine' | 'travel' | 'storm' | 'charge' | 'dead';

export interface LogEntry {
  t: number;
  msg: string;
}

export interface GameState {
  /** Ресурсы */
  energy: number; // текущая энергия
  ore: number; // руда / материалы
  data: number; // научные данные
  hull: number; // целостность корпуса

  /** Позиция в системе */
  distance: number;
  sector: number;

  /** Текущая фаза цикла */
  activity: Activity;
  activityProgress: number; // 0..1

  /** Астероид */
  asteroidHP: number;
  asteroidMaxHP: number;
  asteroidRich: number;
  asteroidName: string;

  /** Буря */
  stormTimer: number;
  shieldTimer: number;

  /** Прогресс */
  mysteriesFound: number;
  totalData: number;
  totalOre: number;
  clicks: number;
  playTime: number;

  log: LogEntry[];
  upgrades: Record<string, number>;

  lastSave: number;
  offlineMsg: string | null;
  pendingToast: string | null;
}

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  cost: (level: number) => number;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'energy',
    name: 'Энергоячейка',
    icon: '🔋',
    desc: '+30 ⚡ макс. энергии, +0.6 ⚡/с регенерации',
    maxLevel: 25,
    cost: (l) => Math.ceil(45 * Math.pow(1.6, l)),
  },
  {
    id: 'laser',
    name: 'Добывающий лазер',
    icon: '⛏️',
    desc: '+2 урона по астероиду, +15% руды за добычу',
    maxLevel: 25,
    cost: (l) => Math.ceil(40 * Math.pow(1.65, l)),
  },
  {
    id: 'antenna',
    name: 'Антенна',
    icon: '📡',
    desc: '+0.9 📡/с, исследование проходит быстрее',
    maxLevel: 25,
    cost: (l) => Math.ceil(55 * Math.pow(1.7, l)),
  },
  {
    id: 'armor',
    name: 'Бронеплиты',
    icon: '🛡️',
    desc: '+40 корпуса, −12% урона от среды',
    maxLevel: 25,
    cost: (l) => Math.ceil(60 * Math.pow(1.75, l)),
  },
  {
    id: 'scanner',
    name: 'Сканер',
    icon: '🧲',
    desc: 'Астероиды богаче, перелёты короче',
    maxLevel: 25,
    cost: (l) => Math.ceil(50 * Math.pow(1.7, l)),
  },
];

export const SECTOR_NAMES = [
  'Пояс Ориона',
  'Туманность Клешня',
  'Облако Кси',
  'Кольца Гелиоса',
  'Море Тьмы',
  'Пустошь Нова',
  'Орбита Кайроса',
  'Шельф Медузы',
  'Глубина Веги',
  'Ветры Аида',
  'Скопление Пыли',
  'Тень Леты',
  'Террасы Рокса',
  'Жерло Таласа',
  'Ледяная Марка',
  'Хребет Уми',
  'Небеса Зарры',
  'Пламя Одина',
  'Сон Квазара',
  'Предел Авроры',
];

const ASTEROID_NAMES = [
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
];

// ---------------------------------------------------------------------------
// Производные характеристики (зависят от уровня улучшений)
// ---------------------------------------------------------------------------

export function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

function maxEnergy(s: GameState): number {
  return 100 + 30 * upgradeLevel(s, 'energy');
}

function energyRegen(s: GameState): number {
  return 3 + 0.6 * upgradeLevel(s, 'energy');
}

function dataPerSec(s: GameState): number {
  const base = 1.2 + 0.9 * upgradeLevel(s, 'antenna');
  return base * (1 + 0.1 * s.mysteriesFound) * (1 + 0.045 * s.sector);
}

function hullMax(s: GameState): number {
  return 100 + 40 * upgradeLevel(s, 'armor');
}

function armorResist(s: GameState): number {
  return Math.min(0.75, 0.08 + 0.12 * upgradeLevel(s, 'armor'));
}

function miningDamage(s: GameState): number {
  return 2.5 + 2 * upgradeLevel(s, 'laser');
}

export function exploreDuration(s: GameState): number {
  return Math.max(4, 12 - 0.9 * upgradeLevel(s, 'antenna'));
}

function travelDuration(s: GameState): number {
  return Math.max(1.5, 3 - 0.35 * upgradeLevel(s, 'scanner'));
}

function stormDps(s: GameState): number {
  return 5 * (1 + 0.03 * s.sector) * (1 - armorResist(s));
}

export function repairCost(s: GameState): number {
  if (s.activity === 'dead') return Math.ceil(hullMax(s) * 0.45);
  const missing = hullMax(s) - s.hull;
  return Math.ceil(missing * 0.5);
}

export function nextMysteryData(s: GameState): number {
  return Math.round(250 * Math.pow(1.9, s.mysteriesFound));
}

export function sectorOf(distance: number): number {
  return Math.floor(distance / 400);
}

export function sectorName(s: GameState): string {
  if (s.sector < SECTOR_NAMES.length) return SECTOR_NAMES[s.sector];
  return `Сектор Д-${s.sector - SECTOR_NAMES.length + 1}`;
}

export function clickData(s: GameState): number {
  return 4 + 2 * upgradeLevel(s, 'antenna');
}

export function clickMineDmg(s: GameState): number {
  return 3 + 2 * upgradeLevel(s, 'laser');
}

export function emergencyOre(s: GameState): number {
  return 3 + 2 * upgradeLevel(s, 'laser');
}

export function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' млрд';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' млн';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

// ---------------------------------------------------------------------------
// События (тосты для UI и сцены)
// ---------------------------------------------------------------------------

type ToastListener = (msg: string) => void;

const toastListeners = new Set<ToastListener>();

export function onToast(cb: ToastListener): () => void {
  toastListeners.add(cb);
  return () => toastListeners.delete(cb);
}

function toast(s: GameState, msg: string): void {
  s.pendingToast = msg;
  toastListeners.forEach((cb) => cb(msg));
}

function log(s: GameState, msg: string): void {
  s.log.push({ t: s.playTime, msg });
  if (s.log.length > 6) s.log.shift();
}

// ---------------------------------------------------------------------------
// Создание состояния
// ---------------------------------------------------------------------------

function createState(): GameState {
  return {
    energy: 100,
    ore: 0,
    data: 0,
    hull: 100,
    distance: 0,
    sector: 0,
    activity: 'explore',
    activityProgress: 0,
    asteroidHP: 20,
    asteroidMaxHP: 20,
    asteroidRich: 18,
    asteroidName: ASTEROID_NAMES[0],
    stormTimer: 0,
    shieldTimer: 0,
    mysteriesFound: 0,
    totalData: 0,
    totalOre: 0,
    clicks: 0,
    playTime: 0,
    log: [{ t: 0, msg: '🚀 Зонд «Пионер» начал исследование системы' }],
    upgrades: {},
    lastSave: Date.now(),
    offlineMsg: null,
    pendingToast: null,
  };
}

// ---------------------------------------------------------------------------
// Сохранение / загрузка
// ---------------------------------------------------------------------------

const SAVE_KEY = 'probe-idle-save-v1';

export function saveGame(s: GameState): void {
  s.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — игнорируем */
  }
}

export function resetGame(s: GameState): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  Object.assign(s, createState());
}

function applyOffline(s: GameState): void {
  const elapsedSec = Math.max(0, (Date.now() - s.lastSave) / 1000);
  if (elapsedSec < 60) return;
  const cap = 8 * 3600;
  const away = Math.min(elapsedSec, cap);

  const rate = dataPerSec(s) * 0.4;
  s.data += rate * away;
  s.totalData += rate * away;

  const cycleDur = exploreDuration(s) + travelDuration(s) + 9 + (s.activity === 'storm' ? 6 : 0);
  const cycles = Math.max(0, away / cycleDur) * 0.5;
  const rich = (14 + 4 * s.sector) * (1 + 0.1 * upgradeLevel(s, 'scanner'));
  const orePerCycle = rich * (1 + 0.15 * upgradeLevel(s, 'laser'));
  const oreGain = Math.floor(orePerCycle * cycles);
  if (oreGain > 0) {
    s.ore += oreGain;
    s.totalOre += oreGain;
  }

  s.hull = Math.max(5, s.hull - away * 0.1);
  if (s.hull <= 0) {
    s.hull = 5;
    s.activity = 'charge';
  }
  s.distance += away * 10;
  s.sector = sectorOf(s.distance);

  const h = Math.floor(away / 3600);
  const m = Math.floor((away % 3600) / 60);
  s.offlineMsg = `Пока вас не было (${h} ч ${m} мин): +${fmt(rate * away)} 📡, +${oreGain} 🪨`;
  log(s, '📡 Данные с прошлой сессии обработаны');
}

export function loadGame(): GameState {
  const s = createState();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameState>;
      Object.assign(s, parsed);
      s.activity = parsed.activity ?? 'explore';
      s.pendingToast = null;
      applyOffline(s);
    }
  } catch {
    /* повреждённое сохранение — стартуем заново */
  }
  return s;
}

/**
 * Единственный экземпляр состояния, разделяемый между UI (main.ts)
 * и сценой корабля (GameScene.ts). Игровой цикл мутирует его на месте.
 */
export const gameState: GameState = loadGame();

// ---------------------------------------------------------------------------
// Игровой цикл
// ---------------------------------------------------------------------------

function drain(s: GameState, rate: number, dt: number): void {
  s.energy = Math.max(0, s.energy - rate * dt);
}

function checkSector(s: GameState): void {
  const next = sectorOf(s.distance);
  if (next > s.sector) {
    s.sector = next;
    const bonus = 8 + 4 * s.sector;
    s.ore += bonus;
    s.totalOre += bonus;
    const msg = `🌌 Новый сектор: ${sectorName(s)} (+${bonus} 🪨)`;
    log(s, msg);
    toast(s, msg);
  }
}

function checkMystery(s: GameState): void {
  let guard = 0;
  while (s.data >= nextMysteryData(s) && guard < 20) {
    guard += 1;
    s.mysteriesFound += 1;
    let msg = '';
    const r = Math.random();
    if (r < 0.4) {
      const v = Math.round(40 + 25 * s.sector);
      s.ore += v;
      s.totalOre += v;
      msg = `🧬 Тайна разгадана! Обнаружены залежи: +${v} 🪨`;
    } else if (r < 0.7) {
      s.hull = hullMax(s);
      msg = '🧬 Тайна разгадана! Найдено средство ремонта: корпус восстановлен';
    } else if (r < 0.9) {
      s.energy = maxEnergy(s);
      msg = '🧬 Тайна разгадана! Энергополе переполнено: ⚡ до максимума';
    } else {
      const v = dataPerSec(s) * 30;
      s.data += v;
      s.totalData += v;
      msg = `🧬 Тайна разгадана! Поток данных: +${fmt(v)} 📡`;
    }
    log(s, msg);
    toast(s, msg);
  }
}

function spawnAsteroid(s: GameState): void {
  const rich = (14 + 4 * s.sector) * (1 + 0.1 * upgradeLevel(s, 'scanner')) * (0.85 + Math.random() * 0.3);
  const hp = 20 * (1 + 0.06 * s.sector);
  s.asteroidMaxHP = Math.round(hp);
  s.asteroidHP = s.asteroidMaxHP;
  s.asteroidRich = Math.round(rich);
  s.asteroidName = ASTEROID_NAMES[Math.floor(Math.random() * ASTEROID_NAMES.length)];
  toast(s, `☄️ На радаре астероид «${s.asteroidName}»`);
}

export function tick(s: GameState, dt: number): void {
  dt = Math.min(dt, 1);
  s.playTime += dt;

  const regenMult = s.activity === 'charge' ? 3 : 1;
  s.energy = Math.min(maxEnergy(s), s.energy + energyRegen(s) * dt * regenMult);

  switch (s.activity) {
    case 'explore': {
      const dur = exploreDuration(s);
      s.activityProgress += dt / dur;
      const gain = dataPerSec(s) * dt;
      s.data += gain;
      s.totalData += gain;
      s.distance += (16 * (1 + 0.05 * s.sector)) * dt;
      s.hull = Math.max(1, s.hull - 0.12 * dt);
      drain(s, 0.8, dt);
      checkSector(s);
      checkMystery(s);
      if (s.activityProgress >= 1) {
        spawnAsteroid(s);
        s.activity = 'mine';
        s.activityProgress = 0;
      }
      break;
    }
    case 'mine': {
      const dmg = miningDamage(s) * dt;
      s.asteroidHP -= dmg;
      s.activityProgress = 1 - Math.max(0, s.asteroidHP) / s.asteroidMaxHP;
      s.hull -= 0.28 * dt;
      drain(s, 2.0, dt);
      if (s.asteroidHP <= 0) {
        const reward = Math.max(
          1,
          Math.round(s.asteroidRich * (1 + 0.15 * upgradeLevel(s, 'laser'))),
        );
        s.ore += reward;
        s.totalOre += reward;
        log(s, `⛏️ «${s.asteroidName}» разрушен: +${reward} 🪨`);
        if (Math.random() < 0.35) {
          s.activity = 'storm';
          s.stormTimer = 6;
          s.shieldTimer = 0;
          log(s, '⚠️ Солнечная буря! Отводите щит кликом.');
          toast(s, '⚠️ Началась солнечная буря!');
        } else {
          s.activity = 'travel';
        }
        s.activityProgress = 0;
      }
      break;
    }
    case 'travel': {
      s.activityProgress += dt / travelDuration(s);
      s.distance += (34 * (1 + 0.05 * s.sector)) * dt;
      s.hull -= 0.06 * dt;
      drain(s, 1.4, dt);
      checkSector(s);
      if (s.activityProgress >= 1) {
        s.activity = 'explore';
        s.activityProgress = 0;
      }
      break;
    }
    case 'storm': {
      s.stormTimer -= dt;
      if (s.shieldTimer > 0) {
        s.shieldTimer -= dt;
      } else {
        s.hull -= stormDps(s) * dt;
      }
      drain(s, 1.0, dt);
      if (s.stormTimer <= 0) {
        s.activity = 'travel';
        s.activityProgress = 0;
        s.shieldTimer = 0;
        log(s, '🌤️ Буря стихла — можно лететь дальше');
      }
      break;
    }
    case 'charge': {
      if (s.energy >= maxEnergy(s) * 0.6) {
        s.activity = 'explore';
        s.activityProgress = 0;
        log(s, '⚡ Подзарядка завершена — исследование продолжается');
      }
      break;
    }
    case 'dead': {
      s.hull = 0;
      // Датчики ещё живы: данные продолжают капать
      const trickle = dataPerSec(s) * 0.3 * dt;
      s.data += trickle;
      s.totalData += trickle;
      break;
    }
  }

  if (s.hull <= 0 && s.activity !== 'dead') {
    s.hull = 0;
    s.activity = 'dead';
    log(s, '☠️ Корпус разрушен! Нужен аварийный ремонт (клик — аварийная добыча).');
    toast(s, '☠️ КРИТИЧЕСКОЕ СОСТОЯНИЕ!');
  } else if (
    s.activity !== 'dead' &&
    s.activity !== 'charge' &&
    s.hull > 0 &&
    s.energy <= 0.001
  ) {
    s.activity = 'charge';
    s.activityProgress = 0;
    log(s, '🔋 Энергия на нуле — зонд подзаряжается');
  }
}

// ---------------------------------------------------------------------------
// Действия игрока
// ---------------------------------------------------------------------------

/** Клик по главной кнопке — зависит от текущей фазы. */
export function clickAction(s: GameState): string | null {
  s.clicks += 1;
  switch (s.activity) {
    case 'explore': {
      const v = clickData(s);
      s.data += v;
      s.totalData += v;
      s.activityProgress = Math.min(1, s.activityProgress + 0.02);
      drain(s, 1, 1);
      return null;
    }
    case 'mine': {
      const dmg = clickMineDmg(s);
      s.asteroidHP -= dmg;
      s.activityProgress = Math.min(1, s.activityProgress + dmg / s.asteroidMaxHP);
      drain(s, 1.5, 1);
      return null;
    }
    case 'storm': {
      if (s.energy >= 20) {
        s.energy -= 20;
        s.shieldTimer = 1.5;
        toast(s, '🛡️ Щит отведён');
      } else {
        return 'Не хватает энергии (нужно 20 ⚡)';
      }
      return null;
    }
    case 'dead': {
      const v = emergencyOre(s);
      s.ore += v;
      s.totalOre += v;
      return null;
    }
    default:
      return null;
  }
}

export function hasten(s: GameState): string | null {
  if (s.activity === 'charge') return 'Идёт подзарядка';
  if (s.activity === 'dead') return 'Нужен ремонт корпуса';
  if (s.energy < 10) return 'Нужно 10 ⚡';
  s.energy -= 10;
  s.activityProgress = 1;
  toast(s, '⚡ Фаза ускорена');
  return null;
}

export function buyUpgrade(s: GameState, id: string): string | null {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return null;
  const lvl = upgradeLevel(s, id);
  if (lvl >= def.maxLevel) return 'Максимальный уровень';
  const cost = def.cost(lvl);
  if (s.ore < cost) return 'Не хватает руды';
  s.ore -= cost;
  s.upgrades[id] = lvl + 1;
  log(s, `${def.icon} Улучшено: ${def.name} → ур. ${lvl + 1}`);
  toast(s, `${def.icon} ${def.name} → ур. ${lvl + 1}`);
  return null;
}

export function repair(s: GameState): string | null {
  const cost = repairCost(s);
  if (cost <= 0) return 'Корпус в порядке';
  if (s.ore < cost) return `Нужно ${cost} 🪨`;
  s.ore -= cost;
  s.hull = hullMax(s);
  if (s.activity === 'dead') {
    s.activity = 'explore';
    s.activityProgress = 0;
    log(s, '🚨 Аварийный ремонт завершён — зонд снова в строю');
  } else {
    log(s, '🔧 Корпус полностью отремонтирован');
  }
  toast(s, '🔧 Корпус отремонтирован');
  return null;
}