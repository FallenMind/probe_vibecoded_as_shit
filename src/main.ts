import './app.css';
import './framework.css';
import { FrameworkGame, SAVE_KEY } from './game/runtime/game';
import { challengeDescriptions, createScreenRenderer, type AlchemyNodeId } from './game/runtime/screen';
import { GameVisuals } from './game/animation/gameVisuals';
import { CanvasGameRenderer } from './game/animation/canvasVisuals';

const game = FrameworkGame.load();
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
<div class="shell">
  <header class="topbar"><div class="brand"><span class="brand-icon">✳</span><div><strong>ПИОНЕР</strong><small>ПРОТОКОЛ ПРОРЫВА</small></div></div><div class="top-actions"><span id="saved">СОХРАНЕНИЕ</span><button id="debug-grant" class="debug-button" data-action="debug" title="Временно: +10 000 руды и +10 кристаллов">DEBUG +10k / +10</button><button id="reset" class="reset-button">Сбросить прогресс</button><button id="pause" class="icon-button" aria-label="Пауза">Ⅱ</button></div></header>
  <nav class="game-tabs" aria-label="Разделы игры"><button id="tab-breach" class="game-tab active" data-action="tab" data-value="breach">Прорыв</button><button id="tab-alchemy" class="game-tab" data-action="tab" data-value="alchemy"><span class="alchemy-tab-icon">✧</span> Алхимия</button></nav>
  <div id="breach-view" class="layout"><main class="main-column"><div class="section-heading"><div><span class="eyebrow">АВТОНОМНАЯ ЭКСПЕДИЦИЯ</span><h1>Прорыв сквозь породу</h1></div><span class="live-badge"><i></i> СИГНАЛ АКТИВЕН</span></div>
    <section class="map-card"><div class="map-top"><div><span class="eyebrow">КВАДРАТ</span><strong id="layer">1 / 50</strong></div><div class="map-top-right"><span class="eyebrow">ОСТАЛОСЬ КАМНЕЙ</span><strong id="remaining">—</strong></div></div>
      <div class="map-wrap"><canvas id="field" width="620" height="640" aria-label="Карта добычи"></canvas><div id="paused" class="paused-overlay hidden">ПАУЗА <small>P / ESC</small></div></div>
      <div class="map-bottom"><div><span class="map-key"><i class="stone-key" data-stone-kind="stone"></i> ПОРОДА</span><span class="map-key"><i class="hard-key" data-stone-kind="hard"></i> ТВЁРДАЯ</span><span class="map-key"><i class="element-key" data-stone-kind="elemental"></i> ЭЛЕМЕНТ</span></div><button id="mine" class="mine-button">✦ &nbsp; УСКОРИТЬ</button></div><div class="progress-track"><div id="progress"></div></div></section>
    <div class="below-map"><span id="message"></span></div>
    <section id="quick-alchemy" class="support-card hidden"><div class="support-icon">◈</div><div class="support-copy"><span class="eyebrow">АЛХИМИЯ</span><h2>Быстрое управление</h2><p id="quick-resources"></p><div id="quick-controls" class="quick-controls"></div></div></section>
    <section id="cycle-section" class="cycle-shop hidden"><div class="cycle-heading"><div><span class="eyebrow">ПРЕОДОЛЕНИЕ ПРЕДЕЛА</span><h2>Улучшения цикла</h2><p>Постоянные усиления за очки прорыва.</p></div><strong id="cycle-points">0 ⬡</strong></div><div id="cycle" class="cycle-grid"></div></section>
  </main><aside class="sidebar"><div class="side-heading"><div><span class="eyebrow">ПАНЕЛЬ ЭКСПЕДИЦИИ</span><h2>Управление</h2></div><span class="side-mark">✳</span></div><div id="resources" class="resources"></div>
    <div class="list-heading"><div><span class="eyebrow">ИНСТРУМЕНТЫ И НАВЫКИ</span><h2>Улучшения</h2></div><span>↗</span></div><div id="general-upgrades" class="upgrades"></div>
    <section class="equipment"><span class="eyebrow">БЛИЖНЕЕ ОРУЖИЕ</span><div id="melee" class="weapon-select"></div><div id="combo" class="combo-wrap"></div><div id="melee-upgrades" class="upgrades weapon-upgrades"></div></section>
    <section id="ranged-section" class="equipment"><span class="eyebrow">ДАЛЬНЕЕ ОРУЖИЕ</span><div id="ranged" class="weapon-select"></div><div id="ranged-upgrades" class="upgrades weapon-upgrades"></div></section>
    <section class="challenge-section"><div class="list-heading"><div><span class="eyebrow">РЕЖИМЫ</span><h2>Испытания</h2></div><span>◇</span></div><div id="challenges" class="challenge-list"></div></section><footer>ПИОНЕР / PRE-INFINITY <span>✳</span></footer>
  </aside></div>
  <section id="alchemy-view" class="alchemy-view hidden"><div class="alchemy-heading"><span class="eyebrow">ВТОРОЙ КОНТУР</span><h1>Алхимия</h1><p>Рецепты продолжают работать, когда открыт прорыв.</p><details class="alchemy-help"><summary aria-label="Как работает алхимия">?</summary><div><strong>Как работает алхимия</strong><p>Камень превращается в Землю. Земля и элементальный камень превращаются в Воду; Вода — в Воздух; Воздух — в Огонь. Нажмите на стихию, затем включите её производство. После Challenge 3 Вулканизация и Разложение работают автоматически и расходуют имеющиеся запасы.</p></div></details></div>
    <div class="alchemy-layout"><div id="alchemy-nodes" class="alchemy-nodes"></div><div class="alchemy-details"><span class="eyebrow">СТИХИЯ</span><h2 id="alchemy-title"></h2><p id="alchemy-description"></p><div id="alchemy-resources" class="alchemy-resources"></div><div id="alchemy-buttons"></div><h3>Улучшения</h3><div id="alchemy-upgrades" class="alchemy-upgrades"></div></div></div>
  </section>
  <div id="challenge-modal" class="challenge-modal hidden"><section class="challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="challenge-title"><button id="challenge-close" class="challenge-close" aria-label="Закрыть">×</button><span class="eyebrow">ИСПЫТАНИЕ</span><h2 id="challenge-title"></h2><p id="challenge-description"></p><button id="challenge-start" class="challenge-action">Начать испытание</button></section></div>
