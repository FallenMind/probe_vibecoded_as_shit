import './style.css';
import { createGame } from './game/config';
import {
  gameState,
  UPGRADES,
  tick,
  saveGame,
  resetGame,
  clickAction,
  hasten,
  buyUpgrade,
  repair,
  fmt,
  clickData,
  clickMineDmg,
  emergencyOre,
  repairCost,
  nextMysteryData,
  sectorName,
  Activity,
} from './game/state';

// ---------------------------------------------------------------------------
// Совместимость с HMR: уничтожаем старые экземпляры при перезагрузке модуля
// ---------------------------------------------------------------------------

type WinWithGame = Window & { __probeGame?: unknown; __probeLoop?: number };

const win = window as WinWithGame;

if (win.__probeGame) {
  (win.__probeGame as { destroy: (remove: boolean) => void }).destroy(true);
  win.__probeGame = undefined;
}
if (win.__probeLoop) {
  window.clearInterval(win.__probeLoop);
  win.__probeLoop = undefined;
}

// ---------------------------------------------------------------------------
// Разметка панели
// ---------------------------------------------------------------------------

const ACTIVITY_META: Record<Activity, { icon: string; title: string; desc: string }> = {
  explore: { icon: '🔭', title: 'ИССЛЕДОВАНИЕ', desc: 'Зонд медленно накапливает научные данные' },
  mine: { icon: '⛏️', title: 'ДОБЫЧА РУДЫ', desc: 'Лазер дробит астероид на материалы' },
  travel: { icon: '🚀', title: 'ПЕРЕЛЁТ', desc: 'Марш к следующему региону системы' },
  storm: { icon: '🌩️', title: 'СОЛНЕЧНАЯ БУРЯ', desc: 'Кликай «Отвести щит» (20⚡), чтобы защитить корпус' },
  charge: { icon: '🔋', title: 'ПОДЗАРЯДКА', desc: 'Энергия на нуле — ждём восстановления' },
  dead: { icon: '☠️', title: 'КРИТ. СОСТОЯНИЕ', desc: 'Корпус разрушен! Кликай — аварийная добыча руды' },
};

const app = document.getElementById('app') as HTMLElement;

app.innerHTML = `
  <aside id="panel">
    <header class="panel-header">
      <h1>🛰️ Зонд «Пионер»</h1>
      <p class="subtitle">Система Дальняя · автономная миссия</p>
    </header>

    <div id="offline-banner" class="offline hidden"></div>

    <section class="card resources">
      <div class="chip"><span class="chip-icon">⚡</span><span class="chip-val" id="res-energy">0</span><small>Энергия</small></div>
      <div class="chip"><span class="chip-icon">🪨</span><span class="chip-val" id="res-ore">0</span><small>Руда</small></div>
      <div class="chip"><span class="chip-icon">📡</span><span class="chip-val" id="res-data">0</span><small>Данные</small></div>
      <div class="chip"><span class="chip-icon">🛡️</span><span class="chip-val" id="res-hull">100</span><small>Корпус</small></div>
    </section>

    <section class="card">
      <div class="activity-head">
        <span id="activity-icon">🔭</span>
        <h2 id="activity-title">ИССЛЕДОВАНИЕ</h2>
      </div>
      <p class="activity-desc" id="activity-desc"></p>
      <div class="progress"><div id="activity-bar" class="bar-fill"></div></div>
      <button id="btn-action" class="btn btn-primary"></button>
      <div class="quick-row">
        <button id="btn-hasten" class="btn" title="Пропустить текущую фазу за 10 ⚡">⚡ Ускорить (10⚡)</button>
        <button id="btn-repair" class="btn"></button>
      </div>
      <div id="action-msg" class="action-msg"></div>
    </section>

    <section class="card">
      <h3>🧬 Тайны системы</h3>
      <p class="myst-line">Разгадано: <b id="myst-count">0</b> · до следующей: <b id="myst-hint">250 📡</b></p>
      <div class="progress"><div id="myst-bar" class="bar-fill bar-accent"></div></div>
      <p class="hint">Каждая тайна ускоряет сбор данных на +10%</p>
    </section>

    <section class="card">
      <h3>🛠️ Модернизация зонда</h3>
      <div id="upgrades"></div>
    </section>

    <section class="card">
      <h3>📜 Журнал миссии</h3>
      <ul id="log"></ul>
    </section>

    <footer class="panel-footer">
      <span id="save-status">Автосохранение…</span>
      <button id="btn-reset" class="btn btn-danger">↺ Сбросить прогресс</button>
    </footer>
  </aside>
  <main id="game"></main>
`;

