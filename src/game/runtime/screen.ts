import { alchemyItems, cycleUpgradeItems, equipment, FrameworkGame, getRun, masteryItems, uniqueItems, upgradeItems } from './game';
import { stonePaletteForLayer } from '../animation/palettes';

export type AlchemyNodeId = 'earth' | 'water' | 'air' | 'fire';
export const challengeDescriptions = [
  '', 'Очистите поле 50×50 за 60 секунд. Награда — Воздух и уникальные улучшения.',
  'Очистите поле 20×20 за 30 секунд. Награда — комбо вооружения.',
  'Получите 10 000 элементального камня за 120 секунд; порода восстанавливается. Награда — Огонь.',
  'Пройдите 50 карт стандартного размера. На первых 49 слоях порода восстанавливается и имеет ×3 прочность. Последний слой не регенерирует. Сжиматель может переносить через почти очищенные слои. Награда — Бомбарда и ???.',
];
const labels: Record<string, string> = { ore: 'Руда', crystals: 'Кристаллы', breakthrough: 'Прорыв', stone: 'Камень', elementalStone: 'Элементальный камень', earth: 'Земля', water: 'Вода', air: 'Воздух', fire: 'Огонь' };
const icon: Record<string, string> = { fists: '✊', pick: '⛏', spear: '⚔', bombarda: '◉', needle: '➶', emitter: '⌁', damage: '✦', speed: '↗', radius: '◎', elemental: '✧', penetration: '◇', movement: '➜', artifact: '✺' };
const format = (n: number) => Math.floor(n).toLocaleString('ru-RU');
const formatFraction = (n: number) => Number.isInteger(n) ? format(n) : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const byId = (id: string) => document.getElementById(id)!;
function tile(action: string, value: string, symbol: string, name: string, description: string, cost: string, disabled: boolean, extraClass = ''): string {
  return `<button class="upgrade${extraClass ? ` ${extraClass}` : ''}" data-action="${action}" data-value="${value}" aria-label="${name}: ${description}" ${disabled ? 'disabled' : ''}><span class="upgrade-icon">${symbol}</span><span class="upgrade-copy"><strong>${name}</strong><small>${description}</small></span><span class="price">${cost}</span></button>`;
}

