import './breach.css';
import { createGame } from './game/config';
import { breachGame, clearBreachSave, specialCrystalCost, upgradeOreCost } from './game/breach';
import { BREACH_CONFIG as C } from './game/breachConfig';
import { BreachScene } from './game/BreachScene';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, alchemyTickSeconds } from './game/alchemy';
import type { AlchemyNode, AlchemyResource, AlchemySwitch } from './game/alchemy';

const MASTERY_UI_WEAPON = {
  fistMastery: 'fist', pickMastery: 'pick', spearMastery: 'spear', needleMastery: 'needle', emitterMastery: 'emitter',
} as const;

const app = document.getElementById('app') as HTMLElement;
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-icon">✳</span><div><strong>ПИОНЕР</strong><small>ПРОТОКОЛ ПРОРЫВА</small></div></div>
      <div class="top-actions"><span id="save-status">СОХРАНЕНО</span><button id="reset-progress" class="reset-button" title="Начать игру заново">Сбросить прогресс</button><button id="pause" class="icon-button" aria-label="Пауза" title="Пауза: P или Escape">Ⅱ</button></div>
    </header>
    <nav class="game-tabs" aria-label="Разделы игры"><button id="tab-breach" class="game-tab active" aria-pressed="true">Прорыв</button><button id="tab-alchemy" class="game-tab" aria-pressed="false"><span class="alchemy-tab-icon" aria-hidden="true">✧</span> Алхимия</button></nav>
    <div id="breach-view" class="layout">
      <main class="main-column">
        <div class="section-heading"><div><span class="eyebrow">АВТОНОМНАЯ ЭКСПЕДИЦИЯ</span><h1>Прорыв сквозь породу</h1></div><span class="live-badge"><i></i> СИГНАЛ АКТИВЕН</span></div>
        <section class="map-card">
          <div class="map-top"><div><span class="eyebrow">КВАДРАТ</span><strong id="block-label">01 <em>/ 50</em></strong></div><div class="map-top-right"><span class="eyebrow">ОСТАЛОСЬ КАМНЕЙ</span><strong id="stones-label">—</strong></div></div>
          <div class="map-wrap"><div id="game"></div><div id="gesture" class="gesture" aria-hidden="true">☝</div><div id="paused-overlay" class="paused-overlay hidden">ПАУЗА <small>P / ESC</small></div></div>
          <div class="map-bottom"><div><span class="map-key"><i class="stone-key"></i> ПОРОДА</span><span class="map-key"><i class="hard-key"></i> ТВЁРДАЯ</span><span class="map-key"><i class="element-key"></i> ЭЛЕМЕНТ</span></div><button id="mine" class="mine-button">✦ &nbsp; ДОБЫВАТЬ</button></div>
          <div class="progress-track"><div id="progress-fill"></div><span id="boundary-marker" class="hidden" title="Приближающаяся граница"></span></div>
        </section>
        <div class="below-map"><span id="message"></span><span id="mine-hint" class="hidden">Нажмите на карту, чтобы ускорить добычу</span></div>
        <section id="resource-loop" class="support-card hidden">
          <div class="support-icon">◈</div><div class="support-copy"><span class="eyebrow">АЛХИМИЯ</span><h2>Быстрое управление</h2><p id="alchemy-quick-resources"></p></div>
          <div class="support-action"><button class="small-button" data-alchemy-switch="earthEnabled"></button><button class="small-button" data-alchemy-switch="pickEnabled"></button><button class="small-button" data-alchemy-switch="waterEnabled"></button><button class="small-button" data-alchemy-switch="elementalizationEnabled"></button></div>
        </section>
      </main>
      <aside class="sidebar">
        <div class="side-heading"><div><span class="eyebrow">ПАНЕЛЬ ЭКСПЕДИЦИИ</span><h2>Управление</h2></div><span class="side-mark">✳</span></div>
        <section class="resources">
          <div class="resource"><span class="resource-icon ore">◆</span><span><small>РУДА</small><strong id="ore">0</strong></span></div>
          <div class="resource"><span class="resource-icon crystal">✦</span><span><small>КРИСТАЛЛЫ</small><strong id="crystals">0</strong></span></div>
          <div class="resource"><span class="resource-icon point">⬡</span><span><small>ПРОРЫВ</small><strong id="points">0</strong></span></div>
        </section>
        <div class="list-heading"><div><span class="eyebrow">ИНСТРУМЕНТЫ И НАВЫКИ</span><h2>Улучшения</h2></div><span>↗</span></div>
        <p id="upgrade-hint" class="upgrade-hint hidden">Повторяемые улучшения: очистите ${Math.round(C.repeatableUnlockFraction * 100)}% карты.</p>
        <div class="upgrades">
          <button class="upgrade" data-upgrade="auto"><span class="upgrade-icon">⚙</span><span class="upgrade-copy"><strong>Сборщик</strong><small>Автоматически добывает камень и открывает оружие.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="pick"><span class="upgrade-icon">⛏</span><span class="upgrade-copy"><strong>Кремневая кирка</strong><small>Открывается за 1 500 руды; базовый радиус удара — 2 клетки.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="spear"><span class="upgrade-icon">⚔</span><span class="upgrade-copy"><strong>Копьё</strong><small>15 000 руды и 5 кристаллов; круговая атака радиусом 4, медленнее кирки.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="penetration"><span class="upgrade-icon">◇</span><span class="upgrade-copy"><strong>Пробиваемость</strong><small>Снимает сопротивление твёрдой породы у ударов по области.</small></span><span class="price"></span></button>
          <button class="upgrade hidden" data-upgrade="spatialCompressor"><span class="upgrade-icon">⦿</span><span class="upgrade-copy"><strong>Пространственный сжиматель</strong><small>С 40-го уровня: при остатке 5% породы или меньше мгновенно переносит на следующий слой.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="movement"><span class="upgrade-icon">➜</span><span class="upgrade-copy"><strong>Скорость движения <b></b></strong><small>Увеличивает скорость передвижения на 25% за уровень.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="ranged"><span class="upgrade-icon">⌁</span><span class="upgrade-copy"><strong>Излучатель</strong><small>Непрерывный лазер повреждает задние камни по области.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="needle"><span class="upgrade-icon">➶</span><span class="upgrade-copy"><strong>Игломёт</strong><small>Быстро стреляет по одному заднему камню.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="needleAlt"><span class="upgrade-icon">⇉</span><span class="upgrade-copy"><strong>Автономный игломёт</strong><small>С 20-го квадрата: игломёт стреляет в фоне с 25% скорострельности, пока выбрано другое дальнее оружие.</small></span><span class="price"></span></button>
        </div>
        <section id="equipment" class="equipment"><span class="eyebrow">БЛИЖНЕЕ ОРУЖИЕ</span><div><button id="equip-fists" class="equipment-button">✊ Кулаки</button><button id="equip-pick" class="equipment-button active">⛏ Кремневая кирка</button><button id="equip-spear" class="equipment-button">⚔ Копьё</button></div>
          <button id="combo-toggle" class="equipment-button"></button>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="fists" data-upgrade="fistCombo"><span class="upgrade-icon">✹</span><span class="upgrade-copy"><strong>Комбо кулаков</strong><small>Каждый третий удар бьёт по области; подготовка вдвое дольше.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistComboRadius"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Радиус комбо <b></b></strong><small>Уровень 1 при открытии; уровни 2–4 дают +1 к радиусу, уровень 5 — +3 (максимум 7). Первые три уровня дают кристалл; урон комбо падает с расстоянием, а число нужных ударов растёт с уровнем.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearDamage"><span class="upgrade-icon">⚔</span><span class="upgrade-copy"><strong>Сила копья <b></b></strong><small>Увеличивает урон копья.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearReach"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Размах копья <b></b></strong><small>Увеличивает радиус атаки с 4 до 8 клеток; максимум 5 уровней.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearPierce"><span class="upgrade-icon">◇</span><span class="upgrade-copy"><strong>Пробивающий рывок</strong><small>Комбо игнорирует броню твёрдой породы.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearEnchant"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Элементальное зачарование</strong><small>Единовременная покупка за 60 Воздуха навсегда открывает пробитие элементальной руды. Заряженный рывок наносит урон по прямоугольной траектории.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="melee"><span class="upgrade-icon">✊</span><span class="upgrade-copy"><strong>Сила кулаков <b></b></strong><small>Увеличивает урон кулаков.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistFinisher"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Добивание <b></b></strong><small>Удары по камням с половиной прочности или меньше сильнее на 25% за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость кулаков <b></b></strong><small>Увеличивает частоту ударов кулаками.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="fists" data-upgrade="fistMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Утяжелённые перчатки</strong><small>Разблокируется после 3 улучшений силы кулаков; +25% урона.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickDamage"><span class="upgrade-icon">⛏</span><span class="upgrade-copy"><strong>Мощность кирки <b></b></strong><small>Увеличивает урон кремневой кирки.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickReach"><span class="upgrade-icon">◔</span><span class="upgrade-copy"><strong>Размах <b></b></strong><small>Увеличивает радиус удара с 2 до 6 клеток; комбовзрыв добавляет 3 клетки с сильным спадом урона от центра.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость кирки <b></b></strong><small>Увеличивает частоту ударов киркой.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="pick" data-upgrade="pickMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Усиленная головка</strong><small>Разблокируется после 3 улучшений кирки; +25% урона.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость копья <b></b></strong><small>Увеличивает частоту атак копьём.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="spear" data-upgrade="spearMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Сбалансированное древко</strong><small>Разблокируется после 3 улучшений силы копья; +25% урона.</small></span><span class="price"></span></button>
          </div></section>
        <section id="ranged-equipment" class="equipment hidden"><span class="eyebrow">ДАЛЬНЕЕ ОРУЖИЕ</span><div><button id="equip-needle" class="equipment-button">➶ Игломёт</button><button id="equip-emitter" class="equipment-button">⌁ Излучатель</button></div>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="needle" data-upgrade="needleDamage"><span class="upgrade-icon">➶</span><span class="upgrade-copy"><strong>Мощность игломёта <b></b></strong><small>Увеличивает урон игломёта.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="needle" data-upgrade="needleSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорострельность игломёта <b></b></strong><small>Сильно ускоряет медленную базовую очередь.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="needle" data-upgrade="needleMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Точный боёк</strong><small>Разблокируется после 3 улучшений мощности; +25% урона.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="needle" data-upgrade="needlePierce"><span class="upgrade-icon">⇈</span><span class="upgrade-copy"><strong>Пробой <b></b></strong><small>Наносит следующему камню на пути 30% урона за уровень, максимум 100%.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="rangedDamage"><span class="upgrade-icon">⌁</span><span class="upgrade-copy"><strong>Мощность излучателя <b></b></strong><small>Увеличивает урон излучателя.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterSpread"><span class="upgrade-icon">✣</span><span class="upgrade-copy"><strong>Рассеивание <b></b></strong><small>Усиливает урон по краям луча; урон плавно уменьшается с расстоянием.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterArea"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Ширина луча <b></b></strong><small>Расширяет область лазера на одну клетку за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="beamSpeed"><span class="upgrade-icon">➟</span><span class="upgrade-copy"><strong>Скорость луча <b></b></strong><small>Луч перемещается между целями на 25% быстрее за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость излучателя <b></b></strong><small>Увеличивает мощность луча.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="emitter" data-upgrade="emitterMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Резонансная линза</strong><small>Разблокируется после 3 улучшений мощности; +25% урона.</small></span><span class="price"></span></button>
          </div></section>
        <div class="list-heading advanced hidden"><div><span class="eyebrow">НЕИЗВЕСТНЫЕ ТЕХНОЛОГИИ</span><h2>Артефакт</h2></div><span>✧</span></div>
        <div class="upgrades advanced hidden"><button class="upgrade" data-upgrade="artifact"><span class="upgrade-icon artifact">✺</span><span class="upgrade-copy"><strong>Эхо пустоты</strong><small>С 25-го квадрата: наносит урон в текущем и соседних квадратах, больше — изолированным камням.</small></span><span class="price"></span></button>
        <button class="upgrade" data-upgrade="expansion"><span class="upgrade-icon">▦</span><span class="upgrade-copy"><strong>Расширить блок <b></b></strong><small>Больше камней в каждом квадрате со следующей попытки.</small></span><span class="price"></span></button></div>
        <section class="challenge-section"><div class="list-heading"><div><span class="eyebrow">РЕЖИМЫ</span><h2>Испытания</h2></div><span>◇</span></div>
          <button id="challenge-1" class="challenge-card" aria-live="polite"><strong>Challenge 1 · 50×50 за 60 секунд</strong><span id="challenge-1-status"></span></button>
        </section>
        <footer>ПИОНЕР / PRE-INFINITY <span>✳</span></footer>
      </aside>
    </div>
    <section id="alchemy-view" class="alchemy-view hidden" aria-label="Алхимия">
      <div class="alchemy-heading"><span class="eyebrow">ВТОРОЙ КОНТУР</span><h1>Алхимия</h1><p>Рецепты продолжают работать, когда открыт прорыв.</p><details class="alchemy-help"><summary aria-label="Как работает алхимия">?</summary><div><strong>Как работает алхимия</strong><p>Выберите стихию, затем включите её производство. Каждый тик перерабатывает долю текущего запаса. У Земли источник — камень; у Воды — Земля и элементальный камень. Кнопка «Получить Воду» выполняет один такой обмен вручную. Производство не расходует материалы сверх предела стихии.</p><p>Разрушенная обычная порода даёт 1 камень, твёрдая — 3, элементальная — 2 камня и 1 элементальный камень. Эти материалы учитываются отдельно от руды.</p><p>Включите усиление кирки, чтобы тратить 2 Земли за каждый камень в добыче и пробивать элементальную руду. Воду можно обменять на кристаллы. Улучшения увеличивают пределы и ускоряют тики. Пауза останавливает производство.</p></div></details></div>
      <div class="alchemy-layout">
        <div class="alchemy-nodes" aria-label="Стихии">
          <button class="alchemy-node earth" data-alchemy-node="earth"><span class="alchemy-symbol">◆</span><strong>Земля</strong><small id="earth-node-status"></small></button>
          <button class="alchemy-node water" data-alchemy-node="water"><span class="alchemy-symbol">◈</span><strong>Вода</strong><small id="water-node-status"></small></button>
          <button class="alchemy-node air" data-alchemy-node="air"><span class="alchemy-symbol">≈</span><strong>Воздух</strong><small>Challenge 1</small></button>
          <button class="alchemy-node fire" data-alchemy-node="fire"><span class="alchemy-symbol">✦</span><strong>Огонь</strong><small>Challenge 4</small></button>
        </div>
        <div class="alchemy-details">
          <div data-alchemy-panel="earth"><span class="eyebrow">ПЕРВАЯ СТИХИЯ</span><h2>Земля</h2><p id="earth-description"></p><div class="alchemy-resources"><span>Камень <b id="alchemy-stone">0</b></span><span>Земля <b id="alchemy-earth">0</b></span><span>Кристаллы <b id="alchemy-earth-crystals">0</b></span></div><button class="alchemy-action" data-alchemy-switch="earthEnabled"></button><button class="alchemy-action" data-alchemy-switch="pickEnabled"></button><h3>Улучшения</h3><div class="alchemy-upgrades" data-alchemy-upgrades="earth"></div></div>
          <div class="hidden" data-alchemy-panel="water"><span class="eyebrow">ВТОРАЯ СТИХИЯ</span><h2>Вода</h2><p id="water-description"></p><div class="alchemy-resources"><span>Земля <b id="alchemy-earth-for-water">0</b></span><span>Элементальный камень <b id="alchemy-elemental">0</b></span><span>Вода <b id="alchemy-water">0</b></span><span>Кристаллы <b id="alchemy-water-crystals">0</b></span></div><button class="alchemy-action" id="craft-water"></button><button class="alchemy-action" data-alchemy-switch="waterEnabled"></button><button class="alchemy-action" id="crystallize-water"></button><h3>Улучшения</h3><div class="alchemy-upgrades" data-alchemy-upgrades="water"></div></div>
          <div class="hidden" data-alchemy-panel="fire"><span class="eyebrow">СТИХИЯ ЗАКРЫТА</span><h2>Огонь</h2><p>Откроется после прохождения Challenge 4.</p></div>
          <div class="hidden" data-alchemy-panel="air"><span class="eyebrow">СТИХИЯ</span><h2>Воздух</h2><p id="air-description">Откроется после прохождения Challenge 1. Производится из Воды.</p><div class="alchemy-resources"><span>Вода <b id="alchemy-water-for-air">0</b></span><span>Воздух <b id="alchemy-air">0 / 100</b></span></div><button class="alchemy-action" data-alchemy-switch="airProductionEnabled"></button><button class="alchemy-action" data-alchemy-switch="elementalizationEnabled"></button></div>
        </div>
      </div>
    </section>
  </div>`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const upgrade = (name: string) => $<HTMLButtonElement>(`[data-upgrade="${name}"]`);
const s = breachGame.state;
const game = createGame('game');
let lastTick = performance.now();
let saveTime = 0;
let resetRequested = false;
let selectedAlchemyNode: AlchemyNode = 'earth';

function selectGameView(alchemy: boolean): void {
  $('#breach-view').classList.toggle('hidden', alchemy);
  $('#alchemy-view').classList.toggle('hidden', !alchemy);
  $('#tab-breach').classList.toggle('active', !alchemy);
  $('#tab-alchemy').classList.toggle('active', alchemy);
  $('#tab-breach').setAttribute('aria-pressed', String(!alchemy));
  $('#tab-alchemy').setAttribute('aria-pressed', String(alchemy));
}

$('#tab-breach').addEventListener('click', () => selectGameView(false));
$('#tab-alchemy').addEventListener('click', () => selectGameView(true));
document.querySelectorAll<HTMLButtonElement>('[data-alchemy-node]').forEach(button => button.addEventListener('click', () => {
  selectedAlchemyNode = (button.dataset.alchemyNode ?? 'earth') as AlchemyNode;
  render();
}));

for (const definition of ALCHEMY_UPGRADES) {
  const button = document.createElement('button');
  button.className = 'alchemy-upgrade';
  button.dataset.alchemyUpgrade = definition.id;
  button.addEventListener('click', () => { if (breachGame.buyAlchemyUpgrade(definition.id)) breachGame.save(); render(); });
  $(`[data-alchemy-upgrades="${definition.node}"]`).appendChild(button);
}

document.querySelectorAll<HTMLButtonElement>('[data-alchemy-switch]').forEach(button => button.addEventListener('click', () => {
  if (breachGame.toggleAlchemy(button.dataset.alchemySwitch as AlchemySwitch)) breachGame.save();
  render();
}));
$('#crystallize-water').addEventListener('click', () => { if (breachGame.crystallizeWater()) breachGame.save(); render(); });
$('#craft-water').addEventListener('click', () => { if (breachGame.craftWater()) breachGame.save(); render(); });

function setUpgrade(name: string, price: string, disabled: boolean, level?: number): void {
  const button = upgrade(name);
  (button.querySelector('.price') as HTMLElement).textContent = price;
  button.disabled = disabled || s.paused;
  const b = button.querySelector('b');
  if (b && level !== undefined) b.textContent = ` ${level}`;
  const copy = button.querySelector('.upgrade-copy');
  if (copy) button.setAttribute('aria-label', `${copy.textContent?.trim() ?? ''} ${price}`);
}

function renderAlchemy(): void {
  const a = s.alchemy;
  const earthOpen = breachGame.alchemyNodeUnlocked('earth');
  const waterOpen = breachGame.alchemyNodeUnlocked('water');
  const airOpen = breachGame.alchemyNodeUnlocked('air');
  const earthCapacity = alchemyCapacity(a, 'earth');
  const waterCapacity = alchemyCapacity(a, 'water');
  $('#tab-alchemy').classList.toggle('unlocked', earthOpen);
  $('#tab-alchemy').classList.toggle('new-feature', earthOpen && !s.alchemyHelpSeen && $('#alchemy-view').classList.contains('hidden'));
  $('.alchemy-help summary').classList.toggle('new-feature', earthOpen && !s.alchemyHelpSeen);
  document.querySelectorAll<HTMLButtonElement>('[data-alchemy-node]').forEach(button => {
    const node = button.dataset.alchemyNode as AlchemyNode;
    button.classList.toggle('selected', node === selectedAlchemyNode);
    button.classList.toggle('locked', !breachGame.alchemyNodeUnlocked(node));
    button.setAttribute('aria-pressed', String(node === selectedAlchemyNode));
  });
  document.querySelectorAll<HTMLElement>('[data-alchemy-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.alchemyPanel !== selectedAlchemyNode));
  $('#earth-node-status').textContent = earthOpen ? `${a.earth} / ${earthCapacity}` : `Квадрат ${A.earthUnlockBlock + 1}`;
  $('#water-node-status').textContent = waterOpen ? `${a.water} / ${waterCapacity}` : `Квадрат ${A.waterUnlockBlock + 1}`;
  $('#earth-description').textContent = earthOpen
    ? `Каждые ${alchemyTickSeconds(a, 'earth')} с: ${A.earthRecipe.fraction * 100}% запаса камня → Земля 1:1 (минимум 1).`
    : `Достигните квадрата ${A.earthUnlockBlock + 1}, чтобы открыть Землю.`;
  $('#water-description').textContent = waterOpen
    ? `Каждые ${alchemyTickSeconds(a, 'water')} с: до ${A.waterRecipe.fraction * 100}% запаса Земли; на 1 Воду нужны 1 Земля и ${A.waterRecipe.elementalPerWater} элементальных камня (минимум 1 Вода).`
    : `Достигните квадрата ${A.waterUnlockBlock + 1}, чтобы открыть Воду.`;
  $('#air-description').textContent = airOpen
    ? `Производство тратит ${A.airRecipe.waterPerAir} Воды на 1 Воздух каждые ${A.airRecipe.seconds} с. Элементализация расходует 1 Воздух в секунду и с шансом 50% превращает добытый камень в элементальный.`
    : 'Откроется после прохождения Challenge 1.';
  $('#alchemy-stone').textContent = String(a.stone);
  $('#alchemy-earth').textContent = `${a.earth} / ${earthCapacity}`;
  $('#alchemy-earth-crystals').textContent = String(s.crystals);
  $('#alchemy-earth-for-water').textContent = String(a.earth);
  $('#alchemy-elemental').textContent = String(a.elementalStone);
  $('#alchemy-water').textContent = `${a.water} / ${waterCapacity}`;
  $('#alchemy-water-for-air').textContent = String(a.water);
  $('#alchemy-air').textContent = `${a.air} / ${alchemyCapacity(a, 'air')}`;
  $('#alchemy-water-crystals').textContent = String(s.crystals);
  const labels: Record<AlchemySwitch, string> = {
    earthEnabled: 'Производство Земли', waterEnabled: 'Производство Воды',
    pickEnabled: `Усиление ближнего боя ×${A.pickDamageMultiplier}: ${A.pickEarthPerStone} Земли за камень`,
    airProductionEnabled: `Производство Воздуха: ${A.airRecipe.waterPerAir} Воды → 1 Воздух за ${A.airRecipe.seconds} с`,
    elementalizationEnabled: 'Элементализация: 1 Воздух/с, 50% добычи превращается в элементальный камень',
  };
  document.querySelectorAll<HTMLButtonElement>('[data-alchemy-switch]').forEach(button => {
    const name = button.dataset.alchemySwitch as AlchemySwitch;
    const unlocked = name === 'waterEnabled' ? waterOpen : name === 'airProductionEnabled' || name === 'elementalizationEnabled' ? airOpen : earthOpen;
    button.textContent = `${labels[name]}: ${a[name] ? 'ВКЛ' : 'ВЫКЛ'}`;
    button.classList.toggle('active', a[name]);
    button.disabled = s.paused || !!breachGame.resetEffect || !unlocked || (name === 'pickEnabled' && !s.pickUnlocked);
    button.setAttribute('aria-pressed', String(a[name]));
  });
  const crystal = $<HTMLButtonElement>('#crystallize-water');
  crystal.textContent = `Кристаллизация: ${A.crystalExchange.water} Воды → ${A.crystalExchange.crystals} кристалл`;
  crystal.disabled = s.paused || !!breachGame.resetEffect || !waterOpen || a.water < A.crystalExchange.water;
  const craft = $<HTMLButtonElement>('#craft-water');
  craft.textContent = `Получить Воду: обменять до ${A.waterRecipe.fraction * 100}% Земли`;
  craft.disabled = s.paused || !!breachGame.resetEffect || !waterOpen || a.earth < 1 || a.elementalStone < A.waterRecipe.elementalPerWater || a.water >= waterCapacity;
  const resourceNames: Record<AlchemyResource, string> = { earth: 'Земли', water: 'Воды', air: 'Воздуха', crystals: 'кристаллов' };
  for (const definition of ALCHEMY_UPGRADES) {
    const button = $<HTMLButtonElement>(`[data-alchemy-upgrade="${definition.id}"]`);
    const cost = (Object.entries(definition.cost) as [AlchemyResource, number][]).map(([name, value]) => `${value} ${resourceNames[name]}`).join(' + ');
    const capacity = (Object.entries(definition.capacity) as ['earth' | 'water' | 'air', number][]).map(([name, value]) => `+${value} ${resourceNames[name]}`).join(', ');
    const requirements = [definition.minBlock === undefined ? '' : `квадрат ${definition.minBlock + 1}`,
      definition.challenge === undefined ? '' : `Challenge ${definition.challenge}`,
      ...(definition.requires ?? []).map(id => ALCHEMY_UPGRADES.find(item => item.id === id)?.name ?? id)].filter(Boolean).join(', ');
    button.textContent = `${definition.name} — ${definition.description}${capacity ? ` ${capacity}.` : ''} ${cost}${requirements ? `; требуется: ${requirements}` : ''}`;
    button.disabled = !breachGame.canBuyAlchemyUpgrade(definition);
    button.classList.toggle('hidden', !!a.upgrades[definition.id]);
  }
  const newUpgrade = ALCHEMY_UPGRADES.some(item => breachGame.canBuyAlchemyUpgrade(item) && !s.seenFeatures[`alchemy:${item.id}`]);
  $('#tab-alchemy').classList.toggle('new-feature', earthOpen && (!s.alchemyHelpSeen || newUpgrade) && $('#alchemy-view').classList.contains('hidden'));
}

function render(): void {
  const done = s.tutorial === 'done';
  const currentStones = breachGame.currentStones().length;
  renderAlchemy();
  $('#block-label').innerHTML = s.challengeArena ? 'CHALLENGE 1 <em>2×2</em>' : `${String(s.block + 1).padStart(2, '0')} <em>/ ${C.blockCount}</em>`;
  $('#stones-label').textContent = String(currentStones).padStart(2, '0');
  $('#ore').textContent = String(Math.floor(s.ore));
  $('#crystals').textContent = String(s.crystals);
  $('#points').textContent = String(s.breakthrough);
  const challengeStatus = s.challengeArena ? (s.challengeWon ? 'Завершён · нажмите, чтобы вернуться' : 'Очистите поле 50×50 за 60 секунд') : breachGame.challenge1Unlocked ? (s.challenge1Completed ? 'Пройдено · повторить тест' : 'Открыто · начать тест') : 'Откроется на 35-м квадрате';
  if ($('#challenge-1-status').textContent !== challengeStatus) $('#challenge-1-status').textContent = challengeStatus;
  if (s.challengeArena) $('#challenge-1-status').textContent = s.challengeFailed
    ? 'Время вышло · нажмите, чтобы вернуться'
    : s.challengeWon ? 'Пройдено · нажмите, чтобы вернуться' : `Осталось ${Math.ceil(s.challengeRemaining)} с · очистите поле`;
  $('#challenge-1').classList.toggle('unlocked', breachGame.challenge1Unlocked);
  $<HTMLButtonElement>('#challenge-1').disabled = s.paused || !breachGame.challenge1Unlocked;
  $('#progress-fill').style.width = `${Math.min(100, s.block / C.blockCount * 100)}%`;
  $('#boundary-marker').classList.toggle('hidden', s.boundary === null);
  if (s.boundary !== null) $('#boundary-marker').style.left = `${Math.max(0, Math.min(100, s.boundary / (C.blockCount * s.size) * 100))}%`;
  $('#paused-overlay').classList.toggle('hidden', !s.paused);
  $('#gesture').classList.toggle('hidden', s.paused || s.tutorial !== 'click');
  $('#mine-hint').classList.toggle('hidden', !done);
  $('#pause').textContent = s.paused ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', s.paused ? 'Продолжить' : 'Пауза');
  $('#message').textContent = s.message;
  $<HTMLButtonElement>('#mine').disabled = s.paused || s.tutorial === 'auto';
  document.querySelectorAll('.advanced').forEach((el) => el.classList.toggle('hidden', !s.auto));
  $('#resource-loop').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('earth'));
  $('#alchemy-quick-resources').textContent = `Камень ${s.alchemy.stone} · Земля ${s.alchemy.earth}/${alchemyCapacity(s.alchemy, 'earth')}${breachGame.alchemyNodeUnlocked('water') ? ` · Элементальный камень ${s.alchemy.elementalStone} · Вода ${s.alchemy.water}/${alchemyCapacity(s.alchemy, 'water')}` : ''}${breachGame.alchemyNodeUnlocked('air') ? ` · Воздух ${s.alchemy.air}/${alchemyCapacity(s.alchemy, 'air')}` : ''}`;
  $('#resource-loop [data-alchemy-switch="waterEnabled"]').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('water'));
  $('#resource-loop [data-alchemy-switch="elementalizationEnabled"]').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('air'));
  $('#ranged-equipment').classList.toggle('hidden', !s.rangedUnlocked && !s.needleUnlocked);
  $('#upgrade-hint').classList.toggle('hidden', !s.auto || s.repeatablesUnlocked);
  setUpgrade('auto', s.auto ? '✓' : `${C.costs.auto} ◆`, s.auto || s.tutorial !== 'auto' || s.ore < C.costs.auto);
  setUpgrade('pick', s.pickUnlocked ? '✓' : s.furthestBlock < C.pickUnlockBlock ? 'КВ. 3' : `${C.costs.pick} ◆`, !s.auto || s.furthestBlock < C.pickUnlockBlock || s.pickUnlocked || s.ore < C.costs.pick);
  setUpgrade('spear', s.spearUnlocked ? '✓' : s.furthestBlock < C.spearUnlockBlock ? 'КВ. 25' : `${C.costs.spear} ◆ + ${C.costs.spearCrystals} ✦`, s.spearUnlocked || s.furthestBlock < C.spearUnlockBlock || s.ore < C.costs.spear || s.crystals < C.costs.spearCrystals);
  const spatialCompressor = upgrade('spatialCompressor');
  const remainingFraction = breachGame.currentStones().length / (s.size * s.size);
  setUpgrade('spatialCompressor', `${C.spatialCompressorCost} ◆ · остаток ≤5%`, s.paused || s.furthestBlock < C.spatialCompressorUnlockBlock || s.challengeArena || remainingFraction > 0.05 || s.ore < C.spatialCompressorCost);
  spatialCompressor.classList.toggle('hidden', s.furthestBlock < C.spatialCompressorUnlockBlock);
  setUpgrade('fistCombo', s.fistComboUnlocked ? '✓' : `${C.costs.fistCombo} ◆`, s.fistComboUnlocked || s.ore < C.costs.fistCombo);
  setUpgrade('spearPierce', `${C.costs.spearPierce} ◆`, !s.spearUnlocked || s.spearPierce || s.ore < C.costs.spearPierce);
  setUpgrade('spearEnchant', breachGame.alchemyNodeUnlocked('air') ? `${A.spearEnchantUnlockAir} Воздуха` : 'ВОЗДУХ', !s.spearUnlocked || s.spearEnchant || !breachGame.alchemyNodeUnlocked('air') || s.alchemy.air < A.spearEnchantUnlockAir);
  setUpgrade('penetration', s.penetration ? '✓' : `${C.costs.penetration} ◆`, !!s.penetration || !s.auto || s.ore < C.costs.penetration);
  upgrade('auto').classList.toggle('attention', s.tutorial === 'auto');
  upgrade('penetration').classList.toggle('attention', s.tutorial === 'penetration');
  for (const [name, level] of [['fistComboRadius', s.fistComboRadiusLevel], ['spearDamage', s.spearLevel], ['spearReach', s.spearReachLevel], ['spearSpeed', s.spearSpeedLevel], ['melee', s.fistLevel], ['fistSpeed', s.fistSpeedLevel], ['pickDamage', s.pickLevel], ['pickSpeed', s.pickSpeedLevel], ['movement', s.movementLevel], ['rangedDamage', s.rangedLevel], ['needleDamage', s.needleLevel], ['needleSpeed', s.needleSpeedLevel], ['emitterSpeed', s.emitterSpeedLevel], ['fistFinisher', s.fistFinisherLevel], ['pickReach', s.pickReachLevel], ['needlePierce', s.needlePierceLevel], ['emitterSpread', s.emitterSpreadLevel], ['emitterArea', s.emitterAreaLevel], ['beamSpeed', s.beamSpeedLevel]] as const) {
    const cost = upgradeOreCost(name, level);
    const crystals = specialCrystalCost(name, level);
    const fistRadiusLocked = name === 'fistComboRadius' && level >= 3 && s.furthestBlock < C.comboFistRadiusLevel4UnlockBlock;
    const costLabel = `${cost} ◆${crystals ? ` + ${crystals} ✦` : ''}${fistRadiusLocked ? ' · КВ. 25' : ''}`;
    setUpgrade(name, costLabel, !s.repeatablesUnlocked || s.ore < cost || s.crystals < crystals || fistRadiusLocked || (name === 'fistComboRadius' && (!s.fistComboUnlocked || level >= C.comboFistRadiusMaxLevel)) || (name === 'pickReach' && level >= C.pickReachMaxLevel) || ((name === 'pickDamage' || name === 'pickReach' || name === 'pickSpeed') && !s.pickUnlocked) || ((name === 'spearDamage' || name === 'spearReach' || name === 'spearSpeed') && !s.spearUnlocked) || ((name === 'rangedDamage' || name === 'emitterSpread' || name === 'emitterArea' || name === 'beamSpeed' || name === 'emitterSpeed') && !s.rangedUnlocked) || ((name === 'needleDamage' || name === 'needlePierce' || name === 'needleSpeed') && !s.needleUnlocked) || (name === 'needlePierce' && level >= C.needlePierceMaxLevel) || (name === 'emitterSpread' && level >= C.emitterSpreadMaxLevel) || (name === 'emitterArea' && level >= C.emitterAreaMaxLevel), level);
  }
  for (const [name, weapon, level] of [
    ['fistMastery', 'fist', s.fistLevel], ['pickMastery', 'pick', s.pickLevel], ['spearMastery', 'spear', s.spearLevel],
    ['needleMastery', 'needle', s.needleLevel], ['emitterMastery', 'emitter', s.rangedLevel],
  ] as const) {
    const cost = C.weaponMasteries[weapon].cost;
    setUpgrade(name, s.weaponMasteries[weapon] ? '✓' : `${cost} ◆`, s.weaponMasteries[weapon] || level < C.weaponMasteries[weapon].unlockLevel || s.ore < cost);
  }
  setUpgrade('ranged', s.rangedUnlocked ? '✓' : s.furthestBlock < C.rangedUnlockBlock ? 'КВ. 15' : `${C.costs.ranged} ◆`, !s.needleUnlocked || s.rangedUnlocked || s.furthestBlock < C.rangedUnlockBlock || s.ore < C.costs.ranged);
  setUpgrade('needle', s.needleUnlocked ? '✓' : `${C.costs.needle} ◆`, !s.auto || s.needleUnlocked || s.ore < C.costs.needle);
  setUpgrade('artifact', s.artifactUnlocked ? '\u2713' : s.furthestBlock < C.artifactUnlockBlock ? 'КВ. 25' : `${C.costs.artifact} \u2726`, s.artifactUnlocked || s.furthestBlock < C.artifactUnlockBlock || s.crystals < C.costs.artifact);
  setUpgrade('needleAlt', s.needleAltUnlocked ? '✓' : s.furthestBlock < C.needleAltUnlockBlock ? 'КВ. 20' : `${C.costs.needleAlt} ✦`, !s.needleUnlocked || s.needleAltUnlocked || s.furthestBlock < C.needleAltUnlockBlock || s.crystals < C.costs.needleAlt);
  setUpgrade('expansion', s.expansion >= C.maxExpansion ? 'МАКС' : !s.completions ? 'ПРОРЫВ' : `${C.costs.expansion} ⬡`, !s.completions || s.expansion >= C.maxExpansion || s.breakthrough < C.costs.expansion, s.expansion);
  $('#equip-fists').classList.toggle('active', s.weapon === 'fists');
  $<HTMLButtonElement>('#equip-fists').disabled = s.paused;
  $('#equip-pick').classList.toggle('active', s.weapon === 'pick');
  $<HTMLButtonElement>('#equip-pick').disabled = s.paused || !s.pickUnlocked;
  $('#equip-spear').classList.toggle('active', s.weapon === 'spear');
  $<HTMLButtonElement>('#equip-spear').disabled = s.paused || !s.spearUnlocked;
  const comboWeapon = s.weapon === 'ranged' ? 'fists' : s.weapon;
  const comboAvailable = comboWeapon === 'fists' ? s.fistComboUnlocked : s.challenge1Completed;
  $('#combo-toggle').textContent = comboAvailable ? `Комбо: ${s.combos[comboWeapon] ? 'ВКЛ' : 'ВЫКЛ'}` : comboWeapon === 'fists' ? 'Комбо: купите улучшение' : 'Комбо: после Challenge 1';
  $<HTMLButtonElement>('#combo-toggle').disabled = s.paused || !comboAvailable;
  $('#equip-emitter').classList.toggle('active', s.rangedWeapon === 'emitter');
  $('#equip-needle').classList.toggle('active', s.rangedWeapon === 'needle');
  $<HTMLButtonElement>('#equip-emitter').disabled = s.paused || !s.rangedUnlocked;
  $<HTMLButtonElement>('#equip-needle').disabled = s.paused || !s.needleUnlocked;
  document.querySelectorAll<HTMLElement>('[data-weapon]').forEach(button => {
    const weapon = button.dataset.weapon;
    const selected = weapon === s.weapon || (weapon === s.rangedWeapon && (s.rangedUnlocked || s.needleUnlocked));
    const mastery = button.dataset.upgrade?.replace('Mastery', '').toLowerCase() as keyof typeof s.weaponMasteries | undefined;
    const masteryOwned = !!mastery && s.weaponMasteries[mastery];
    const maxed = masteryOwned || (button.dataset.upgrade === 'fistComboRadius' && s.fistComboRadiusLevel >= C.comboFistRadiusMaxLevel) || (button.dataset.upgrade === 'needlePierce' && s.needlePierceLevel >= C.needlePierceMaxLevel) || (button.dataset.upgrade === 'emitterSpread' && s.emitterSpreadLevel >= C.emitterSpreadMaxLevel) || (button.dataset.upgrade === 'emitterArea' && s.emitterAreaLevel >= C.emitterAreaMaxLevel);
    button.classList.toggle('hidden', !selected || maxed);
  });
  for (const [name, acquired] of [['auto', s.auto], ['pick', s.pickUnlocked], ['penetration', !!s.penetration], ['ranged', s.rangedUnlocked], ['needle', s.needleUnlocked], ['needleAlt', s.needleAltUnlocked], ['artifact', s.artifactUnlocked]] as const) {
    upgrade(name).classList.toggle('hidden', acquired);
  }
  upgrade('spear').classList.toggle('hidden', s.spearUnlocked);
  upgrade('fistCombo').classList.toggle('hidden', s.weapon !== 'fists' || s.fistComboUnlocked);
  upgrade('spearPierce').classList.toggle('hidden', s.weapon !== 'spear' || s.spearPierce);
  upgrade('spearEnchant').classList.toggle('hidden', s.weapon !== 'spear' || s.spearEnchant);
  upgrade('spearReach').classList.toggle('hidden', s.weapon !== 'spear' || s.spearReachLevel >= 5);
  upgrade('pickReach').classList.toggle('hidden', s.weapon !== 'pick' || s.pickReachLevel >= C.pickReachMaxLevel);
  for (const name of ['fistMastery', 'pickMastery', 'spearMastery', 'needleMastery', 'emitterMastery']) {
    const weapon = MASTERY_UI_WEAPON[name as keyof typeof MASTERY_UI_WEAPON];
    const level = weapon === 'fist' ? s.fistLevel : weapon === 'pick' ? s.pickLevel : weapon === 'spear' ? s.spearLevel : weapon === 'needle' ? s.needleLevel : s.rangedLevel;
    const selected = weapon === 'fist' ? s.weapon === 'fists' : weapon === 'pick' || weapon === 'spear' ? s.weapon === weapon : s.rangedWeapon === weapon;
    const unlocked = level >= C.weaponMasteries[weapon].unlockLevel && !s.weaponMasteries[weapon];
    upgrade(name).classList.toggle('hidden', !selected || !unlocked);
    upgrade(name).classList.toggle('new-feature', selected && unlocked && !s.seenFeatures[name]);
  }
  for (const name of ['auto', 'pick', 'spear', 'needle', 'ranged', 'fistCombo', 'needleAlt', 'artifact', 'spearPierce', 'spearEnchant', 'spatialCompressor']) {
    const button = upgrade(name);
    const opened = name === 'pick' ? s.furthestBlock >= C.pickUnlockBlock : name === 'spear' ? s.furthestBlock >= C.spearUnlockBlock : name === 'ranged' ? s.furthestBlock >= C.rangedUnlockBlock && s.needleUnlocked : name === 'spatialCompressor' ? s.furthestBlock >= C.spatialCompressorUnlockBlock : name === 'needleAlt' ? s.furthestBlock >= C.needleAltUnlockBlock && s.needleUnlocked : name === 'artifact' ? s.furthestBlock >= C.artifactUnlockBlock : name === 'spearEnchant' ? breachGame.alchemyNodeUnlocked('air') : !button.disabled;
    button.classList.toggle('new-feature', opened && !button.classList.contains('hidden') && !s.seenFeatures[name]);
  }
  for (const definition of ALCHEMY_UPGRADES) {
    const button = $<HTMLButtonElement>(`[data-alchemy-upgrade="${definition.id}"]`);
    button.classList.toggle('new-feature', !button.disabled && !s.seenFeatures[`alchemy:${definition.id}`]);
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.upgrade as Parameters<typeof breachGame.buy>[0];
    s.seenFeatures[name] = true;
    if (breachGame.buy(name)) breachGame.save();
    render();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-alchemy-upgrade]').forEach(button => button.addEventListener('click', () => { s.seenFeatures[`alchemy:${button.dataset.alchemyUpgrade}`] = true; breachGame.save(); render(); }));
$('#mine').addEventListener('click', () => { breachGame.click(); render(); });
$('#equip-fists').addEventListener('click', () => { breachGame.equip('fists'); breachGame.save(); render(); });
$('#equip-pick').addEventListener('click', () => { breachGame.equip('pick'); breachGame.save(); render(); });
$('#equip-spear').addEventListener('click', () => { breachGame.equip('spear'); breachGame.save(); render(); });
$('#combo-toggle').addEventListener('click', () => { const weapon = s.weapon; if (weapon !== 'ranged' && (weapon === 'fists' ? s.fistComboUnlocked : s.challenge1Completed)) { s.combos[weapon] = !s.combos[weapon]; breachGame.save(); render(); } });
$('.alchemy-help').addEventListener('toggle', () => { if (($('.alchemy-help') as HTMLDetailsElement).open && !s.alchemyHelpSeen) { s.alchemyHelpSeen = true; breachGame.save(); render(); } });
$('#equip-emitter').addEventListener('click', () => { breachGame.equipRanged('emitter'); breachGame.save(); render(); });
$('#equip-needle').addEventListener('click', () => { breachGame.equipRanged('needle'); breachGame.save(); render(); });
$('#challenge-1').addEventListener('click', () => { if (s.challengeArena) breachGame.leaveChallenge1(); else breachGame.enterChallenge1(); breachGame.save(); render(); });

function togglePause(): void {
  s.paused = !s.paused;
  lastTick = performance.now();
  if (s.paused) { if (game.scene.isActive('BreachScene')) game.scene.pause('BreachScene'); }
  else if (game.scene.isPaused('BreachScene')) { (game.scene.getScene('BreachScene') as BreachScene).resetInterpolation(); game.scene.resume('BreachScene'); }
  breachGame.save();
  render();
}
$('#pause').addEventListener('click', togglePause);
$('#reset-progress').addEventListener('click', () => {
  if (!window.confirm('Сбросить весь прогресс этой игры? Улучшения, ресурсы и достижения будут удалены.')) return;
  if (!clearBreachSave()) {
    window.alert('Не удалось удалить сохранение. Проверьте доступ к хранилищу браузера.');
    return;
  }
  resetRequested = true;
  window.clearInterval(interval);
  window.location.reload();
});
function onKey(event: KeyboardEvent): void {
  if (event.code !== 'KeyP' && event.code !== 'Escape') return;
  event.preventDefault();
  if (!event.repeat) togglePause();
}
window.addEventListener('keydown', onKey);
const onPageHide = () => { if (!resetRequested) breachGame.save(); };
window.addEventListener('pagehide', onPageHide);
const interval = window.setInterval(() => {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (!s.paused) {
    const scene = game.scene.isActive('BreachScene') ? game.scene.getScene('BreachScene') as BreachScene : null;
    scene?.beforeSimulation();
    breachGame.advance(dt);
    scene?.afterSimulation(dt);
    saveTime += dt;
    if (saveTime >= C.saveIntervalSeconds) { breachGame.save(); saveTime = 0; }
  }
  render();
}, 100);
import.meta.hot?.dispose(() => {
  window.clearInterval(interval);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('pagehide', onPageHide);
  game.destroy(true);
});
render();
