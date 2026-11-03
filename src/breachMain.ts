import './breach.css';
import { createGame } from './game/config';
import { breachGame, clearBreachSave, specialCrystalCost } from './game/breach';
import { BREACH_CONFIG as C } from './game/breachConfig';
import { BreachScene } from './game/BreachScene';

const app = document.getElementById('app') as HTMLElement;
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-icon">✳</span><div><strong>ПИОНЕР</strong><small>ПРОТОКОЛ ПРОРЫВА</small></div></div>
      <div class="top-actions"><span id="save-status">СОХРАНЕНО</span><button id="reset-progress" class="reset-button" title="Начать игру заново">Сбросить прогресс</button><button id="pause" class="icon-button" aria-label="Пауза" title="Пауза: P или Escape">Ⅱ</button></div>
    </header>
    <div class="layout">
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
          <div class="support-icon">◈</div><div class="support-copy"><span class="eyebrow">ВСПОМОГАТЕЛЬНЫЙ КОНТУР</span><h2>Сбор реагента</h2><p>Накапливается автоматически. Заряд включится при добыче элементальной руды.</p><div class="support-progress"><div id="reagent-progress"></div></div></div>
          <div class="support-action"><strong id="reagent-count">0 / 5</strong><button id="collect" class="small-button">Собрать</button><small id="charges">ЗАРЯДЫ: 0</small></div>
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
        <p id="upgrade-hint" class="upgrade-hint hidden">Повторяемые улучшения: очистите 50% карты.</p>
        <div class="upgrades">
          <button class="upgrade" data-upgrade="auto"><span class="upgrade-icon">⚙</span><span class="upgrade-copy"><strong>Сборщик</strong><small>Автоматически добывает камень и открывает оружие.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="pick"><span class="upgrade-icon">⛏</span><span class="upgrade-copy"><strong>Кремневая кирка</strong><small>Удар в секторе 210°.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="penetration"><span class="upgrade-icon">◇</span><span class="upgrade-copy"><strong>Пробиваемость</strong><small>Позволяет добывать твёрдую породу.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="click"><span class="upgrade-icon">✳</span><span class="upgrade-copy"><strong>Сила клика <b></b></strong><small>Каждое нажатие наносит больше урона.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="speed"><span class="upgrade-icon">↗</span><span class="upgrade-copy"><strong>Скорость атаки <b></b></strong><small>Увеличивает частоту атак и мощность лазера на 30% за уровень.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="movement"><span class="upgrade-icon">➜</span><span class="upgrade-copy"><strong>Скорость движения <b></b></strong><small>Увеличивает скорость передвижения на 25% за уровень.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="ranged"><span class="upgrade-icon">⌁</span><span class="upgrade-copy"><strong>Излучатель</strong><small>Непрерывный лазер повреждает задние камни по области.</small></span><span class="price"></span></button>
          <button class="upgrade" data-upgrade="needle"><span class="upgrade-icon">➶</span><span class="upgrade-copy"><strong>Игломёт</strong><small>Быстро стреляет по одному заднему камню.</small></span><span class="price"></span></button>
          <button class="upgrade advanced hidden" data-upgrade="needleAlt"><span class="upgrade-icon">⇉</span><span class="upgrade-copy"><strong>Автономный игломёт</strong><small>С 20-го квадрата: игломёт стреляет в фоне с 25% скорострельности, пока выбрано другое дальнее оружие.</small></span><span class="price"></span></button>
        </div>
        <section id="equipment" class="equipment hidden"><span class="eyebrow">БЛИЖНЕЕ ОРУЖИЕ</span><div><button id="equip-fists" class="equipment-button">✊ Кулаки</button><button id="equip-pick" class="equipment-button active">⛏ Кремневая кирка</button></div>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="fists" data-upgrade="melee"><span class="upgrade-icon">✊</span><span class="upgrade-copy"><strong>Сила кулаков <b></b></strong><small>Увеличивает урон кулаков.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="fists" data-upgrade="fistFinisher"><span class="upgrade-icon">✦</span><span class="upgrade-copy"><strong>Добивание <b></b></strong><small>Удары по камням с половиной прочности или меньше сильнее на 25% за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickDamage"><span class="upgrade-icon">⛏</span><span class="upgrade-copy"><strong>Мощность кирки <b></b></strong><small>Увеличивает урон кремневой кирки.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="pick" data-upgrade="pickReach"><span class="upgrade-icon">◔</span><span class="upgrade-copy"><strong>Размах <b></b></strong><small>Увеличивает радиус удара на 0,3 клетки и дистанцию атаки на 0,1 клетки за уровень.</small></span><span class="price"></span></button>
          </div></section>
        <section id="ranged-equipment" class="equipment hidden"><span class="eyebrow">ДАЛЬНЕЕ ОРУЖИЕ</span><div><button id="equip-needle" class="equipment-button">➶ Игломёт</button><button id="equip-emitter" class="equipment-button">⌁ Излучатель</button></div>
          <div class="upgrades weapon-upgrades">
            <button class="upgrade" data-weapon="needle" data-upgrade="needleDamage"><span class="upgrade-icon">➶</span><span class="upgrade-copy"><strong>Мощность игломёта <b></b></strong><small>Увеличивает урон игломёта.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="needle" data-upgrade="needlePierce"><span class="upgrade-icon">⇈</span><span class="upgrade-copy"><strong>Пробой <b></b></strong><small>Наносит следующему камню на пути 30% урона за уровень, максимум 100%.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="rangedDamage"><span class="upgrade-icon">⌁</span><span class="upgrade-copy"><strong>Мощность излучателя <b></b></strong><small>Увеличивает урон излучателя.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterSpread"><span class="upgrade-icon">✣</span><span class="upgrade-copy"><strong>Рассеивание <b></b></strong><small>Усиливает урон по краям луча; урон плавно уменьшается с расстоянием.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="emitterArea"><span class="upgrade-icon">◎</span><span class="upgrade-copy"><strong>Ширина луча <b></b></strong><small>Расширяет область лазера на одну клетку за уровень.</small></span><span class="price"></span></button>
            <button class="upgrade" data-weapon="emitter" data-upgrade="beamSpeed"><span class="upgrade-icon">➟</span><span class="upgrade-copy"><strong>Скорость луча <b></b></strong><small>Луч перемещается между целями на 25% быстрее за уровень.</small></span><span class="price"></span></button>
          </div></section>
        <div class="list-heading advanced hidden"><div><span class="eyebrow">НЕИЗВЕСТНЫЕ ТЕХНОЛОГИИ</span><h2>Артефакт</h2></div><span>✧</span></div>
        <div class="upgrades advanced hidden"><button class="upgrade" data-upgrade="artifact"><span class="upgrade-icon artifact">✺</span><span class="upgrade-copy"><strong>Эхо пустоты</strong><small>С 25-го квадрата: наносит урон в текущем и соседних квадратах, больше — изолированным камням.</small></span><span class="price"></span></button>
        <button class="upgrade" data-upgrade="expansion"><span class="upgrade-icon">▦</span><span class="upgrade-copy"><strong>Расширить блок <b></b></strong><small>Больше камней в каждом квадрате со следующей попытки.</small></span><span class="price"></span></button></div>
        <section class="challenge-section"><div class="list-heading"><div><span class="eyebrow">РЕЖИМЫ</span><h2>Испытания</h2></div><span>◇</span></div>
          <div id="challenge-1" class="challenge-card" aria-live="polite"><strong>Challenge 1</strong><span id="challenge-1-status"></span></div>
        </section>
        <footer>ПИОНЕР / PRE-INFINITY <span>✳</span></footer>
      </aside>
    </div>
  </div>`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const upgrade = (name: string) => $<HTMLButtonElement>(`[data-upgrade="${name}"]`);
const s = breachGame.state;
const game = createGame('game');
let lastTick = performance.now();
let saveTime = 0;
let resetRequested = false;

function setUpgrade(name: string, price: string, disabled: boolean, level?: number): void {
  const button = upgrade(name);
  (button.querySelector('.price') as HTMLElement).textContent = price;
  button.disabled = disabled || s.paused;
  const b = button.querySelector('b');
  if (b && level !== undefined) b.textContent = ` ${level}`;
  const copy = button.querySelector('.upgrade-copy');
  if (copy) button.setAttribute('aria-label', `${copy.textContent?.trim() ?? ''} ${price}`);
}

function render(): void {
  const done = s.tutorial === 'done';
  const currentStones = breachGame.currentStones().length;
  $('#block-label').innerHTML = `${String(s.block + 1).padStart(2, '0')} <em>/ ${C.blockCount}</em>`;
  $('#stones-label').textContent = String(currentStones).padStart(2, '0');
  $('#ore').textContent = String(Math.floor(s.ore));
  $('#crystals').textContent = String(s.crystals);
  $('#points').textContent = String(s.breakthrough);
  const challengeStatus = breachGame.challenge1Unlocked ? 'Открыто · скоро' : 'Откроется на 35-м квадрате';
  if ($('#challenge-1-status').textContent !== challengeStatus) $('#challenge-1-status').textContent = challengeStatus;
  $('#challenge-1').classList.toggle('unlocked', breachGame.challenge1Unlocked);
  $('#progress-fill').style.width = `${Math.min(100, s.block / C.blockCount * 100)}%`;
  $('#boundary-marker').classList.toggle('hidden', s.boundary === null);
  if (s.boundary !== null) $('#boundary-marker').style.left = `${Math.max(0, Math.min(100, s.boundary / (C.blockCount * s.size) * 100))}%`;
  $('#paused-overlay').classList.toggle('hidden', !s.paused);
  $('#gesture').classList.toggle('hidden', s.paused || s.tutorial !== 'click');
  $('#mine-hint').classList.toggle('hidden', !done);
  $('#pause').textContent = s.paused ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', s.paused ? 'Продолжить' : 'Пауза');
  $('#message').textContent = s.message || (s.buffRemaining > 0 ? `Элементальное усиление: ${Math.ceil(s.buffRemaining)} с` : '');
  $<HTMLButtonElement>('#mine').disabled = s.paused || s.tutorial === 'auto';
  document.querySelectorAll('.advanced').forEach((el) => el.classList.toggle('hidden', !s.auto));
  $('#resource-loop').classList.toggle('hidden', !done);
  $('#equipment').classList.toggle('hidden', !s.auto);
  $('#ranged-equipment').classList.toggle('hidden', !s.rangedUnlocked && !s.needleUnlocked);
  $('#upgrade-hint').classList.toggle('hidden', !s.auto || s.repeatablesUnlocked);
  $('#reagent-count').textContent = `${s.reagent} / ${C.reagentCapacity}`;
  $('#charges').textContent = `ЗАРЯДЫ: ${s.charges}`;
  $('#reagent-progress').style.width = `${s.reagent / C.reagentCapacity * 100}%`;
  $<HTMLButtonElement>('#collect').disabled = s.paused || !s.reagent;
  setUpgrade('auto', s.auto ? '✓' : `${C.costs.auto} ◆`, s.auto || s.tutorial !== 'auto' || s.ore < C.costs.auto);
  setUpgrade('pick', s.pickUnlocked ? '✓' : `${C.costs.pick} ◆`, !s.auto || s.pickUnlocked || s.ore < C.costs.pick);
  setUpgrade('penetration', s.penetration ? '✓' : `${C.costs.penetration} ◆`, !!s.penetration || !s.auto || s.ore < C.costs.penetration);
  upgrade('auto').classList.toggle('attention', s.tutorial === 'auto');
  upgrade('penetration').classList.toggle('attention', s.tutorial === 'penetration');
  for (const [name, level] of [['melee', s.fistLevel], ['pickDamage', s.pickLevel], ['click', s.clickLevel], ['speed', s.speedLevel], ['movement', s.movementLevel], ['rangedDamage', s.rangedLevel], ['needleDamage', s.needleLevel], ['fistFinisher', s.fistFinisherLevel], ['pickReach', s.pickReachLevel], ['needlePierce', s.needlePierceLevel], ['emitterSpread', s.emitterSpreadLevel], ['emitterArea', s.emitterAreaLevel], ['beamSpeed', s.beamSpeedLevel]] as const) {
    const cost = Math.ceil(8 * 1.55 ** level);
    const crystals = specialCrystalCost(name, level);
    setUpgrade(name, `${cost} ◆${crystals ? ` + ${crystals} ✦` : ''}`, !s.repeatablesUnlocked || s.ore < cost || s.crystals < crystals || ((name === 'pickDamage' || name === 'pickReach') && !s.pickUnlocked) || ((name === 'rangedDamage' || name === 'emitterSpread' || name === 'emitterArea' || name === 'beamSpeed') && !s.rangedUnlocked) || ((name === 'needleDamage' || name === 'needlePierce') && !s.needleUnlocked) || (name === 'needlePierce' && level >= C.needlePierceMaxLevel) || (name === 'emitterSpread' && level >= C.emitterSpreadMaxLevel) || (name === 'emitterArea' && level >= C.emitterAreaMaxLevel), level);
  }
  setUpgrade('ranged', s.rangedUnlocked ? '✓' : `${C.costs.ranged} ◆`, !s.needleUnlocked || s.rangedUnlocked || s.ore < C.costs.ranged);
  setUpgrade('needle', s.needleUnlocked ? '✓' : `${C.costs.needle} ◆`, !s.auto || s.needleUnlocked || s.ore < C.costs.needle);
  setUpgrade('artifact', s.artifactUnlocked ? '\u2713' : s.furthestBlock < C.artifactUnlockBlock ? 'КВ. 25' : `${C.costs.artifact} \u2726`, s.artifactUnlocked || s.furthestBlock < C.artifactUnlockBlock || s.crystals < C.costs.artifact);
  setUpgrade('needleAlt', s.needleAltUnlocked ? '✓' : s.furthestBlock < C.needleAltUnlockBlock ? 'КВ. 20' : `${C.costs.needleAlt} ✦`, !s.needleUnlocked || s.needleAltUnlocked || s.furthestBlock < C.needleAltUnlockBlock || s.crystals < C.costs.needleAlt);
  setUpgrade('expansion', s.expansion >= C.maxExpansion ? 'МАКС' : !s.completions ? 'ПРОРЫВ' : `${C.costs.expansion} ⬡`, !s.completions || s.expansion >= C.maxExpansion || s.breakthrough < C.costs.expansion, s.expansion);
  $('#equip-fists').classList.toggle('active', s.weapon === 'fists');
  $<HTMLButtonElement>('#equip-fists').disabled = s.paused;
  $('#equip-pick').classList.toggle('active', s.weapon === 'pick');
  $<HTMLButtonElement>('#equip-pick').disabled = s.paused || !s.pickUnlocked;
  $('#equip-emitter').classList.toggle('active', s.rangedWeapon === 'emitter');
  $('#equip-needle').classList.toggle('active', s.rangedWeapon === 'needle');
  $<HTMLButtonElement>('#equip-emitter').disabled = s.paused || !s.rangedUnlocked;
  $<HTMLButtonElement>('#equip-needle').disabled = s.paused || !s.needleUnlocked;
  document.querySelectorAll<HTMLElement>('[data-weapon]').forEach(button => {
    const weapon = button.dataset.weapon;
    const selected = weapon === s.weapon || (weapon === s.rangedWeapon && (s.rangedUnlocked || s.needleUnlocked));
    const maxed = (button.dataset.upgrade === 'needlePierce' && s.needlePierceLevel >= C.needlePierceMaxLevel) || (button.dataset.upgrade === 'emitterSpread' && s.emitterSpreadLevel >= C.emitterSpreadMaxLevel) || (button.dataset.upgrade === 'emitterArea' && s.emitterAreaLevel >= C.emitterAreaMaxLevel);
    button.classList.toggle('hidden', !selected || maxed);
  });
  for (const [name, acquired] of [['auto', s.auto], ['pick', s.pickUnlocked], ['penetration', !!s.penetration], ['ranged', s.rangedUnlocked], ['needle', s.needleUnlocked], ['needleAlt', s.needleAltUnlocked], ['artifact', s.artifactUnlocked]] as const) {
    upgrade(name).classList.toggle('hidden', acquired);
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.upgrade as Parameters<typeof breachGame.buy>[0];
    if (breachGame.buy(name)) breachGame.save();
    render();
  });
});
$('#mine').addEventListener('click', () => { breachGame.click(); render(); });
$('#collect').addEventListener('click', () => { breachGame.collect(); breachGame.save(); render(); });
$('#equip-fists').addEventListener('click', () => { breachGame.equip('fists'); breachGame.save(); render(); });
$('#equip-pick').addEventListener('click', () => { breachGame.equip('pick'); breachGame.save(); render(); });
$('#equip-emitter').addEventListener('click', () => { breachGame.equipRanged('emitter'); breachGame.save(); render(); });
$('#equip-needle').addEventListener('click', () => { breachGame.equipRanged('needle'); breachGame.save(); render(); });

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
