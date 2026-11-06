import './breach.css';
import { createGame } from './game/config';
import { breachGame, clearBreachSave, specialCrystalCost, upgradeOreCost, CYCLE_UPGRADE_DEFS, SPECTRA_UPGRADE_DEFS } from './game/breach';
import { BREACH_CONFIG as C } from './game/breachConfig';
import { BreachScene } from './game/BreachScene';
import { ALCHEMY_CONFIG as A, ALCHEMY_UPGRADES, alchemyCapacity, alchemyTickSeconds } from './game/alchemy';
import type { AlchemyNode, AlchemyResource, AlchemySwitch } from './game/alchemy';
import { CHALLENGE_RULES, type ChallengeId } from './game/challengeConfig';

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
          <div class="map-bottom"><div><span class="map-key"><i class="stone-key"></i> ПОРОДА</span><span class="map-key"><i class="hard-key"></i> ТВЁРДАЯ</span><span class="map-key"><i class="element-key"></i> ЭЛЕМЕНТ</span></div><button id="mine" class="mine-button">✦ &nbsp; УСКОРИТЬ</button></div>
          <div class="progress-track"><div id="progress-fill"></div><span id="boundary-marker" class="hidden" title="Приближающаяся граница"></span></div>
        </section>
        <div class="below-map"><span id="message"></span><span id="boss-status"></span><span id="mine-hint" class="hidden">Нажмите на карту, чтобы ускорить добычу</span></div>
        <section id="resource-loop" class="support-card hidden">
          <div class="support-icon">◈</div><div class="support-copy"><span class="eyebrow">АЛХИМИЯ</span><h2>Быстрое управление</h2><p id="alchemy-quick-resources"></p></div>
          <div class="support-action"><button class="small-button" data-alchemy-switch="earthEnabled"></button><button class="small-button" data-alchemy-switch="pickEnabled"></button><button class="small-button" data-alchemy-switch="waterEnabled"></button><button class="small-button" data-alchemy-switch="elementalizationEnabled"></button><button class="small-button" id="earth-overload"></button><button class="small-button" id="auto-crystallize"></button></div>
        </section>
        <section id="cycle-shop" class="cycle-shop hidden"><div class="cycle-heading"><div><span class="eyebrow">ПРЕОДОЛЕНИЕ ПРЕДЕЛА</span><h2>Улучшения Цикла</h2><p>Постоянные усиления за очки прорыва. Группы 1–2 открывают силу, группы 3–4 ускоряют следующие циклы.</p></div><strong><span id="cycle-points">0</span> ⬡</strong></div><div id="cycle-upgrades" class="cycle-grid"></div></section>
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
          <button class="upgrade hidden" data-upgrade="pickOptimization"><span class="upgrade-icon">◈</span><span class="upgrade-copy"><strong>Оптимизация потребления кирки</strong><small>После прохождения 25-го квадрата возвращает расход Земли за удар к норме.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="spear"><span class="upgrade-icon">⚔</span><span class="upgrade-copy"><strong>Копьё</strong><small>15 000 руды и 5 кристаллов; круговая атака радиусом 4, медленнее кирки.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="penetration"><span class="upgrade-icon">◇</span><span class="upgrade-copy"><strong>Пробиваемость</strong><small>Снимает сопротивление твёрдой породы у ударов по области.</small></span><span class="price"></span></button>
          <button class="upgrade hidden" data-upgrade="spatialCompressor"><span class="upgrade-icon">⦿</span><span class="upgrade-copy"><strong>Пространственный сжиматель</strong><small>Постоянное улучшение за 150 000 руды. После открытия автоматически переносит на следующий слой при остатке породы ≤5%.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="movement"><span class="upgrade-icon">➜</span><span class="upgrade-copy"><strong>Скорость движения <b></b></strong><small>Увеличивает скорость передвижения на 25% за уровень.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="ranged"><span class="upgrade-icon">⌁</span><span class="upgrade-copy"><strong>Излучатель</strong><small>Непрерывный лазер повреждает задние камни по области.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="needle"><span class="upgrade-icon">➶</span><span class="upgrade-copy"><strong>Игломёт</strong><small>Быстро стреляет по одному заднему камню.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="needleAlt"><span class="upgrade-icon">⇉</span><span class="upgrade-copy"><strong>Автономный игломёт</strong><small>С 20-го квадрата: игломёт стреляет в фоне с 25% скорострельности, пока выбрано другое дальнее оружие.</small></span><span class="price"></span></button>
        </div>
        <section id="equipment" class="equipment"><span class="eyebrow">БЛИЖНЕЕ ОРУЖИЕ</span><div><button id="equip-fists" class="equipment-button">✊ Кулаки</button><button id="equip-pick" class="equipment-button active">⛏ Кремневая кирка</button><button id="equip-spear" class="equipment-button">⚔ Копьё</button><button id="equip-bombarda" class="equipment-button hidden">◉ Бомбарда</button></div>
          <button id="combo-toggle" class="equipment-button"></button>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="fists" data-upgrade="fistUnique"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Импульсный сердечник</strong><small>Уникальное улучшение: повышает урон кулаков на 50%.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickInfinity"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Бесконечное зачарование</strong><small>Уникальное улучшение: пробивает элементальную породу на 25%. Заряженная кирка бьёт в начале и в конце рывка; взрыв снимает до половины прочности, максимум двойной урон кирки за попадание.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistCombo"><span class="upgrade-icon">✹</span><span class="upgrade-copy"><strong>Комбо кулаков</strong><small>Каждый пятый удар бьёт по области; подготовка вдвое дольше.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistComboRadius"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Радиус комбо <b></b></strong><small>Уровни повышают радиус с сильным спадом урона по краям. Улучшение «Раскрытая дуга» открывает ещё два уровня.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearDamage"><span class="upgrade-icon">⚔</span><span class="upgrade-copy"><strong>Сила копья <b></b></strong><small>Увеличивает урон копья.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearReach"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Размах копья <b></b></strong><small>Увеличивает радиус атаки; «Раскрытая дуга» открывает ещё два уровня.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearPierce"><span class="upgrade-icon">◇</span><span class="upgrade-copy"><strong>Пробивающий рывок</strong><small>Комбо игнорирует броню твёрдой породы.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearEnchant"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Элементальное зачарование</strong><small>Единовременная покупка за 60 Воздуха навсегда открывает пробитие элементальной руды. Заряженный рывок наносит урон по прямоугольной траектории.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="melee"><span class="upgrade-icon">✊</span><span class="upgrade-copy"><strong>Сила кулаков <b></b></strong><small>Увеличивает урон кулаков.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistFinisher"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Добивание <b></b></strong><small>Удары по камням с половиной прочности или меньше сильнее на 25% за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость кулаков <b></b></strong><small>Увеличивает частоту ударов кулаками.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="fists" data-upgrade="fistMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Утяжелённые перчатки</strong><small>Разблокируется после 3 улучшений силы кулаков; +25% урона.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickDamage"><span class="upgrade-icon">⛏</span><span class="upgrade-copy"><strong>Мощность кирки <b></b></strong><small>Увеличивает урон кремневой кирки.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickReach"><span class="upgrade-icon">◔</span><span class="upgrade-copy"><strong>Размах <b></b></strong><small>Увеличивает радиус удара; «Раскрытая дуга» открывает ещё два уровня. Комбовзрыв добавляет 3 клетки с сильным спадом урона от центра.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость кирки <b></b></strong><small>Увеличивает частоту ударов киркой.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="pick" data-upgrade="pickMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Усиленная головка</strong><small>Разблокируется после 3 улучшений кирки; +25% урона.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="spear" data-upgrade="spearSpeed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость копья <b></b></strong><small>Увеличивает частоту атак копьём.</small></span><span class="price"></span></button>
            <button class="upgrade hidden" data-weapon="spear" data-upgrade="spearMastery"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Сбалансированное древко</strong><small>Разблокируется после 3 улучшений силы копья; +25% урона.</small></span><span class="price"></span></button>
          </div></section>
        <section id="ranged-equipment" class="equipment hidden"><span class="eyebrow">ДАЛЬНЕЕ ОРУЖИЕ</span><div><button id="equip-needle" class="equipment-button">➶ Игломёт</button><button id="equip-emitter" class="equipment-button">⌁ Излучатель</button></div>
          <button id="ranged-burst" class="equipment-button" disabled>Всплеск: 0 / 3 · после Challenge 2</button>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="needle" data-upgrade="needleFire"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Зажигательные иглы</strong><small>Уникальное улучшение за Огонь: пробивает элементальную руду, поджигает каждый камень один раз и наносит урон со временем.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterPierce"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Гидрорезонанс</strong><small>Уникальное улучшение за Воду: пробивает элементальную руду; закликивание ускоряет излучатель.</small></span><span class="price"></span></button>
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
        <section id="spectra-shop" class="hidden"><h2>Теорема Спектра</h2><button id="spectra-unlock" class="upgrade">Открыть Теорему Спектра · 1 000 кристаллов</button><div id="spectra-upgrades" class="upgrades"></div></section>
        <section class="challenge-section"><div class="list-heading"><div><span class="eyebrow">РЕЖИМЫ</span><h2>Испытания</h2></div><span>◇</span></div>
          <button id="challenge-1" class="challenge-card" aria-live="polite"><strong>Challenge 1 · Перегрузка</strong><span id="challenge-1-status"></span></button>
          <button id="challenge-2" class="challenge-card" aria-live="polite"><strong>Challenge 2 · Скоростной прорыв</strong><span id="challenge-2-status"></span></button>
          <button id="challenge-3" class="challenge-card" aria-live="polite"><strong>Challenge 3 · Тепловой шифр</strong><span id="challenge-3-status">Откроется на 45-м квадрате</span></button>
          <button id="challenge-4" class="challenge-card" aria-live="polite"><strong>Теорема существования</strong><span id="challenge-4-status">Откроется после 50-го квадрата</span></button>
        </section>
        <footer>ПИОНЕР / PRE-INFINITY <span>✳</span></footer>
      </aside>
    </div>
    <section id="alchemy-view" class="alchemy-view hidden" aria-label="Алхимия">
      <div class="alchemy-heading"><span class="eyebrow">ВТОРОЙ КОНТУР</span><h1>Алхимия</h1><p>Рецепты продолжают работать, когда открыт прорыв.</p><details class="alchemy-help"><summary aria-label="Как работает алхимия">?</summary><div><strong>Как работает алхимия</strong><p>Земля и Вода открываются вместе после прохождения 20-го квадрата. Камень перерабатывается в Землю, а Земля вместе с элементальным камнем — в Воду. Улучшения Земли покупаются за Воду, улучшения Т2 — за Воздух.</p><p>Разрушенная обычная порода даёт 1 камень, твёрдая — 3, элементальная — 2 камня и 1 элементальный камень. Перегрузка Земли стоит 4 000 Земли и 100 Воды: 30 минут каждый второй сломанный камень даёт ещё 1 элементальный камень; включается один раз за попытку.</p><p>Кристаллизация обменивает 100 Воды на 1 кристалл. Зачарование кирки тратит в пять раз больше Земли до оптимизации после 25-го квадрата. После открытия Огня катализатор замыкает цикл и пассивно пополняет все основные ресурсы.</p></div></details></div>
      <div class="alchemy-layout">
        <div class="alchemy-nodes" aria-label="Стихии">
          <button class="alchemy-node earth" data-alchemy-node="earth"><span class="alchemy-symbol">◆</span><strong>Земля</strong><small id="earth-node-status"></small></button>
          <button class="alchemy-node water" data-alchemy-node="water"><span class="alchemy-symbol">◈</span><strong>Вода</strong><small id="water-node-status"></small></button>
          <button class="alchemy-node air" data-alchemy-node="air"><span class="alchemy-symbol">≈</span><strong>Воздух</strong><small>Challenge 1</small></button>
          <button class="alchemy-node fire" data-alchemy-node="fire"><span class="alchemy-symbol">✦</span><strong>Огонь</strong><small id="fire-node-status">Challenge 3</small></button>
        </div>
        <div class="alchemy-details">
          <div data-alchemy-panel="earth"><span class="eyebrow">ПЕРВАЯ СТИХИЯ</span><h2>Земля</h2><p id="earth-description"></p><div class="alchemy-resources"><span>Камень <b id="alchemy-stone">0</b></span><span>Земля <b id="alchemy-earth">0</b></span><span>Кристаллы <b id="alchemy-earth-crystals">0</b></span></div><button class="alchemy-action" data-alchemy-switch="earthEnabled"></button><button class="alchemy-action" data-alchemy-switch="pickEnabled"></button><h3>Улучшения</h3><div class="alchemy-upgrades" data-alchemy-upgrades="earth"></div></div>
          <div class="hidden" data-alchemy-panel="water"><span class="eyebrow">ВТОРАЯ СТИХИЯ</span><h2>Вода</h2><p id="water-description"></p><div class="alchemy-resources"><span>Земля <b id="alchemy-earth-for-water">0</b></span><span>Элементальный камень <b id="alchemy-elemental">0</b></span><span>Вода <b id="alchemy-water">0</b></span><span>Кристаллы <b id="alchemy-water-crystals">0</b></span></div><button class="alchemy-action" id="craft-water"></button><button class="alchemy-action" data-alchemy-switch="waterEnabled"></button><button class="alchemy-action" id="crystallize-water"></button><h3>Улучшения</h3><div class="alchemy-upgrades" data-alchemy-upgrades="water"></div></div>
          <div class="hidden" data-alchemy-panel="fire"><span class="eyebrow">ЗАМЫКАЕТ ЦИКЛ</span><h2>Огонь</h2><p>Откроется после прохождения Challenge 3.</p><div class="alchemy-resources"><span>Огонь <b id="alchemy-fire">0</b></span><span>Катализатор создаёт Камень и Элементальный камень</span></div><h3>Дорогие улучшения</h3><div class="alchemy-upgrades" data-alchemy-upgrades="fire"></div></div>
          <div class="hidden" data-alchemy-panel="air"><span class="eyebrow">СТИХИЯ</span><h2>Воздух</h2><p id="air-description">Откроется после прохождения Challenge 1. Производится из Воды.</p><div class="alchemy-resources"><span>Вода <b id="alchemy-water-for-air">0</b></span><span>Воздух <b id="alchemy-air">0 / 100</b></span></div><button class="alchemy-action" data-alchemy-switch="airProductionEnabled"></button><button class="alchemy-action" data-alchemy-switch="elementalizationEnabled"></button></div>
        </div>
      </div>
    </section>
    <div id="challenge-modal" class="challenge-modal hidden" role="presentation">
      <section class="challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="challenge-modal-title">
        <button id="challenge-modal-close" class="challenge-close" aria-label="Закрыть">×</button>
        <span id="challenge-modal-kicker" class="eyebrow">ИСПЫТАНИЕ</span>
        <h2 id="challenge-modal-title"></h2>
        <p id="challenge-modal-condition"></p>
        <div id="challenge-modal-rules" class="challenge-rules"></div>
        <div id="challenge-4-prep" class="hidden"><p>Перед забегом можно потратить ресурсы алхимии на подготовку:</p><button id="challenge-4-stone"></button><button id="challenge-4-damage"></button><button id="challenge-4-range"></button></div>
        <p id="challenge-modal-reward" class="challenge-reward"></p>
        <button id="challenge-modal-action" class="challenge-action"></button>
      </section>
    </div>
  </div>`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const upgrade = (name: string) => $<HTMLButtonElement>(`[data-upgrade="${name}"]`);
const s = breachGame.state;
const game = createGame('game');
let lastTick = performance.now();
let saveTime = 0;
let resetRequested = false;
let selectedAlchemyNode: AlchemyNode = 'earth';
let selectedChallenge: ChallengeId | null = null;

function renderChallengeModal(): void {
  const modal = $('#challenge-modal');
  modal.classList.toggle('hidden', selectedChallenge === null);
  if (selectedChallenge === null) return;
  const rules = CHALLENGE_RULES[selectedChallenge];
  const active = s.challengeArena && s.challengeNumber === selectedChallenge;
  const unlocked = selectedChallenge === 1 ? breachGame.challenge1Unlocked : selectedChallenge === 2 ? breachGame.challenge2Unlocked : selectedChallenge === 3 ? breachGame.challenge3Unlocked : breachGame.challenge4Unlocked;
  $('#challenge-modal-kicker').textContent = `CHALLENGE ${selectedChallenge}`;
  $('#challenge-modal-title').textContent = rules.title;
  $('#challenge-modal-condition').textContent = rules.condition;
  $('#challenge-modal-rules').textContent = [
    rules.size ? `Поле: ${rules.size}×${rules.size}` : '',
    rules.durationSeconds ? `Лимит времени: ${rules.durationSeconds} секунд` : '',
    rules.stoneMultiplier !== 1 ? `Прочность камня: ×${rules.stoneMultiplier}` : '',
    rules.attackSpeedMultiplier !== 1 ? `Скорость атак: ×${rules.attackSpeedMultiplier}` : '',
    rules.movementSpeedMultiplier !== 1 ? `Скорость движения: ×${rules.movementSpeedMultiplier}` : '',
    selectedChallenge === 2 ? 'Обычные атаки поражают только выбранную клетку.' : '',
    selectedChallenge === 3 && s.challengeArena ? `Элементальный камень ${s.challenge3Transmuted.toLocaleString()} / 10 000` : '',
    selectedChallenge === 4 && s.challengeArena ? `Квадрат ${s.block + 1} / 50 · ${s.stones.length} блоков осталось` : '',
  ].filter(Boolean).join(' · ');
  $('#challenge-modal-reward').textContent = `${rules.unlock} ${rules.reward}`;
  const action = $<HTMLButtonElement>('#challenge-modal-action');
  action.textContent = active ? 'Выйти из испытания' : unlocked ? 'Начать испытание' : 'Условие открытия не выполнено';
  action.disabled = s.paused || (!unlocked && !active) || (selectedChallenge === 3 && s.alchemy.air < 1 && !active);
  $('#challenge-4-prep').classList.toggle('hidden', selectedChallenge !== 4 || !unlocked || active);
  for (const [kind, label, cost, disabled] of [
    ['stone', `Понизить здоровье породы · ×${s.challenge4StoneMultiplier.toFixed(2)} → ×${Math.max(0.4, s.challenge4StoneMultiplier * 0.8).toFixed(2)}`, '1000 Земли + 100 Воды', s.challenge4StoneMultiplier <= 0.401 || s.alchemy.earth < 1000 || s.alchemy.water < 100],
    ['damage', `Урон · ×${s.challenge4DamageMultiplier.toFixed(2)} → ×${Math.min(2, s.challenge4DamageMultiplier + 0.25).toFixed(2)}`, '100 Огня + 50 Воздуха', s.challenge4DamageMultiplier >= 2 || s.alchemy.fire < 100 || s.alchemy.air < 50],
    ['range', `Дальность · +${s.challenge4RangeBonus} → +${s.challenge4RangeBonus + 1}`, '500 Воды + 50 Воздуха', s.challenge4RangeBonus >= 3 || s.alchemy.water < 500 || s.alchemy.air < 50],
  ] as const) {
    const button = $<HTMLButtonElement>(`#challenge-4-${kind}`);
    button.textContent = `${label} · ${cost}`;
    button.disabled = s.paused || disabled;
  }
}