/** Обновляет DOM только при изменении данных, чтобы не сбрасывать наведение и фокус. */
export function createScreenRenderer(game: FrameworkGame): (selected: AlchemyNodeId) => void {
  const lastHtml = new Map<string, string>();
  const html = (id: string, value: string) => { if (lastHtml.get(id) !== value) { byId(id).innerHTML = value; lastHtml.set(id, value); } };
  return selectedAlchemy => {
    const s = game.bus.read(), run = getRun(s), actor = s.characters.main, map = Object.values(s.maps)[0];
    if (!actor || !map) return;
    byId('layer').textContent = `${String(run.layer + 1).padStart(2, '0')} / ${game.config.world.layers}`;
    byId('remaining').textContent = format(Object.keys(s.tiles).length);
    byId('message').textContent = `${run.message}${run.boss ? ` · Босс: ${Math.ceil(run.boss)} с` : ''}${run.boundary !== null ? ` · Граница: ${Math.ceil(run.boundary)} с` : ''}${run.challengeTime ? ` · ${Math.ceil(run.challengeTime)} с` : ''}${run.endChargeRemaining > 0 ? ` · Зарядка: ${Math.ceil(run.endChargeRemaining)} с` : ''}`;
    byId('paused').classList.toggle('hidden', !s.paused);
    byId('pause').textContent = s.paused ? '▶' : 'Ⅱ';
    byId('debug-grant').toggleAttribute('disabled', s.paused);
    byId('mine').classList.toggle('buffering', run.clicks > 0.05);
    const palette = stonePaletteForLayer(map.layer, game.config);
    for (const kind of ['stone', 'hard', 'elemental'] as const) {
      const swatch = document.querySelector<HTMLElement>(`[data-stone-kind="${kind}"]`);
      if (swatch) swatch.style.backgroundColor = palette[kind];
    }
    byId('pause').setAttribute('aria-label', s.paused ? 'Продолжить' : 'Пауза');
    byId('progress').style.width = `${Math.max(0, Math.min(100, 100 * (1 - Object.keys(s.tiles).length / (map.width * map.height))))}%`;
    html('resources', ['ore', 'crystals', 'breakthrough'].map((id, i) => `<div class="resource"><span class="resource-icon ${['ore', 'crystal', 'point'][i]}">${['◆', '✦', '⬡'][i]}</span><span><small>${labels[id].toUpperCase()}</small><strong>${format(s.resources[id].amount)}</strong></span></div>`).join(''));
    const upgradeTile = (item: typeof upgradeItems[number]) => {
      const level = s.upgradeLevels[item.id] ?? 0, price = game.upgradeCost(item.id)?.ore ?? 0;
      const suffix = item.id.split('.').at(-1) ?? item.id;
      const radiusWeapon = item.id.endsWith('.radius') ? item.id.slice(0, -'.radius'.length) : '';
      const preCycleCap: Record<string, number> = { fists: 5, pick: 4, spear: 4, bombarda: 4 };
      const cycle3 = game.bus.query('upgrades', { type: 'status', payload: 'cycle.3' }) as { active?: boolean } | undefined;
      const capLocked = preCycleCap[radiusWeapon] !== undefined && level >= preCycleCap[radiusWeapon] && !cycle3?.active;
      const effectiveCap = radiusWeapon && preCycleCap[radiusWeapon] !== undefined ? preCycleCap[radiusWeapon] + (cycle3?.active ? 2 : 0) : ('maxLevel' in item && typeof item.maxLevel === 'number' ? item.maxLevel : Infinity);
      const atCap = level >= effectiveCap;
      const radius = radiusWeapon ? game.config.weapons[radiusWeapon].area.radius + level + (radiusWeapon === 'bombarda' && cycle3?.active ? 2 : 0) : 0;
      const radiusDescription = radiusWeapon === 'pick' || radiusWeapon === 'spear' || radiusWeapon === 'bombarda' ? ' Стандартный предел — 4 уровня; цикл 3 открывает ещё 2.' : '';
      const description = radiusWeapon ? `Радиус ${radius} клетки: база ${game.config.weapons[radiusWeapon].area.radius} + ${level} улучшений.${radiusWeapon === 'pick' ? ' Дальность взаимодействия +0,1 за уровень.' : radiusWeapon === 'spear' ? ` Дальность атаки ${game.config.weapons.spear.interactionRange + level * 0.15} клетки: база 1,5 + 0,15 за уровень.` : ''}${radiusDescription}`
        : item.id === 'pick.damage' ? '+1 урон за уровень; мастерство после 3 уровней даёт ×1,25.'
        : item.id === 'pick.speed' ? 'Скорость атаки +0,25 за уровень; степенная кривая 0,8 сдерживает разгон.'
        : item.id === 'spear.speed' ? 'Скорость атаки +0,2 за уровень; степенная кривая 0,8.' : item.description;
      return tile('upgrade', item.id, icon[suffix] ?? icon[item.id] ?? '✦', `${item.name} · ${level}`, description, atCap ? 'МАКС.' : `${format(price)} ◆`, s.paused || capLocked || atCap || s.resources.ore.amount < price);
    };
    const unlocks = equipment.filter(item => item.id !== 'fists' && !run.unlocked[item.id] && run.furthest >= Math.max(0, item.layer - 10) && (item.id !== 'bombarda' || run.challengeDone['4'])).map(item => {
      const available = run.furthest >= item.layer && s.resources.ore.amount >= item.cost && (item.id !== 'spear' || s.resources.crystals.amount >= 5);
      const desc = run.furthest < item.layer ? `Открывается через ${item.layer - run.furthest} квадратов. Покупка сразу выбирает оружие.` : 'Открыто для покупки. Покупка сразу выбирает оружие.';
      return tile('equip', item.id, icon[item.id], item.name, desc, `${format(item.cost)} ◆${item.id === 'spear' ? ' + 5 ✦' : ''}`, s.paused || !available);
    }).join('');
    const general = upgradeItems.filter(item => item.id === 'movement.speed' || item.id === 'penetration').map(upgradeTile).join('');
    const artifact = run.unlocked.artifact || run.furthest < Math.max(0, 25 - 10) ? '' : tile('artifact', '', icon.artifact, 'Эхо пустоты', 'Откроется после 25-го квадрата. Наносит слабый урон камням; изолированные камни получают больше урона.', '5 ✦', s.paused || run.furthest < 25 || s.resources.crystals.amount < 5);
    const compressorPreview = Math.max(0, game.config.world.compressorUnlockLayer - 10);
    const compressor = run.furthest < compressorPreview || s.upgradeLevels['spatial.compressor'] ? '' : tile('upgrade', 'spatial.compressor', '⦿', 'Пространственный сжиматель', `Откроется после ${game.config.world.compressorUnlockLayer}-го квадрата. Переносит дальше, когда осталось не более 5% камней.`, `${format(game.config.world.compressorCost)} ◆`, s.paused || (!!run.challenge && run.challenge !== 4) || run.furthest < game.config.world.compressorUnlockLayer || s.resources.ore.amount < game.config.world.compressorCost);
    const spectrumApproach = run.challengeDone['4'] && !s.upgradeLevels['spectrum.approach']
      ? tile('upgrade', 'spectrum.approach', '⁇', 'Подход теоремы Спектра', 'Открывает два улучшения бесконечности.', '1000 ◆ · 1000 каждого элемента', s.paused || ['crystals', 'earth', 'water', 'air', 'fire'].some(id => s.resources[id].amount < 1000))
      : '';
    const infinity = s.upgradeLevels['spectrum.approach'] ? [
      ['infinity.breakthrough', 'Множитель очков прорыва', 'Удваивает очки прорыва за цикл.'],
      ['infinity.space-folding', 'Складывание пространства', 'Камни получают ×2 здоровья за уровень, а зачистка проходит на одну карту дальше; уровень I = 2 карты. Максимум IV.'],
    ].map(([id, name, description]) => {
      const level = s.upgradeLevels[id] ?? 0, cost = game.upgradeCost(id)?.breakthrough ?? 0, maxed = id === 'infinity.space-folding' && level >= 4;
      return tile('upgrade', id, id.endsWith('folding') ? '⦿' : '⬡', `${name} · ${level}`, description, maxed ? 'МАКС.' : `${format(cost)} ⬡`, s.paused || maxed || s.resources.breakthrough.amount < cost);
    }).join('') : '';
    const mystery = run.challengeDone['4'] ? `<div class="challenge-card unlocked"><strong>???</strong></div>` : '';
    const fireReactionUnlocks = run.challengeDone['3'] ? (['vulcanization', 'decomposition'] as const).map(kind => {
      const id = `alchemy.${kind}-unlock`, level = s.upgradeLevels[id] ?? 0;
      const cost = game.upgradeCost(id) ?? {};
      const title = kind === 'vulcanization' ? 'Вулканизация' : 'Разложение элементов';
      const costText = `${format(cost.ore ?? 0)} руды + ${format(cost.water ?? 0)} Воды`;
      const canAfford = s.resources.ore.amount >= (cost.ore ?? 0) && s.resources.water.amount >= (cost.water ?? 0);
      return level ? '' : tile('upgrade', id, '♨', `Открыть ${title}`, 'После покупки переключатель появится на странице Огня.', costText, s.paused || !canAfford);
    }).join('') : '';
    html('general-upgrades', unlocks + general + fireReactionUnlocks + artifact + compressor + spectrumApproach + infinity + mystery);
    for (const kind of ['melee', 'ranged'] as const) {
      html(kind, equipment.filter(item => item.kind === kind && run.unlocked[item.id]).map(item => {
        const active = kind === 'melee' ? actor.controlledWeapon === item.id : actor.autonomousWeapons.includes(item.id);
        return `<button class="equipment-button${active ? ' active' : ''}" data-action="equip" data-value="${item.id}" ${s.paused ? 'disabled' : ''}>${icon[item.id]} ${item.name}</button>`;
      }).join(''));
      const ids = kind === 'melee' ? [actor.controlledWeapon] : actor.autonomousWeapons;
      const repeatables = upgradeItems.filter(item => ids.includes(item.id.split('.')[0])).map(upgradeTile).join('');
      const fistCombo = kind === 'melee' && actor.controlledWeapon === 'fists' && !(s.upgradeLevels['fists.combo'] ?? 0)
        ? tile('upgrade', 'fists.combo', '✦', 'Ударная связка кулаков', 'Открывает и сразу включает комбо кулаков.', '50 руды', s.paused || s.resources.ore.amount < 50)
        : '';
      const fistSplash = kind === 'melee' && actor.controlledWeapon === 'fists' && (s.upgradeLevels['fists.radius'] ?? 0) >= 1 && !(s.upgradeLevels['fists.splash'] ?? 0)
        ? tile('upgrade', 'fists.splash', '◉', 'Ударная волна', 'Обычные удары задевают соседние камни в радиусе 1 клетки. Урон сплеша плавно снижается к краю, до 35% от исходного.', '500 руды', s.paused || s.resources.ore.amount < 500)
        : '';
      const uniques = uniqueItems.filter(item => ids.includes(item.id.split('.')[0]) && !s.upgradeLevels[item.id] && run.challengeDone['1']).map(item =>
        tile('upgrade', item.id, '✧', item.name, item.id === 'spear.elemental' ? 'Частично пробивает элементальную породу и добавляет ударную полосу вдоль комбо-рывка копья.' : 'Частично пробивает элементальную породу.', `${format(item.cost)} ${labels[item.resource]}`, s.paused || s.resources[item.resource].amount < item.cost, 'challenge-reward')).join('');
      const bombardaElemental = ids.includes('bombarda') && run.challengeDone['1'] && !(s.upgradeLevels['bombarda.elemental'] ?? 0)
        ? tile('upgrade', 'bombarda.elemental', '✧', 'Elemental ricochet', 'After impact, ricochet toward the densest rock cluster for 40% damage; speed scales with attack speed.', '5 кристаллов + 5 000 Земли', s.paused || s.resources.crystals.amount < 5 || s.resources.earth.amount < 5000, 'challenge-reward')
        : '';      const mastery = masteryItems.filter(item => ids.includes(item.weapon) && !s.upgradeLevels[item.id]).map(item => {
        const level = s.upgradeLevels['pick.damage'] ?? 0;
        return tile('upgrade', item.id, '✦', item.name, item.description, `${format(item.cost)} ◆`, s.paused || level < item.requiredDamageLevel || s.resources.ore.amount < item.cost);
      }).join('');
      html(`${kind}-upgrades`, fistCombo + repeatables + fistSplash + mastery + uniques + bombardaElemental);
    }
    byId('ranged-section').classList.toggle('hidden', run.challenge === 2 || (!run.unlocked.needle && !run.unlocked.emitter));
    const combo = actor.controlledWeapon ? actor.weaponStates[actor.controlledWeapon]?.comboEnabled : false;
    const comboAvailable = actor.controlledWeapon === 'fists' ? (s.upgradeLevels['fists.combo'] ?? 0) > 0 : !!run.challengeDone['2'];
    html('combo', `<button class="equipment-button${combo ? ' active' : ''}" data-action="combo" ${s.paused || !comboAvailable ? 'disabled' : ''}>Комбо: ${combo ? 'включено' : 'выключено'}</button>`);
    byId('tab-alchemy').classList.toggle('unlocked', run.furthest >= Math.max(0, 20 - 10));
    byId('quick-alchemy').classList.toggle('hidden', run.furthest < 20);
    byId('quick-resources').textContent = `Камень: ${formatFraction(s.resources.stone.amount)} → Земля: ${formatFraction(s.resources.earth.amount)} · Вода: ${formatFraction(s.resources.water.amount)} · Воздух: ${formatFraction(s.resources.air.amount)} · Огонь: ${formatFraction(s.resources.fire.amount)}`;
    const earthEnabled = !!(s.moduleData['alchemy.earth'] as { enabled?: boolean } | undefined)?.enabled;
    const waterEnabled = !!(s.moduleData['alchemy.water'] as { enabled?: boolean } | undefined)?.enabled;
    const airEnabled = !!(s.moduleData['alchemy.air'] as { enabled?: boolean } | undefined)?.enabled;
    const overload = game.config.alchemy.buffs, overloadCost = { earth: 0, water: 0 };
    const overloadPurchased = (s.upgradeLevels['alchemy.earth-overload'] ?? 0) > 0;
    const overloadAvailable = !s.paused && run.furthest >= 20 && overloadPurchased && !run.overloadUsed && s.resources.earth.amount > 0;
    const overloadPurchaseCost = overload.overloadUpgradeCost;
    const overloadPurchaseAvailable = !s.paused && run.furthest >= 20 && !!run.unlocked.water && s.resources.ore.amount >= (overloadPurchaseCost.ore ?? 0) && s.resources.water.amount >= (overloadPurchaseCost.water ?? 0);
    const syncOverloadButtons = (root: ParentNode) => root.querySelectorAll<HTMLButtonElement>('[data-action="earth-overload"]').forEach(button => {
      button.dataset.action = overloadPurchased ? 'earth-overload' : 'upgrade';
      button.dataset.value = overloadPurchased ? '' : 'alchemy.earth-overload';
      button.disabled = overloadPurchased ? !overloadAvailable : !overloadPurchaseAvailable;
      button.title = overloadPurchased
        ? `Активация расходует всю Землю (${formatFraction(s.resources.earth.amount)}); эффект действует ${Math.ceil(overload.overloadSeconds / 60)} минут.`
        : `Покупка: ${format(overloadPurchaseCost.ore ?? 0)} руды + ${format(overloadPurchaseCost.water ?? 0)} Воды. Требуется открыть Воду.`;
      button.textContent = overloadPurchased
        ? run.overloadRemaining > 0 ? `Перегрузка: ${Math.ceil(run.overloadRemaining / 60)} мин` : run.overloadUsed ? 'Перегрузка использована' : `Перегрузка земли · вся Земля (${formatFraction(s.resources.earth.amount)})`
        : `Открыть Перегрузку · ${format(overloadPurchaseCost.ore ?? 0)} руды + ${format(overloadPurchaseCost.water ?? 0)} Воды`;
    });
    const fireEnabled = !!(s.moduleData['alchemy.fire'] as { enabled?: boolean } | undefined)?.enabled;
    html('quick-controls', `<button class="small-button${earthEnabled ? ' active' : ''}" data-action="recipe" data-value="earth">Земля: ${earthEnabled ? 'вкл.' : 'выкл.'}</button><button class="small-button${waterEnabled ? ' active' : ''}" data-action="recipe" data-value="water">Вода: ${waterEnabled ? 'вкл.' : 'выкл.'}</button><button class="small-button${run.earthBuff ? ' active' : ''}" data-action="earth">Усиление: ${run.earthBuff ? 'вкл.' : 'выкл.'}</button>${run.challengeDone['1'] ? `<button class="small-button${airEnabled ? ' active' : ''}" data-action="recipe" data-value="air">Воздух: ${airEnabled ? 'вкл.' : 'выкл.'}</button><button class="small-button${run.elementalization ? ' active' : ''}" data-action="elementalization">Элементализация: ${run.elementalization ? 'вкл.' : 'выкл.'}</button>` : ''}${run.challengeDone['3'] ? `<button class="small-button${fireEnabled ? ' active' : ''}" data-action="recipe" data-value="fire">Огонь: ${fireEnabled ? 'вкл.' : 'выкл.'}</button>` : ''}<button class="small-button${run.overloadRemaining > 0 ? ' active' : ''}" data-action="earth-overload" ${overloadAvailable ? '' : 'disabled'} title="За ${format(overloadCost.earth)} Земли и ${format(overloadCost.water)} Воды на ${Math.ceil(overload.overloadSeconds / 60)} минут каждый второй камень даёт элементальный камень.">${run.overloadRemaining > 0 ? `Перегрузка: ${Math.ceil(run.overloadRemaining / 60)} мин` : run.overloadUsed ? 'Перегрузка использована' : 'Перегрузка земли'}</button>${run.challenge === 4 ? `<button class="small-button stimpack" data-action="stimpack" ${s.paused || s.resources.fire.amount < 10 || s.resources.air.amount < 100 ? 'disabled' : ''}>Стимпакет · 10 Огня + 100 Воздуха + вся Земля и Вода${run.stimpackRemaining > 0 ? ` · ${run.stimpackRemaining.toFixed(1)} с` : ' · ×1,5 на 10 с'}</button>` : ''}`);
    syncOverloadButtons(byId('quick-controls'));
    byId('quick-controls').querySelectorAll<HTMLButtonElement>('[data-action="recipe"]').forEach(button => { if (game.config.alchemy.recipes[button.dataset.value ?? '']?.passive) button.remove(); });
    byId('cycle-section').classList.toggle('hidden', run.completions < 1);
    byId('cycle-points').textContent = `${format(s.resources.breakthrough.amount)} ⬡`;
    const cycles = [1, 2, 3, 4].map(group => `<section class="cycle-group"><h3>Группа ${group}</h3><div class="cycle-group-items">${cycleUpgradeItems.filter(item => item.group === group).map(item => {
      const level = s.upgradeLevels[item.id] ?? 0, price = item.cost, maxed = level >= 1;
      return `<button class="cycle-upgrade" data-action="upgrade" data-value="${item.id}" ${s.paused || maxed || !run.completions || s.resources.breakthrough.amount < price ? 'disabled' : ''}><strong>${item.name}${level ? ` · ${level}` : ''}</strong><small>${item.description}</small><span class="price">${maxed ? 'ПОЛУЧЕНО' : `${format(price)} ⬡`}</span></button>`;
    }).join('')}</div></section>`).join('');
    const expansionLevel = s.upgradeLevels['cycle.expansion'] ?? 0, expansionPrice = game.upgradeCost('cycle.expansion')?.breakthrough ?? 0;
    html('cycle', cycles + `<section class="cycle-expansion"><h3>Расширение карты</h3><button class="cycle-upgrade" data-action="upgrade" data-value="cycle.expansion" ${s.paused || !run.completions || expansionLevel >= 3 || s.resources.breakthrough.amount < expansionPrice ? 'disabled' : ''}><strong>Уровень ${expansionLevel} / 3</strong><small>Увеличивает сторону карты со следующего забега.</small><span class="price">${expansionLevel >= 3 ? 'ПОЛУЧЕНО' : `${format(expansionPrice)} ⬡`}</span></button></section>`);
    html('challenges', run.challenge ? `<button class="challenge-card unlocked" data-action="leave"><strong>Выйти из испытания ${run.challenge}</strong><span>Завершить попытку</span></button>` : [1, 2, 3, 4].map(id => {
      const unlock = [0, 35, 40, 45, 50][id], available = run.furthest >= unlock && (id !== 3 || !!run.challengeDone['1']);
      const title = ['','Перегрузка','Скоростной прорыв','Тепловой шифр','Теорема существования'][id];
      return `<button class="challenge-card${available ? ' unlocked' : ''}" data-action="challenge" data-value="${id}" ${available && !s.paused && run.endChargeRemaining <= 0 ? '' : 'disabled'}><strong>Challenge ${id} · ${title}</strong><span>${run.challengeDone[String(id)] ? 'Пройдено' : `После ${unlock}-го квадрата`}</span></button>`;
    }).join(''));
    const alchemyIds: AlchemyNodeId[] = ['earth', 'water', 'air', 'fire'];
    html('alchemy-nodes', alchemyIds.map((id, i) => {
      const available = id === 'earth' ? run.furthest >= 20 : id === 'water' ? !!run.unlocked.water : i === 2 ? !!run.challengeDone['1'] : !!run.challengeDone['3'];
      const status = available ? `${formatFraction(s.resources[id].amount)} / ${format(s.resources[id].capacity ?? 0)}`
        : id === 'water' ? (run.furthest >= 20 ? 'Открыть за руду и Землю' : 'После 20-го квадрата')
        : i < 2 ? 'После 20-го квадрата' : `Challenge ${i === 2 ? 1 : 3}`;
      return `<button class="alchemy-node ${id}${selectedAlchemy === id ? ' selected' : ''}${available ? '' : ' locked'}" data-action="alchemy-node" data-value="${id}"><span class="alchemy-symbol">${['◆', '◈', '≈', '✦'][i]}</span><strong>${labels[id]}</strong><small>${status}</small></button>`;
    }).join(''));
    byId('alchemy-title').textContent = labels[selectedAlchemy];
    byId('alchemy-description').textContent = ({ earth: 'Земля пассивно производится из алхимического Камня: добыча блоков даёт Камень, затем рецепт расходует его и превращает в Землю. Воздух для этого не нужен; производство доступно с 20-го слоя.', water: 'Вода производится из Земли и элементального камня. Кристаллизация стоит 100 Воды.', air: 'Воздух производится процентно от запаса Воды: 100 Воды дают около 1 Воздуха в секунду. Воздушный ускоритель за Огонь удваивает темп.', fire: 'Огонь производится процентно от запаса Воздуха: 100 Воздуха дают около 0,33 Огня в секунду. Его скорость можно улучшить после Подхода теоремы Спектра. Вулканизация и Разложение работают пассивно.' })[selectedAlchemy];
    html('alchemy-resources', ['stone', 'elementalStone', 'earth', 'water', 'air', 'fire'].map(id => `<span>${labels[id]} <b>${formatFraction(s.resources[id].amount)}${s.resources[id].capacity === null ? '' : ` / ${format(s.resources[id].capacity!)}`}</b></span>`).join(''));
    const recipe = s.moduleData[`alchemy.${selectedAlchemy}`] as { enabled?: boolean } | undefined;
    const available = selectedAlchemy === 'earth' ? run.furthest >= 20 : selectedAlchemy === 'water' ? !!run.unlocked.water : selectedAlchemy === 'air' ? !!run.challengeDone['1'] : !!run.challengeDone['3'];
    const waterUnlock = selectedAlchemy === 'water' && !run.unlocked.water && run.furthest >= 20
      ? `<button class="alchemy-action" data-action="unlock-water" ${s.paused || s.resources.ore.amount < game.config.alchemy.unlockCosts.water.ore || s.resources.earth.amount < game.config.alchemy.unlockCosts.water.earth ? 'disabled' : ''}>Открыть Воду · ${format(game.config.alchemy.unlockCosts.water.ore)} руды + ${format(game.config.alchemy.unlockCosts.water.earth)} Земли</button>` : '';
    const selectedRecipeConfig = game.config.alchemy.recipes[selectedAlchemy];
    const productionControl = selectedRecipeConfig.passive
      ? `<div class="alchemy-action passive-recipe">Производство эссенции работает автоматически после открытия.</div>`
      : `<button class="alchemy-action${recipe?.enabled ? ' active' : ''}" data-action="recipe" data-value="${selectedAlchemy}" ${s.paused || !available ? 'disabled' : ''}>Производство: ${recipe?.enabled ? 'включено' : 'выключено'}</button>`;
    let actions = `${waterUnlock}${productionControl}`;
    if (selectedAlchemy === 'earth') actions += `<button class="alchemy-action${run.earthBuff ? ' active' : ''}" data-action="earth" ${s.paused || !available ? 'disabled' : ''}>Усиление оружия: ${run.earthBuff ? 'включено' : 'выключено'}</button><button class="alchemy-action${run.overloadRemaining > 0 ? ' active' : ''}" data-action="earth-overload" ${overloadAvailable ? '' : 'disabled'}>${run.overloadRemaining > 0 ? `Перегрузка: ${Math.ceil(run.overloadRemaining / 60)} мин` : run.overloadUsed ? 'Перегрузка использована' : `Перегрузка · ${format(overloadCost.earth)} Земли + ${format(overloadCost.water)} Воды`}</button>`;
    if (selectedAlchemy === 'air') actions += `<button class="alchemy-action${run.elementalization ? ' active' : ''}" data-action="elementalization" ${s.paused || !available ? 'disabled' : ''}>Элементализация: ${run.elementalization ? 'включена' : 'выключена'} · ${game.config.alchemy.buffs.airPerSecond} Воздух/с</button>`;
    if (selectedAlchemy === 'fire') {
      const vulc = game.config.alchemy.recipes.vulcanization, decomp = game.config.alchemy.recipes.decomposition;
      const vulcUnlocked = (s.upgradeLevels['alchemy.vulcanization-unlock'] ?? 0) > 0;
      const decompUnlocked = (s.upgradeLevels['alchemy.decomposition-unlock'] ?? 0) > 0;
      const vulcEnabled = !!(s.moduleData['alchemy.vulcanization'] as { enabled?: boolean } | undefined)?.enabled;
      const decompEnabled = !!(s.moduleData['alchemy.decomposition'] as { enabled?: boolean } | undefined)?.enabled;
      if (vulcUnlocked) actions += `<button class="alchemy-action${vulcEnabled ? ' active' : ''}" data-action="recipe" data-value="vulcanization" ${s.paused || run.challenge === 4 ? 'disabled' : ''}>Вулканизация: ${vulcEnabled ? 'включена' : 'выключена'}</button>`;
      if (decompUnlocked) actions += `<button class="alchemy-action${decompEnabled ? ' active' : ''}" data-action="recipe" data-value="decomposition" ${s.paused ? 'disabled' : ''}>Разложение: ${decompEnabled ? 'включено' : 'выключено'}</button>`;
      const reaction = (config: typeof vulc, stock: number) => {
        const stockScale = config.speedSourceAmount ? Math.max(1, stock / config.speedSourceAmount) : 1;
        const recipeName = config.id.replace(/^alchemy\./, '');
        const speed = game.bus.query('upgrades', { type: 'stat', payload: { base: 1, keys: ['alchemy.productionSpeed', `alchemy.${recipeName}.productionSpeed`] } });
        const totalScale = stockScale * Math.max(1, typeof speed === 'number' && speed > 0 ? speed : 1);
        const minInterval = Math.max(0.001, Math.min(config.intervalSeconds, config.minimumIntervalSeconds ?? config.intervalSeconds));
        const maxSpeedup = config.intervalSeconds / minInterval;
        return { interval: config.intervalSeconds / Math.min(totalScale, maxSpeedup), batch: Math.max(1, totalScale / maxSpeedup) };
      };
      const v = reaction(vulc, s.resources.fire.amount), d = reaction(decomp, s.resources.elementalStone.amount);
      const vulcFire = v.batch * (vulc.inputsPerUnit.fire ?? 0), decompStone = d.batch * (decomp.inputsPerUnit.elementalStone ?? 0);
      if (vulcUnlocked) actions += `<div class="alchemy-action passive-recipe">Вулканизация ${vulcEnabled ? 'включена' : 'выключена'} · раз в ${formatFraction(v.interval)} с: расходует ${formatFraction(vulcFire)} Огня, ${formatFraction(v.batch * (vulc.inputsPerUnit.air ?? 0))} Воздуха и ${formatFraction(v.batch * (vulc.inputsPerUnit.water ?? 0))} Воды; производит ${formatFraction(v.batch * (vulc.outputsPerUnit.stone ?? 0))} камня и ${formatFraction(v.batch * (vulc.outputsPerUnit.elementalStone ?? 0))} элементального камня.</div>`;
      if (decompUnlocked) actions += `<div class="alchemy-action passive-recipe">Разложение ${decompEnabled ? 'включено' : 'выключено'} · раз в ${formatFraction(d.interval)} с: перерабатывает ${formatFraction(decompStone)} элементального камня в ${formatFraction(d.batch * (decomp.outputsPerUnit.stone ?? 0))} камня, ${formatFraction(d.batch * (decomp.outputsPerUnit.earth ?? 0))} Земли, ${formatFraction(d.batch * (decomp.outputsPerUnit.water ?? 0))} Воды, ${formatFraction(d.batch * (decomp.outputsPerUnit.air ?? 0))} Воздуха и ${formatFraction(d.batch * (decomp.outputsPerUnit.fire ?? 0))} Огня.</div>`;
    }
    if (selectedAlchemy === 'water') actions += `<button class="alchemy-action" data-action="crystal" ${s.paused || !available || s.resources.water.amount < 100 ? 'disabled' : ''}>Кристаллизация · 100 Воды → 1 кристалл</button>`;
    html('alchemy-buttons', actions);
    syncOverloadButtons(byId('alchemy-buttons'));
    const alchemyUpgrades = alchemyItems.filter(item => item.target === selectedAlchemy && !s.upgradeLevels[item.id] && run.furthest >= Math.max(0, 20 - 10)).map(item => {
      const available = run.furthest >= 20 && (item.id !== 'alchemy.water1' || !!run.unlocked.water) && (!item.id.startsWith('alchemy.air') && item.id !== 'alchemy.fire1' || !!run.challengeDone['3']);
      const requirement = run.furthest < 20 ? ' · после 20-го квадрата' : item.id === 'alchemy.water1' && !run.unlocked.water ? ' · сначала откройте Воду' : (!item.id.startsWith('alchemy.air') && item.id !== 'alchemy.fire1') || run.challengeDone['3'] ? '' : ' · после Challenge 3';
      return `<button class="alchemy-upgrade" data-action="upgrade" data-value="${item.id}" ${s.paused || !available || s.resources[item.resource].amount < item.cost ? 'disabled' : ''}>${item.name}${requirement} · ${format(item.cost)} ${labels[item.resource]}</button>`;
    }).join('');
    const fireSpeedLevel = s.upgradeLevels['alchemy.fire-speed'] ?? 0;
    const fireSpeedCost = game.upgradeCost('alchemy.fire-speed')?.fire ?? 0;
    const fireSpeedUpgrade = selectedAlchemy === 'fire' && s.upgradeLevels['spectrum.approach']
      ? `<button class="alchemy-upgrade" data-action="upgrade" data-value="alchemy.fire-speed" ${s.paused || fireSpeedLevel >= 10 || s.resources.fire.amount < fireSpeedCost ? 'disabled' : ''}>Ускоритель Огня · ${fireSpeedLevel}/10 · ×1,5 · ${format(fireSpeedCost)} Огня</button>` : '';
    html('alchemy-upgrades', alchemyUpgrades + fireSpeedUpgrade);
  };
}