// ---------------------------------------------------------------------------
// Ссылки на элементы
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const el = {
  offline: $('offline-banner'),
  resEnergy: $('res-energy'),
  resOre: $('res-ore'),
  resData: $('res-data'),
  resHull: $('res-hull'),
  activityIcon: $('activity-icon'),
  activityTitle: $('activity-title'),
  activityDesc: $('activity-desc'),
  activityBar: $('activity-bar'),
  btnAction: $<HTMLButtonElement>('btn-action'),
  btnHasten: $<HTMLButtonElement>('btn-hasten'),
  btnRepair: $<HTMLButtonElement>('btn-repair'),
  actionMsg: $('action-msg'),
  mystCount: $('myst-count'),
  mystHint: $('myst-hint'),
  mystBar: $('myst-bar'),
  log: $('log'),
  saveStatus: $('save-status'),
  btnReset: $<HTMLButtonElement>('btn-reset'),
};

// ---------------------------------------------------------------------------
// Построение списка улучшений
// ---------------------------------------------------------------------------

const upgradeRows = new Map<string, { lvl: HTMLElement; cost: HTMLElement; btn: HTMLButtonElement; row: HTMLElement }>();

function buildUpgrades(): void {
  const wrap = document.getElementById('upgrades') as HTMLElement;
  wrap.innerHTML = '';
  upgradeRows.clear();

  for (const def of UPGRADES) {
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `
      <div class="upgrade-info">
        <span class="upgrade-icon">${def.icon}</span>
        <div class="upgrade-text">
          <div class="upgrade-name">${def.name} <span class="upgrade-lvl">ур. <b>0</b></span></div>
          <div class="upgrade-desc">${def.desc}</div>
        </div>
      </div>
      <button class="btn btn-buy">0 🪨</button>`;

    const btn = row.querySelector('button') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const err = buyUpgrade(gameState, def.id);
      if (err) flashMsg(err);
    });

    wrap.appendChild(row);
    upgradeRows.set(def.id, {
      lvl: row.querySelector('.upgrade-lvl b') as HTMLElement,
      cost: btn,
      btn,
      row,
    });
  }
}

buildUpgrades();

// ---------------------------------------------------------------------------
// Сообщения и тосты
// ---------------------------------------------------------------------------

let msgTimer = 0;

function flashMsg(text: string): void {
  el.actionMsg.textContent = text;
  el.actionMsg.classList.add('show');
  window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => el.actionMsg.classList.remove('show'), 2200);
}

function pulse(el2: HTMLElement): void {
  el2.classList.remove('pulse');
  void el2.offsetWidth;
  el2.classList.add('pulse');
}

// ---------------------------------------------------------------------------
// Действия
// ---------------------------------------------------------------------------

el.btnAction.addEventListener('click', () => {
  const err = clickAction(gameState);
  if (err) flashMsg(err);
  pulse(el.btnAction);
});

el.btnHasten.addEventListener('click', () => {
  const err = hasten(gameState);
  if (err) flashMsg(err);
});

el.btnRepair.addEventListener('click', () => {
  const err = repair(gameState);
  if (err) flashMsg(err);
});