function openChallengeDetails(number: ChallengeId): void {
  selectedChallenge = number;
  renderChallengeModal();
}

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
$('#earth-overload').addEventListener('click', () => { if (breachGame.startEarthOverload()) breachGame.save(); render(); });
$('#auto-crystallize').addEventListener('click', () => { if (breachGame.toggleAutoCrystallize()) breachGame.save(); render(); });
$('#spectra-unlock').addEventListener('click', () => { if (breachGame.buySpectraUnlock()) breachGame.save(); render(); });
$('#spectra-upgrades').addEventListener('click', (event) => { const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spectra-upgrade]'); if (target && breachGame.buySpectraUpgrade(target.dataset.spectraUpgrade!)) breachGame.save(); render(); });
$('#cycle-upgrades').addEventListener('click', (event) => { const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cycle-upgrade]'); if (target && breachGame.buyCycleUpgrade(target.dataset.cycleUpgrade!)) breachGame.save(); render(); });

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
  const fireOpen = breachGame.alchemyNodeUnlocked('fire');
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
  $('#fire-node-status').textContent = fireOpen ? `${a.fire} / ${alchemyCapacity(a, 'fire')}` : 'Challenge 3';
  $('#earth-description').textContent = earthOpen
    ? `Каждые ${alchemyTickSeconds(a, 'earth')} с: ${A.earthRecipe.fraction * 100}% запаса камня → Земля 1:1. Улучшения покупаются за Воду, Т2 — за Воздух.`
    : `Пройдите квадрат ${A.earthUnlockBlock + 1}, чтобы открыть Землю и Воду.`;
  $('#water-description').textContent = waterOpen
    ? `Каждые ${alchemyTickSeconds(a, 'water')} с: до ${A.waterRecipe.fraction * 100}% запаса Земли; на 1 Воду нужны 1 Земля и ${A.waterRecipe.elementalPerWater} элементальных камня (минимум 1 Вода).`
    : `Пройдите квадрат ${A.waterUnlockBlock + 1}, чтобы открыть Воду.`;
  $('#air-description').textContent = airOpen
    ? `Производство тратит ${A.airRecipe.waterPerAir} Воды на 1 Воздух каждые ${A.airRecipe.seconds} с. Элементализация расходует 1 Воздух в секунду и с шансом 50% превращает добытый камень в элементальный.`
    : 'Откроется после прохождения Challenge 1.';
  $('[data-alchemy-panel="fire"] p').textContent = fireOpen
    ? `Огонь открыт. Элементальная руда даёт Огонь-катализатор. Каждый тик цикла (${A.fireCycle.seconds} с) требует ${A.fireCycle.earthCostPerTick} Земли и ${A.fireCycle.airCostPerTick} Воздуха, затем пополняет Камень, Элементальный камень, Землю, Воду и Воздух.`
    : 'Откроется после Challenge 3 «Тепловой шифр»: нужно разобраться в связи Воздуха, элементализации и элементальной руды.';
  $('#alchemy-stone').textContent = String(a.stone);
  $('#alchemy-earth').textContent = `${a.earth} / ${earthCapacity}`;
  $('#alchemy-earth-crystals').textContent = String(s.crystals);
  $('#alchemy-earth-for-water').textContent = String(a.earth);
  $('#alchemy-elemental').textContent = String(a.elementalStone);
  $('#alchemy-water').textContent = `${a.water} / ${waterCapacity}`;
  $('#alchemy-water-for-air').textContent = String(a.water);
  $('#alchemy-air').textContent = `${a.air} / ${alchemyCapacity(a, 'air')}`;
  $('#alchemy-fire').textContent = `${a.fire} / ${alchemyCapacity(a, 'fire')}`;
  $('#alchemy-water-crystals').textContent = String(s.crystals);
  const labels: Record<AlchemySwitch, string> = {
    earthEnabled: 'Производство Земли', waterEnabled: 'Производство Воды',
    pickEnabled: `Зачарование Земли для кирки и копья ×${A.pickDamageMultiplier}: ${A.pickEarthPerStone * (s.pickAlchemyOptimized ? 1 : 5)} Земли за камень${s.pickAlchemyOptimized ? '' : ' · ×5 до покупки оптимизации'}`,
    airProductionEnabled: `Производство Воздуха: ${A.airRecipe.waterPerAir} Воды → 1 Воздух за ${A.airRecipe.seconds} с`,
    elementalizationEnabled: 'Элементализация: 1 Воздух/с, 50% добычи превращается в элементальный камень',
  };
  document.querySelectorAll<HTMLButtonElement>('[data-alchemy-switch]').forEach(button => {
    const name = button.dataset.alchemySwitch as AlchemySwitch;
    const unlocked = name === 'waterEnabled' ? waterOpen : name === 'airProductionEnabled' || name === 'elementalizationEnabled' ? airOpen : earthOpen;
    button.textContent = `${labels[name]}: ${a[name] ? 'ВКЛ' : 'ВЫКЛ'}`;
    button.classList.toggle('active', a[name]);
    button.disabled = s.paused || !!breachGame.resetEffect || !unlocked || (name === 'pickEnabled' && !s.pickUnlocked && !s.spearUnlocked);
    button.setAttribute('aria-pressed', String(a[name]));
  });
  const crystal = $<HTMLButtonElement>('#crystallize-water');
  crystal.textContent = `Кристаллизация: ${A.crystalExchange.water} Воды → ${A.crystalExchange.crystals} кристалл`;
  crystal.disabled = s.paused || !!breachGame.resetEffect || !waterOpen || a.water < A.crystalExchange.water;
  const craft = $<HTMLButtonElement>('#craft-water');
  craft.textContent = `Получить Воду: обменять до ${A.waterRecipe.fraction * 100}% Земли`;
  craft.disabled = s.paused || !!breachGame.resetEffect || !waterOpen || a.earth < 1 || a.elementalStone < A.waterRecipe.elementalPerWater || a.water >= waterCapacity;
  const resourceNames: Partial<Record<AlchemyResource, string>> = { earth: 'Земли', water: 'Воды', air: 'Воздуха', fire: 'Огня', crystals: 'кристаллов' };
  for (const definition of ALCHEMY_UPGRADES) {
    const button = $<HTMLButtonElement>(`[data-alchemy-upgrade="${definition.id}"]`);
    const cost = (Object.entries(definition.cost) as [AlchemyResource, number][]).map(([name, value]) => `${value} ${resourceNames[name] ?? name}`).join(' + ');
    const capacity = (Object.entries(definition.capacity) as ['earth' | 'water' | 'air' | 'fire', number][]).map(([name, value]) => `+${value} ${resourceNames[name] ?? name}`).join(', ');
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
  $('#cycle-shop').classList.toggle('hidden', s.completions < 1);
  $('#cycle-points').textContent = String(s.breakthrough);
  $('#cycle-upgrades').innerHTML = [1, 2, 3, 4].map(group => {
    const items = CYCLE_UPGRADE_DEFS.filter(item => item.group === group && !s.cycleUpgrades[item.id]);
    if (!items.length) return '';
    const title = ['Контур I', 'Контур II', 'Экспедиция I', 'Экспедиция II'][group - 1];
    return `<section class="cycle-group"><h3>${group}. ${title}</h3><div class="cycle-group-items">${items.map(item => `<button class="cycle-upgrade" data-cycle-upgrade="${item.id}" ${s.paused || s.breakthrough < item.cost ? 'disabled' : ''}><strong>${item.name}</strong><small>${item.description}</small><span class="price">${item.cost} ${item.cost === 1 ? 'очко' : item.cost < 5 ? 'очка' : 'очков'} прорыва</span></button>`).join('')}</div></section>`;
  }).join('');
  $('#spectra-shop').classList.toggle('hidden', !s.challenge4Completed);
  $('#spectra-unlock').classList.toggle('hidden', s.spectraUnlocked);
  $<HTMLButtonElement>('#spectra-unlock').disabled = s.paused || !s.challenge4Completed || s.crystals < 1000;
  $('#spectra-upgrades').classList.toggle('hidden', !s.spectraUnlocked);
  $('#spectra-upgrades').innerHTML = SPECTRA_UPGRADE_DEFS.filter(item => !s.spectraUpgrades[item.id]).map(item => `<button class="upgrade" data-spectra-upgrade="${item.id}" ${s.ore < item.ore || s.crystals < item.crystals ? 'disabled' : ''}><strong>${item.name}</strong><small>${item.description}</small><span class="price">${item.ore.toLocaleString()} руды + ${item.crystals} кристаллов</span></button>`).join('');
  renderAlchemy();
  $('#block-label').innerHTML = s.challengeArena ? `CHALLENGE ${s.challengeNumber} <em>${s.size}×${s.size}</em>` : `${String(s.block + 1).padStart(2, '0')} <em>/ ${C.blockCount}</em>`;
  $('#stones-label').textContent = String(currentStones).padStart(2, '0');
  $('#boss-status').textContent = s.bossRemaining > 0 ? `${s.block === 24 ? 'ЭЛЕМЕНТАЛЬНЫЙ БОСС' : 'БОСС'} · ${Math.ceil(s.bossRemaining)} с` : s.endChargeRemaining > 0 ? `ЗАРЯД АТАКИ · ${Math.ceil(s.endChargeRemaining)} с` : breachGame.finalWallEffect ? 'ПРОБОЙ ГРАНИЦЫ' : '';
  $('#boss-status').classList.toggle('boss-active', s.bossRemaining > 0 || s.endChargeRemaining > 0 || !!breachGame.finalWallEffect);
  $('#ore').textContent = String(Math.floor(s.ore));
  $('#crystals').textContent = String(s.crystals);
  $('#points').textContent = String(s.breakthrough);
  const challenge1Status = s.challengeArena && s.challengeNumber === 1
    ? s.challengeFailed ? 'Время вышло · вернуться' : s.challengeWon ? 'Пройдено · вернуться' : `Осталось ${Math.ceil(s.challengeRemaining)} с`
    : breachGame.challenge1Unlocked ? s.challenge1Completed ? 'Пройдено · можно повторить' : 'Открыто · начать тест' : 'Откроется на 35-м квадрате';
  $('#challenge-1-status').textContent = challenge1Status;
  const challenge2Status = s.challengeArena && s.challengeNumber === 2
    ? s.challengeFailed ? 'Время вышло · вернуться' : s.challengeWon ? 'Пройдено · вернуться' : `Осталось ${Math.ceil(s.challengeRemaining)} с`
    : breachGame.challenge2Unlocked ? s.challenge2Completed ? 'Пройдено · награда получена' : 'Открыто · начать тест' : 'Откроется на 40-м квадрате';
  $('#challenge-2-status').textContent = challenge2Status;
  $('#challenge-1').classList.toggle('unlocked', breachGame.challenge1Unlocked);
  $<HTMLButtonElement>('#challenge-1').disabled = s.paused;
  $('#challenge-2').classList.toggle('unlocked', breachGame.challenge2Unlocked);
  $('#challenge-3-status').textContent = s.challengeArena && s.challengeNumber === 3
    ? s.challengeWon ? 'Пройдено · вернуться' : `Элементальный камень ${s.challenge3Transmuted.toLocaleString()} / 10 000`
    : s.challenge3Completed ? 'Открыт Огонь' : breachGame.challenge3Unlocked ? 'Открыто · алхимическая загадка' : 'Откроется на 45-м квадрате';
  $('#challenge-3').classList.toggle('unlocked', breachGame.challenge3Unlocked);
  $('#challenge-4-status').textContent = s.challengeArena && s.challengeNumber === 4 ? `Квадрат ${s.block + 1} / 50 · ${s.stones.length} осталось` : s.challenge4Completed ? 'Пройдено · награда ???' : breachGame.challenge4Unlocked ? 'Открыто · начать забег' : 'Откроется после 50-го квадрата';
  $('#challenge-4').classList.toggle('unlocked', breachGame.challenge4Unlocked);
  $('#progress-fill').style.width = `${Math.min(100, s.block / C.blockCount * 100)}%`;
  $('#boundary-marker').classList.toggle('hidden', s.boundary === null);
  if (s.boundary !== null) $('#boundary-marker').style.left = `${Math.max(0, Math.min(100, s.boundary / (C.blockCount * s.size) * 100))}%`;
  $('#paused-overlay').classList.toggle('hidden', !s.paused);
  $('#gesture').classList.toggle('hidden', s.paused || s.tutorial !== 'click');
  $('#mine-hint').classList.toggle('hidden', !done);
  $('#pause').textContent = s.paused ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', s.paused ? 'Продолжить' : 'Пауза');
  $('#message').textContent = s.message;
  $<HTMLButtonElement>('#mine').disabled = s.paused;
  document.querySelectorAll('.advanced').forEach((el) => el.classList.toggle('hidden', !s.auto));
  $('#resource-loop').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('earth'));
  $('#alchemy-quick-resources').textContent = `Камень ${s.alchemy.stone} · Земля ${s.alchemy.earth}/${alchemyCapacity(s.alchemy, 'earth')}${breachGame.alchemyNodeUnlocked('water') ? ` · Элементальный камень ${s.alchemy.elementalStone} · Вода ${s.alchemy.water}/${alchemyCapacity(s.alchemy, 'water')}` : ''}${breachGame.alchemyNodeUnlocked('air') ? ` · Воздух ${s.alchemy.air}/${alchemyCapacity(s.alchemy, 'air')}` : ''}${breachGame.alchemyNodeUnlocked('fire') ? ` · Огонь ${s.alchemy.fire}/${alchemyCapacity(s.alchemy, 'fire')}` : ''}`;
  $('#resource-loop [data-alchemy-switch="waterEnabled"]').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('water'));
  $('#resource-loop [data-alchemy-switch="elementalizationEnabled"]').classList.toggle('hidden', !breachGame.alchemyNodeUnlocked('air'));
  const overload = $<HTMLButtonElement>('#earth-overload');
  const overloadTime = Math.ceil(s.earthOverloadRemaining);
  overload.textContent = overloadTime > 0 ? `Перегрузка Земли · ${Math.floor(overloadTime / 60)}:${String(overloadTime % 60).padStart(2, '0')}` : s.earthOverloadUsed ? 'Перегрузка Земли · уже использована' : `Перегрузка Земли · ${A.earthOverloadCost.earth} Земли + ${A.earthOverloadCost.water} Воды · 30 мин`;
  overload.disabled = s.paused || s.challengeArena || !breachGame.alchemyNodeUnlocked('water') || s.earthOverloadUsed || s.alchemy.earth < A.earthOverloadCost.earth || s.alchemy.water < A.earthOverloadCost.water;
  overload.classList.toggle('active', overloadTime > 0);
  const autoCrystallize = $<HTMLButtonElement>('#auto-crystallize');
  autoCrystallize.textContent = s.autoCrystallizeEnabled ? 'Автокристалл: ВКЛ' : 'Автокристалл: ВЫКЛ';
  autoCrystallize.disabled = s.paused || !s.challenge3Completed;
  autoCrystallize.classList.toggle('active', s.autoCrystallizeEnabled);
  $('#ranged-equipment').classList.toggle('hidden', !s.rangedUnlocked && !s.needleUnlocked);
  $('#upgrade-hint').classList.add('hidden');
  setUpgrade('auto', s.auto ? '✓' : `${C.costs.auto} ◆`, s.auto || s.tutorial !== 'auto' || s.ore < C.costs.auto);
  setUpgrade('pick', s.pickUnlocked ? '✓' : s.furthestBlock <= C.pickUnlockBlock ? 'КВ. 3' : `${C.costs.pick} ◆`, !s.auto || s.furthestBlock <= C.pickUnlockBlock || s.pickUnlocked || s.ore < C.costs.pick);
  setUpgrade('spear', s.spearUnlocked ? '✓' : s.furthestBlock <= C.spearUnlockBlock ? 'КВ. 25' : `${C.costs.spear} ◆ + ${C.costs.spearCrystals} ✦`, s.spearUnlocked || s.furthestBlock <= C.spearUnlockBlock || s.ore < C.costs.spear || s.crystals < C.costs.spearCrystals);
  const spatialCompressor = upgrade('spatialCompressor');
  const remainingFraction = breachGame.currentStones().length / (s.size * s.size);
  setUpgrade('spatialCompressor', s.spatialCompressorUnlocked ? 'Постоянно открыт · авто при ≤5%' : C.spatialCompressorCost + ' руды · открыть навсегда', s.paused || s.furthestBlock <= C.spatialCompressorUnlockBlock || s.challengeArena || s.spatialCompressorUnlocked || s.ore < C.spatialCompressorCost);
  spatialCompressor.classList.toggle('hidden', s.furthestBlock <= C.spatialCompressorUnlockBlock);
  setUpgrade('pickOptimization', s.pickAlchemyOptimized ? '✓' : `${A.pickOptimizationCost.ore} руды + ${A.pickOptimizationCost.earth} Земли + ${A.pickOptimizationCost.water} Воды`, !s.pickUnlocked || s.furthestBlock < 25 || s.challengeArena || s.pickAlchemyOptimized || s.ore < A.pickOptimizationCost.ore || s.alchemy.earth < A.pickOptimizationCost.earth || s.alchemy.water < A.pickOptimizationCost.water);
  upgrade('pickOptimization').classList.toggle('hidden', !s.pickUnlocked || s.furthestBlock < 25 || s.pickAlchemyOptimized);
  setUpgrade('fistCombo', s.fistComboUnlocked ? '✓' : `${C.costs.fistCombo} ◆`, s.fistComboUnlocked || s.ore < C.costs.fistCombo);
  setUpgrade('spearPierce', `${C.costs.spearPierce} ◆`, !s.spearUnlocked || s.spearPierce || s.ore < C.costs.spearPierce);
  setUpgrade('spearEnchant', breachGame.alchemyNodeUnlocked('air') ? `${A.spearEnchantUnlockAir} Воздуха` : 'ВОЗДУХ', !s.spearUnlocked || s.spearEnchant || !breachGame.alchemyNodeUnlocked('air') || s.alchemy.air < A.spearEnchantUnlockAir);
  setUpgrade('fistUnique', `${C.fistUniqueEarthCost} Земли`, !s.challenge1Completed || s.fistUniqueUpgrade || s.alchemy.earth < C.fistUniqueEarthCost);
  setUpgrade('pickInfinity', `${C.pickEnchantEarthCost} Земли`, !s.challenge1Completed || !s.pickUnlocked || s.pickInfinityEnchant || s.alchemy.earth < C.pickEnchantEarthCost);
  setUpgrade('emitterPierce', `${C.emitterPierceWaterCost} Воды`, !s.challenge1Completed || !s.rangedUnlocked || s.emitterPierceUpgrade || s.alchemy.water < C.emitterPierceWaterCost);
  setUpgrade('needleFire', `${C.needleFireUpgradeCost} Огня`, !breachGame.alchemyNodeUnlocked('fire') || !s.needleUnlocked || s.needleFireUpgrade || s.alchemy.fire < C.needleFireUpgradeCost);
  setUpgrade('penetration', s.penetration ? '✓' : `${C.costs.penetration} ◆`, !!s.penetration || !s.auto || s.ore < C.costs.penetration);
  upgrade('auto').classList.toggle('attention', s.tutorial === 'auto');
  upgrade('penetration').classList.toggle('attention', s.tutorial === 'penetration');
  for (const [name, level] of [['fistComboRadius', s.fistComboRadiusLevel], ['spearDamage', s.spearLevel], ['spearReach', s.spearReachLevel], ['spearSpeed', s.spearSpeedLevel], ['melee', s.fistLevel], ['fistSpeed', s.fistSpeedLevel], ['pickDamage', s.pickLevel], ['pickSpeed', s.pickSpeedLevel], ['movement', s.movementLevel], ['rangedDamage', s.rangedLevel], ['needleDamage', s.needleLevel], ['needleSpeed', s.needleSpeedLevel], ['emitterSpeed', s.emitterSpeedLevel], ['fistFinisher', s.fistFinisherLevel], ['pickReach', s.pickReachLevel], ['needlePierce', s.needlePierceLevel], ['emitterSpread', s.emitterSpreadLevel], ['emitterArea', s.emitterAreaLevel], ['beamSpeed', s.beamSpeedLevel]] as const) {
    const cost = upgradeOreCost(name, level);
    const crystals = specialCrystalCost(name, level);
    const extraRadiusLevels = s.cycleUpgrades.cycle3 ? 2 : 0;
    const fistRadiusLocked = name === 'fistComboRadius' && level >= 3 && s.furthestBlock <= C.comboFistRadiusLevel4UnlockBlock;
    const costLabel = `${cost} ◆${crystals ? ` + ${crystals} ✦` : ''}${fistRadiusLocked ? ' · КВ. 25' : ''}`;
    setUpgrade(name, costLabel, !s.repeatablesUnlocked || s.ore < cost || s.crystals < crystals || fistRadiusLocked || (name === 'fistComboRadius' && (!s.fistComboUnlocked || level >= C.comboFistRadiusMaxLevel + extraRadiusLevels)) || (name === 'pickReach' && level >= C.pickReachMaxLevel + extraRadiusLevels) || ((name === 'pickDamage' || name === 'pickReach' || name === 'pickSpeed') && !s.pickUnlocked) || ((name === 'spearDamage' || name === 'spearReach' || name === 'spearSpeed') && !s.spearUnlocked) || (name === 'spearReach' && level >= C.spearReachMaxLevel + extraRadiusLevels) || ((name === 'rangedDamage' || name === 'emitterSpread' || name === 'emitterArea' || name === 'beamSpeed' || name === 'emitterSpeed') && !s.rangedUnlocked) || ((name === 'needleDamage' || name === 'needlePierce' || name === 'needleSpeed') && !s.needleUnlocked) || (name === 'needlePierce' && level >= C.needlePierceMaxLevel) || (name === 'emitterSpread' && level >= C.emitterSpreadMaxLevel) || (name === 'emitterArea' && level >= C.emitterAreaMaxLevel), level);
  }
  for (const [name, weapon, level] of [
    ['fistMastery', 'fist', s.fistLevel], ['pickMastery', 'pick', s.pickLevel], ['spearMastery', 'spear', s.spearLevel],
    ['needleMastery', 'needle', s.needleLevel], ['emitterMastery', 'emitter', s.rangedLevel],
  ] as const) {
    const cost = C.weaponMasteries[weapon].cost;
    setUpgrade(name, s.weaponMasteries[weapon] ? '✓' : `${cost} ◆`, s.weaponMasteries[weapon] || level < C.weaponMasteries[weapon].unlockLevel || s.ore < cost);
  }
  setUpgrade('ranged', s.rangedUnlocked ? '✓' : s.furthestBlock <= C.rangedUnlockBlock ? 'КВ. 15' : `${C.costs.ranged} ◆`, !s.needleUnlocked || s.rangedUnlocked || s.furthestBlock <= C.rangedUnlockBlock || s.ore < C.costs.ranged);
  setUpgrade('needle', s.needleUnlocked ? '✓' : `${C.costs.needle} ◆`, !s.auto || s.needleUnlocked || s.ore < C.costs.needle);
  setUpgrade('artifact', s.artifactUnlocked ? '\u2713' : s.furthestBlock <= C.artifactUnlockBlock ? 'КВ. 25' : `${C.costs.artifact} \u2726`, s.artifactUnlocked || s.furthestBlock <= C.artifactUnlockBlock || s.crystals < C.costs.artifact);
  setUpgrade('needleAlt', s.needleAltUnlocked ? '✓' : s.furthestBlock <= C.needleAltUnlockBlock ? 'КВ. 20' : `${C.costs.needleAlt} ✦`, !s.needleUnlocked || s.needleAltUnlocked || s.furthestBlock <= C.needleAltUnlockBlock || s.crystals < C.costs.needleAlt);
  setUpgrade('expansion', s.expansion >= C.maxExpansion ? 'МАКС' : !s.completions ? 'ПРОРЫВ' : `${C.costs.expansion} ⬡`, !s.completions || s.expansion >= C.maxExpansion || s.breakthrough < C.costs.expansion, s.expansion);
  $('#equip-fists').classList.toggle('active', s.weapon === 'fists');
  $<HTMLButtonElement>('#equip-fists').disabled = s.paused;
  $('#equip-pick').classList.toggle('active', s.weapon === 'pick');
  $<HTMLButtonElement>('#equip-pick').disabled = s.paused || !s.pickUnlocked;
  $('#equip-spear').classList.toggle('active', s.weapon === 'spear');
  $<HTMLButtonElement>('#equip-spear').disabled = s.paused || !s.spearUnlocked;
  $('#equip-bombarda').classList.toggle('hidden', !s.bombardaUnlocked);
  $('#equip-bombarda').classList.toggle('active', s.weapon === 'bombarda');
  $<HTMLButtonElement>('#equip-bombarda').disabled = s.paused || !s.bombardaUnlocked;
  const comboWeapon = s.weapon === 'ranged' || s.weapon === 'bombarda' ? 'fists' : s.weapon;
  const comboAvailable = s.weapon === 'fists' ? s.fistComboUnlocked || (s.challengeArena && s.challengeNumber === 2) : s.weapon === 'pick' || s.weapon === 'spear' ? s.challenge2Completed : false;
  $('#combo-toggle').classList.toggle('hidden', s.weapon === 'ranged' || s.weapon === 'bombarda');
  $('#combo-toggle').textContent = comboAvailable ? `Комбо (${C.comboAttackCount} ударов): ${s.combos[comboWeapon] ? 'ВКЛ' : 'ВЫКЛ'}` : comboWeapon === 'fists' ? 'Комбо: купите улучшение' : 'Комбо: после Challenge 2';
  $<HTMLButtonElement>('#combo-toggle').disabled = s.paused || !comboAvailable;
  $('#ranged-burst').textContent = s.challenge2Completed ? `Всплеск дальнего оружия: ${s.rangedBurstCharge.toFixed(0)} / ${C.rangedBurstMax} · нажмите для залпа` : 'Всплеск дальнего оружия · после Challenge 2';
  $<HTMLButtonElement>('#ranged-burst').disabled = s.paused || !s.challenge2Completed || s.rangedBurstCharge < 1 || (!s.needleUnlocked && !s.rangedUnlocked);
  $('#equip-emitter').classList.toggle('active', s.rangedWeapon === 'emitter');
  $('#equip-needle').classList.toggle('active', s.rangedWeapon === 'needle');
  $<HTMLButtonElement>('#equip-emitter').disabled = s.paused || !s.rangedUnlocked;
  $<HTMLButtonElement>('#equip-needle').disabled = s.paused || !s.needleUnlocked;
  document.querySelectorAll<HTMLElement>('[data-weapon]').forEach(button => {
    const weapon = button.dataset.weapon;
    const selected = weapon === s.weapon || (weapon === s.rangedWeapon && (s.rangedUnlocked || s.needleUnlocked));
    const mastery = button.dataset.upgrade?.replace('Mastery', '').toLowerCase() as keyof typeof s.weaponMasteries | undefined;
    const masteryOwned = !!mastery && s.weaponMasteries[mastery];
    const maxed = masteryOwned || (button.dataset.upgrade === 'fistComboRadius' && s.fistComboRadiusLevel >= C.comboFistRadiusMaxLevel + (s.cycleUpgrades.cycle3 ? 2 : 0)) || (button.dataset.upgrade === 'needlePierce' && s.needlePierceLevel >= C.needlePierceMaxLevel) || (button.dataset.upgrade === 'emitterSpread' && s.emitterSpreadLevel >= C.emitterSpreadMaxLevel) || (button.dataset.upgrade === 'emitterArea' && s.emitterAreaLevel >= C.emitterAreaMaxLevel);
    button.classList.toggle('hidden', !selected || maxed);
  });
  for (const [name, acquired] of [['auto', s.auto], ['pick', s.pickUnlocked], ['penetration', !!s.penetration], ['ranged', s.rangedUnlocked], ['needle', s.needleUnlocked], ['needleAlt', s.needleAltUnlocked], ['artifact', s.artifactUnlocked]] as const) {
    upgrade(name).classList.toggle('hidden', acquired);
  }
  upgrade('spear').classList.toggle('hidden', s.spearUnlocked);
  upgrade('fistCombo').classList.toggle('hidden', s.weapon !== 'fists' || s.fistComboUnlocked);
  upgrade('spearPierce').classList.toggle('hidden', s.weapon !== 'spear' || s.spearPierce);
  upgrade('spearEnchant').classList.toggle('hidden', s.weapon !== 'spear' || !s.challenge1Completed || s.spearEnchant);
  upgrade('fistUnique').classList.toggle('hidden', s.weapon !== 'fists' || !s.challenge1Completed || s.fistUniqueUpgrade);
  upgrade('pickInfinity').classList.toggle('hidden', s.weapon !== 'pick' || !s.challenge1Completed || s.pickInfinityEnchant);
  upgrade('emitterPierce').classList.toggle('hidden', s.rangedWeapon !== 'emitter' || !s.challenge1Completed || s.emitterPierceUpgrade);
  upgrade('needleFire').classList.toggle('hidden', s.rangedWeapon !== 'needle' || !breachGame.alchemyNodeUnlocked('fire') || s.needleFireUpgrade);
  const extraRadiusLevels = s.cycleUpgrades.cycle3 ? 2 : 0;
  upgrade('spearReach').classList.toggle('hidden', s.weapon !== 'spear' || s.spearReachLevel >= C.spearReachMaxLevel + extraRadiusLevels);
  upgrade('pickReach').classList.toggle('hidden', s.weapon !== 'pick' || s.pickReachLevel >= C.pickReachMaxLevel + extraRadiusLevels);
  for (const name of ['fistMastery', 'pickMastery', 'spearMastery', 'needleMastery', 'emitterMastery']) {
    const weapon = MASTERY_UI_WEAPON[name as keyof typeof MASTERY_UI_WEAPON];
    const level = weapon === 'fist' ? s.fistLevel : weapon === 'pick' ? s.pickLevel : weapon === 'spear' ? s.spearLevel : weapon === 'needle' ? s.needleLevel : s.rangedLevel;
    const selected = weapon === 'fist' ? s.weapon === 'fists' : weapon === 'pick' || weapon === 'spear' ? s.weapon === weapon : s.rangedWeapon === weapon;
    const unlocked = level >= C.weaponMasteries[weapon].unlockLevel && !s.weaponMasteries[weapon];
    upgrade(name).classList.toggle('hidden', !selected || !unlocked);
    upgrade(name).classList.toggle('new-feature', selected && unlocked && !s.seenFeatures[name]);
  }
  for (const name of ['auto', 'pick', 'spear', 'needle', 'ranged', 'fistCombo', 'needleAlt', 'artifact', 'spearPierce', 'spearEnchant', 'spatialCompressor', 'fistUnique', 'pickInfinity', 'emitterPierce', 'needleFire']) {
    const button = upgrade(name);
    const opened = name === 'pick' ? s.furthestBlock > C.pickUnlockBlock : name === 'spear' ? s.furthestBlock > C.spearUnlockBlock : name === 'ranged' ? s.furthestBlock > C.rangedUnlockBlock && s.needleUnlocked : name === 'spatialCompressor' ? s.furthestBlock > C.spatialCompressorUnlockBlock : name === 'needleAlt' ? s.furthestBlock > C.needleAltUnlockBlock && s.needleUnlocked : name === 'artifact' ? s.furthestBlock > C.artifactUnlockBlock : name === 'needleFire' ? breachGame.alchemyNodeUnlocked('fire') : ['spearEnchant', 'fistUnique', 'pickInfinity', 'emitterPierce'].includes(name) ? s.challenge1Completed : !button.disabled;
    button.classList.toggle('new-feature', opened && !button.classList.contains('hidden') && !s.seenFeatures[name]);
  }
  for (const definition of ALCHEMY_UPGRADES) {
    const button = $<HTMLButtonElement>(`[data-alchemy-upgrade="${definition.id}"]`);
    button.classList.toggle('new-feature', !button.disabled && !s.seenFeatures[`alchemy:${definition.id}`]);
  }
  renderChallengeModal();
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
$('#equip-bombarda').addEventListener('click', () => { breachGame.equip('bombarda'); breachGame.save(); render(); });
$('#combo-toggle').addEventListener('click', () => { const weapon = s.weapon; if ((weapon === 'fists' || weapon === 'pick' || weapon === 'spear') && (weapon === 'fists' ? s.fistComboUnlocked || (s.challengeArena && s.challengeNumber === 2) : s.challenge2Completed)) { s.combos[weapon] = !s.combos[weapon]; breachGame.save(); render(); } });
$('.alchemy-help').addEventListener('toggle', () => { if (($('.alchemy-help') as HTMLDetailsElement).open && !s.alchemyHelpSeen) { s.alchemyHelpSeen = true; breachGame.save(); render(); } });
$('#equip-emitter').addEventListener('click', () => { breachGame.equipRanged('emitter'); breachGame.save(); render(); });
$('#equip-needle').addEventListener('click', () => { breachGame.equipRanged('needle'); breachGame.save(); render(); });
$('#challenge-1').addEventListener('click', () => openChallengeDetails(1));
$('#challenge-2').addEventListener('click', () => openChallengeDetails(2));
$('#challenge-3').addEventListener('click', () => openChallengeDetails(3));
$('#challenge-4').addEventListener('click', () => openChallengeDetails(4));
$('#challenge-4-stone').addEventListener('click', () => { if (breachGame.buyChallenge4Modifier('stone')) breachGame.save(); render(); });
$('#challenge-4-damage').addEventListener('click', () => { if (breachGame.buyChallenge4Modifier('damage')) breachGame.save(); render(); });
$('#challenge-4-range').addEventListener('click', () => { if (breachGame.buyChallenge4Modifier('range')) breachGame.save(); render(); });
$('#challenge-modal-close').addEventListener('click', () => { selectedChallenge = null; render(); });
$('#challenge-modal').addEventListener('click', (event) => { if (event.target === $('#challenge-modal')) { selectedChallenge = null; render(); } });
$('#challenge-modal-action').addEventListener('click', () => {
  if (s.challengeArena && s.challengeNumber === selectedChallenge) breachGame.leaveChallenge1();
  else if (selectedChallenge === 1) breachGame.enterChallenge1();
  else if (selectedChallenge === 2) breachGame.enterChallenge2();
  else if (selectedChallenge === 3) breachGame.enterChallenge3();
  else if (selectedChallenge === 4) breachGame.enterChallenge4();
  selectedChallenge = null;
  breachGame.save(); render();
});
$('#ranged-burst').addEventListener('click', () => { if (breachGame.fireRangedBurst()) breachGame.save(); render(); });

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