</div>`;

const el = (id: string) => document.getElementById(id)!;
const canvas = el('field') as HTMLCanvasElement;
const visuals = new GameVisuals(game.bus, game.config);
const canvasRenderer = new CanvasGameRenderer(canvas, visuals);
let selectedAlchemy: AlchemyNodeId = 'earth';
let activeTab: 'breach' | 'alchemy' = 'breach';
let selectedChallenge: number | null = null;
const renderScreen = createScreenRenderer(game);
function render(): void {
  renderScreen(selectedAlchemy);
  el('breach-view').classList.toggle('hidden', activeTab !== 'breach');
  el('alchemy-view').classList.toggle('hidden', activeTab !== 'alchemy');
  el('tab-breach').classList.toggle('active', activeTab === 'breach');
  el('tab-alchemy').classList.toggle('active', activeTab === 'alchemy');
  el('challenge-modal').classList.toggle('hidden', selectedChallenge === null);
  if (selectedChallenge !== null) {
    el('challenge-title').textContent = `Challenge ${selectedChallenge}`;
    el('challenge-description').textContent = challengeDescriptions[selectedChallenge];
  }
}
function activateButton(target: HTMLButtonElement): void {
  if (target.disabled) return;
  const action = target.dataset.action, value = target.dataset.value ?? '';
  if (action === 'tab' && (value === 'breach' || value === 'alchemy')) activeTab = value;
  if (action === 'alchemy-node' && ['earth', 'water', 'air', 'fire'].includes(value)) selectedAlchemy = value as AlchemyNodeId;
  if (action === 'equip') game.equip(value);
  if (action === 'upgrade') game.buyUpgrade(value);
  if (action === 'debug') game.debugGrantResources();
  if (action === 'combo') game.toggleCombo();
  if (action === 'artifact') game.buyArtifact();
  if (action === 'recipe') game.toggleRecipe(value);
  if (action === 'unlock-water') game.unlockWater();
  if (action === 'earth') game.bus.invoke('gameplay', { type: 'earth-buff', payload: null });
  if (action === 'elementalization') game.bus.invoke('gameplay', { type: 'elementalization', payload: null });
  if (action === 'earth-overload') game.bus.invoke('gameplay', { type: 'earth-overload', payload: null });
  if (action === 'stimpack') game.bus.invoke('gameplay', { type: 'stimpack', payload: null });
  if (action === 'crystal') game.bus.invoke('alchemy.actions', { type: 'exchange', payload: 'crystallize' });
  if (action === 'challenge') selectedChallenge = Number(value);
  if (action === 'leave') game.leaveChallenge();
  if (target.id === 'challenge-close') selectedChallenge = null;
  if (target.id === 'challenge-start' && selectedChallenge !== null && game.enterChallenge(selectedChallenge)) selectedChallenge = null;
  if (target.id === 'mine') game.bus.invoke('gameplay', { type: 'click', payload: null });
  if (target.id === 'pause') game.bus.setPaused(!game.bus.read().paused);
  if (target.id === 'reset' && confirm('Сбросить сохранение нового режима?')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  render();
}
app.addEventListener('pointerdown', event => {
  const pointer = event as PointerEvent;
  if (pointer.button !== 0) return;
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (target && app.contains(target)) activateButton(target);
}, true);
app.addEventListener('click', event => {
  // Pointer input is handled on pointerdown so a live UI refresh can't detach the pressed button.
  if (event.detail !== 0) return;
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (target && app.contains(target)) activateButton(target);
});
canvas.addEventListener('pointerdown', () => game.bus.invoke('gameplay', { type: 'click', payload: null }));
window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.key === 'Escape' && selectedChallenge !== null) { selectedChallenge = null; render(); return; }
  if (event.key.toLowerCase() === 'p' || event.key === 'Escape') { game.bus.setPaused(!game.bus.read().paused); render(); }
});
let last = performance.now(), rendered = 0, saved = 0;
function frame(now: number): void {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
  game.advance(dt);
  visuals.tick(dt);
  if (now - rendered > 100) { render(); rendered = now; }
  if (activeTab === 'breach') canvasRenderer.draw(game.bus.read());
  if (now - saved > 5000) { el('saved').textContent = game.save() ? '● Сохранено' : '○ Нет сохранения'; saved = now; }
  requestAnimationFrame(frame);
}
render(); canvasRenderer.draw(game.bus.read()); requestAnimationFrame(frame);