el.btnReset.addEventListener('click', () => {
  if (window.confirm('Сбросить весь прогресс миссии?')) {
    resetGame(gameState);
    buildUpgrades();
    el.offline.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// Цикл игры и обновление UI
// ---------------------------------------------------------------------------

let lastTick = performance.now();
let saveAccum = 0;
let lastLogSig = '';
let savedAt = Date.now();

function gameLoop(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTick) / 1000, 2);
  lastTick = now;

  tick(gameState, dt);

  saveAccum += dt;
  if (saveAccum >= 5) {
    saveAccum = 0;
    saveGame(gameState);
    savedAt = Date.now();
  }

  updateUi();
}

function updateUi(): void {
  const s = gameState;

  // Ресурсы
  const hMax = 100 + 40 * (s.upgrades.armor ?? 0);
  const eMax = 100 + 30 * (s.upgrades.energy ?? 0);
  el.resEnergy.textContent = `${Math.floor(s.energy)}/${eMax}`;
  el.resOre.textContent = fmt(s.ore);
  el.resData.textContent = fmt(s.data);
  el.resHull.textContent = `${Math.max(0, Math.ceil(s.hull))}/${hMax}`;

  const hpPct = Math.max(0, s.hull) / hMax;
  el.resHull.classList.toggle('low', hpPct < 0.3);

  // Активность
  const meta = ACTIVITY_META[s.activity];
  el.activityIcon.textContent = meta.icon;
  el.activityTitle.textContent = meta.title;
  el.activityDesc.textContent = meta.desc;
  el.activityBar.style.width = `${Math.round(Math.min(1, s.activityProgress) * 100)}%`;

  const canInteract = s.activity !== 'charge' && s.activity !== 'travel';
  el.btnAction.disabled = !canInteract;
  switch (s.activity) {
    case 'explore':
      el.btnAction.textContent = `📡 Собрать данные (+${clickData(s)} 📡)`;
      break;
    case 'mine':
      el.btnAction.textContent = `⛏️ Бурить (+${clickMineDmg(s)} урона)`;
      break;
    case 'storm':
      el.btnAction.textContent = '🛡️ Отвести щит (20⚡)';
      break;
    case 'dead':
      el.btnAction.textContent = `⛏️ Аварийная добыча (+${emergencyOre(s)} 🪨)`;
      break;
    default:
      el.btnAction.textContent = '…';
      break;
  }

  el.btnHasten.disabled = s.activity === 'charge' || s.activity === 'dead' || s.energy < 10;

  const rCost = repairCost(s);
  el.btnRepair.textContent =
    s.activity === 'dead' ? `🚨 Аварийный ремонт (${rCost} 🪨)` : `🔧 Ремонт (${rCost} 🪨)`;
  el.btnRepair.disabled = rCost <= 0 || s.ore < rCost;

  // Тайны
  const nextMyst = nextMysteryData(s);
  el.mystCount.textContent = String(s.mysteriesFound);
  el.mystHint.textContent = `${Math.max(0, nextMyst - s.data).toLocaleString('ru-RU')} 📡`;
  el.mystBar.style.width = `${Math.min(100, (s.data / nextMyst) * 100)}%`;

  // Улучшения
  for (const def of UPGRADES) {
    const ref = upgradeRows.get(def.id);
    if (!ref) continue;
    const lvl = s.upgrades[def.id] ?? 0;
    const maxed = lvl >= def.maxLevel;
    ref.lvl.textContent = String(lvl);
    ref.cost.textContent = maxed ? 'MAX' : `${def.cost(lvl)} 🪨`;
    ref.btn.disabled = maxed || s.ore < def.cost(lvl);
    ref.row.classList.toggle('maxed', maxed);
  }

  // Журнал
  const sig = s.log.map((l) => l.msg).join('|');
  if (sig !== lastLogSig) {
    lastLogSig = sig;
    el.log.innerHTML = s.log
      .slice()
      .reverse()
      .map((l) => `<li>${l.msg}</li>`)
      .join('');
  }

  // Статус сохранения
  const secAgo = Math.floor((Date.now() - savedAt) / 1000);
  el.saveStatus.textContent = secAgo < 60 ? `Автосохранение ✓ ${secAgo} с назад` : 'Автосохранение…';
}

// Оффлайн-баннер
if (gameState.offlineMsg) {
  el.offline.textContent = gameState.offlineMsg;
  el.offline.classList.remove('hidden');
}

// Текущий сектор в заголовке подписи
document.title = 'Зонд «Пионер» — Система Дальняя';
const subtitle = document.querySelector('.subtitle') as HTMLElement;
const updateSectorLabel = () => {
  subtitle.textContent = `Сектор: ${sectorName(gameState)} · автономная миссия`;
};
updateSectorLabel();

// ---------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------

win.__probeGame = createGame('game');
win.__probeLoop = window.setInterval(gameLoop, 100);

export {};
