import type { DeepReadonly, GameState } from '../core/model';
import type { GameVisuals } from './gameVisuals';
import { stoneTextureNoise } from './stoneTexture';
import { stonePaletteForLayer } from './palettes';

const explosionFrames = 8;
const explosionFrameSize = 384;

/** Rasterize once, then blit a single sprite frame per gameplay frame. */
function createBombardaExplosionAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = explosionFrameSize * explosionFrames;
  atlas.height = explosionFrameSize;
  const ctx = atlas.getContext('2d');
  if (!ctx) return atlas;
  const unit = explosionFrameSize / 96;
  for (let frame = 0; frame < explosionFrames; frame++) {
    const t = frame / (explosionFrames - 1), cx = frame * explosionFrameSize + explosionFrameSize / 2;
    const cy = explosionFrameSize / 2, radius = (8 + t * 34) * unit, fade = 1 - t * 0.52;
    ctx.save(); ctx.globalAlpha = fade;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    core.addColorStop(0, 'rgba(255,246,211,.9)');
    core.addColorStop(0.25, 'rgba(255,196,112,.68)');
    core.addColorStop(0.68, 'rgba(235,101,48,.32)');
    core.addColorStop(1, 'rgba(192,69,37,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,220,164,${0.6 * (1 - t * 0.35)})`;
    ctx.lineWidth = (1.5 + (1 - t) * 1.5) * unit;
    ctx.beginPath(); ctx.arc(cx, cy, (5 + t * 32) * unit, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,171,98,${0.48 * (1 - t * 0.4)})`; ctx.lineWidth = 2 * unit;
    for (let ray = 0; ray < 8; ray++) {
      const angle = ray * Math.PI / 4 + 0.17;
      const inner = radius * 0.58, outer = radius * (0.76 + (ray % 3) * 0.055);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
    }
    for (let spark = 0; spark < 5; spark++) {
      const angle = spark * 2.4 + frame * 0.21, distance = radius * (0.55 + (spark % 2) * 0.22);
      ctx.fillStyle = `rgba(255,225,174,${0.55 * (1 - t * 0.45)})`;
      ctx.fillRect(cx + Math.cos(angle) * distance - unit, cy + Math.sin(angle) * distance - unit, 2.5 * unit, 2.5 * unit);
    }
    ctx.restore();
  }
  return atlas;
}

/** Canvas-адаптер визуального слоя; не изменяет игровое состояние. */
export class CanvasGameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrainCanvas = document.createElement('canvas');
  private readonly bombardaExplosionAtlas = createBombardaExplosionAtlas();
  private readonly pick = new Image();
  private readonly spear = new Image();
  private readonly noiseCache = new Map<string, number>();
  private cachedLayer = -1;
  private cachedTerrainKey = '';
  private cachedTerrainRevision = -1;
  private burningTiles: DeepReadonly<GameState['tiles'][string]>[] = [];
  constructor(private readonly canvas: HTMLCanvasElement, private readonly visuals: GameVisuals) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    this.ctx = ctx;
    this.pick.src = `${import.meta.env.BASE_URL}assets/flint-pickaxe.svg`;
    this.spear.src = `${import.meta.env.BASE_URL}assets/metal-spear.svg`;
  }

  draw(state: DeepReadonly<GameState>): void {
    const map = Object.values(state.maps)[0];
    if (!map) return;
    const ctx = this.ctx, width = this.canvas.width, height = this.canvas.height;
    const tile = Math.min((width - 70) / map.width, (height - 110) / (map.height + 1));
    const ox = (width - tile * map.width) / 2, oy = (height - tile * map.height) / 2;
    const px = (x: number) => ox + (x + 0.5) * tile, py = (y: number) => oy + (y + 0.5) * tile;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1b25'; ctx.fillRect(0, 0, width, height);
    if (this.cachedLayer !== map.layer) { this.cachedLayer = map.layer; this.noiseCache.clear(); }
    const reset = this.visuals.transition?.kind === 'reset' ? this.visuals.transition : null;
    const previous = reset?.snapshot ? new Map(reset.snapshot.tiles.map(stone => [`${stone.position.x}:${stone.position.y}`, stone])) : null;
    const wave = reset ? Math.min(1, reset.player.elapsedSeconds / reset.player.clip.durationSeconds) * Math.max(map.width, map.height) * 1.5 : Infinity;
    const terrainKey = `${map.id}:${map.layer}:${width}:${height}`;
    if (reset) {
      ctx.fillStyle = '#0b1b25'; ctx.fillRect(0, 0, width, height);
      this.paintTerrain(ctx, state, map, tile, ox, oy, px, py, stonePaletteForLayer(map.layer, this.visuals.config), previous, reset.snapshot?.origin, wave);
      this.paintDynamicTerrain(ctx, state, map, tile, ox, oy, px, py, Object.values(state.tiles).filter(stone => stone.mapId === map.id && stone.tags.includes('burning')));
    } else {
      const sameTerrain = this.cachedTerrainKey === terrainKey;
      const fullRedraw = !sameTerrain || this.visuals.terrainFullyDirty;
      if (fullRedraw) {
        this.terrainCanvas.width = width; this.terrainCanvas.height = height;
        const terrain = this.terrainCanvas.getContext('2d');
        if (!terrain) throw new Error('Terrain canvas is unavailable');
        terrain.fillStyle = '#0b1b25'; terrain.fillRect(0, 0, width, height);
        const palette = stonePaletteForLayer(map.layer, this.visuals.config);
        this.burningTiles = this.paintTerrain(terrain, state, map, tile, ox, oy, px, py, palette);
        this.cachedTerrainKey = terrainKey;
      } else if (this.cachedTerrainRevision !== this.visuals.terrainRevision) {
        const terrain = this.terrainCanvas.getContext('2d');
        if (!terrain) throw new Error('Terrain canvas is unavailable');
        const dirtyCells = new Map<number, { x: number; y: number }>();
        for (const dirty of this.visuals.terrainDirtyTiles.values()) {
          if (dirty.mapId !== map.id) continue;
          const { x, y } = dirty.position;
          if (x >= 0 && x < map.width && y >= 0 && y < map.height) dirtyCells.set(y * map.width + x, { x, y });
        }
        for (const { x: cellX, y: cellY } of dirtyCells.values()) {
          const left = Math.round(ox + cellX * tile), right = Math.round(ox + (cellX + 1) * tile);
          const top = Math.round(oy + cellY * tile), bottom = Math.round(oy + (cellY + 1) * tile);
          terrain.fillStyle = '#0b1b25'; terrain.fillRect(left, top, right - left, bottom - top);
        }
        const palette = stonePaletteForLayer(map.layer, this.visuals.config);
        for (const { x: cellX, y: cellY } of dirtyCells.values()) {
          const stone = state.tiles[`${map.id}:${cellX}:${cellY}`];
          if (stone && stone.mapId === map.id) this.paintTile(terrain, stone, map, tile, ox, oy, px, py, palette);
        }
        this.burningTiles = Object.values(state.tiles).filter(stone => stone.mapId === map.id && stone.tags.includes('burning'));
      }
      this.cachedTerrainRevision = this.visuals.terrainRevision;
      this.visuals.terrainFullyDirty = false; this.visuals.terrainDirtyTiles.clear();
      ctx.drawImage(this.terrainCanvas, 0, 0);
      this.paintDynamicTerrain(ctx, state, map, tile, ox, oy, px, py, this.burningTiles);
    }
    // Подсвеченная верхняя граница отделяет текущую карту от следующей.
    if (this.visuals.transition?.kind !== 'complete') {
      ctx.save(); ctx.shadowColor = '#ada6ff'; ctx.shadowBlur = 8; ctx.strokeStyle = 'rgba(224,238,255,.65)'; ctx.lineWidth = Math.max(1, tile * 0.06);
      ctx.beginPath(); ctx.moveTo(ox, oy - 2); ctx.lineTo(ox + tile * map.width, oy - 2); ctx.stroke(); ctx.restore();
    }
    const delivery = state.moduleData.delivery as { flights?: readonly { attack: { weaponId: string; origin: { x: number; y: number }; direct: { point: { x: number; y: number } } }; remaining: number; duration: number }[] } | undefined;
    for (const shot of delivery?.flights ?? []) {
      const t = Math.max(0, Math.min(1, 1 - shot.remaining / shot.duration));
      const x = shot.attack.origin.x + (shot.attack.direct.point.x - shot.attack.origin.x) * t;
      const y = shot.attack.origin.y + (shot.attack.direct.point.y - shot.attack.origin.y) * t;
      if (shot.attack.weaponId === 'bombarda') {
        const sx = px(x), sy = py(y), dx = px(shot.attack.direct.point.x) - px(shot.attack.origin.x), dy = py(shot.attack.direct.point.y) - py(shot.attack.origin.y);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(dy, dx));
        ctx.shadowColor = '#ff9a45'; ctx.shadowBlur = tile * 0.28;
        ctx.strokeStyle = 'rgba(255,160,76,.52)'; ctx.lineWidth = Math.max(1, tile * 0.085);
        ctx.beginPath(); ctx.moveTo(-tile * 0.52, 0); ctx.lineTo(-tile * 0.2, 0); ctx.stroke();
        const casing = ctx.createLinearGradient(0, -tile * 0.11, 0, tile * 0.11);
        casing.addColorStop(0, '#e0e7e4'); casing.addColorStop(0.24, '#8f9da0'); casing.addColorStop(0.55, '#56666d'); casing.addColorStop(1, '#263941');
        ctx.fillStyle = casing; ctx.beginPath(); ctx.roundRect(-tile * 0.22, -tile * 0.105, tile * 0.48, tile * 0.21, tile * 0.06); ctx.fill();
        ctx.strokeStyle = 'rgba(239,246,241,.82)'; ctx.lineWidth = Math.max(1, tile * 0.025);
        ctx.beginPath(); ctx.moveTo(-tile * 0.12, -tile * 0.07); ctx.lineTo(tile * 0.15, -tile * 0.07); ctx.stroke();
        ctx.fillStyle = '#b9c5c5'; ctx.fillRect(-tile * 0.03, tile * 0.045, tile * 0.19, tile * 0.032);
        ctx.fillStyle = '#bc794b'; ctx.beginPath(); ctx.moveTo(tile * 0.26, -tile * 0.095); ctx.lineTo(tile * 0.45, 0); ctx.lineTo(tile * 0.26, tile * 0.095); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#394b52'; ctx.beginPath(); ctx.moveTo(-tile * 0.22, -tile * 0.09); ctx.lineTo(-tile * 0.39, -tile * 0.19); ctx.lineTo(-tile * 0.31, -tile * 0.035); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-tile * 0.22, tile * 0.09); ctx.lineTo(-tile * 0.39, tile * 0.19); ctx.lineTo(-tile * 0.31, tile * 0.035); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffd388'; ctx.shadowColor = '#ffae54'; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(px(x), py(y), Math.max(2, tile * 0.15), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    for (const dash of this.visuals.dashes.values()) {
      const t = dash.player.pose().x;
      ctx.strokeStyle = `rgba(133,244,225,${0.5 * (1 - t)})`; ctx.lineWidth = Math.max(2, tile * 0.24);
      ctx.beginPath(); ctx.moveTo(px(dash.from.x), py(dash.from.y)); ctx.lineTo(px(dash.to.x), py(dash.to.y)); ctx.stroke();
    }
    for (const attack of this.visuals.attacks.values()) if (attack.weapon === 'emitter') {
      const alpha = Math.max(0, 1 - attack.player.elapsedSeconds / attack.player.clip.durationSeconds);
      ctx.strokeStyle = `rgba(126,255,243,${alpha * 0.8})`; ctx.lineWidth = Math.max(2, tile * 0.12);
      ctx.beginPath(); ctx.moveTo(px(attack.origin.x), py(attack.origin.y)); ctx.lineTo(px(attack.target.x), py(attack.target.y)); ctx.stroke();
      if (this.visuals.config.presentation.showPredictions) {
        ctx.strokeStyle = `rgba(255,222,153,${alpha * 0.6})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px(attack.target.x), py(attack.target.y), tile * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const [actorId, target] of this.visuals.targets) {
      const actor = state.characters[actorId];
      if (!actor || !state.tiles[`${actor.mapId}:${target.x}:${target.y}`]) continue;
      ctx.strokeStyle = 'rgba(248,207,130,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px(target.x), py(target.y), tile * 0.38, 0, Math.PI * 2); ctx.stroke();
    }
    for (const actor of Object.values(state.characters)) {
      const pos = this.visuals.actorPosition(actor.id, actor.position), x = px(pos.x), y = py(pos.y);
      const attack = this.visuals.attacks.get(`${actor.id}:${actor.controlledWeapon}`);
      const target = this.visuals.targets.get(actor.id);
      const angle = attack ? Math.atan2(attack.target.y - attack.origin.y, attack.target.x - attack.origin.x) : target ? Math.atan2(target.y - pos.y, target.x - pos.x) : -Math.PI / 2;
      const weaponPose = attack?.player.pose();
      // Силуэт из прежней сцены: тяжёлые ноги, корпус, руки и визор.
      const unit = Math.max(3, tile * 0.18);
      ctx.fillStyle = 'rgba(7,18,26,.55)'; ctx.beginPath(); ctx.ellipse(x, y + unit * 2, unit * 2.75, unit, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#243943'; ctx.fillRect(x - unit * 1.7, y + unit * 0.6, unit * 1.2, unit * 2.4); ctx.fillRect(x + unit * 0.5, y + unit * 0.6, unit * 1.2, unit * 2.4);
      ctx.fillStyle = '#91a8a5'; ctx.beginPath(); ctx.roundRect(x - unit * 2, y - unit * 1.6, unit * 4, unit * 3.4, unit * 0.5); ctx.fill();
      ctx.fillStyle = '#536c73'; ctx.fillRect(x - unit * 3, y - unit, unit, unit * 2.5); ctx.fillRect(x + unit * 2, y - unit, unit, unit * 2.5);
      ctx.fillStyle = '#e8c18a'; ctx.beginPath(); ctx.arc(x, y - unit * 1.6, unit * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#253c44'; ctx.fillRect(x - unit * 0.8, y - unit * 1.9, unit * 1.6, unit * 0.55);
      ctx.fillStyle = '#e9bd76'; ctx.fillRect(x - unit * 0.7, y + unit * 0.1, unit * 1.4, unit * 0.35);
      const weapon = actor.controlledWeapon;
      if (weapon === 'pick' || weapon === 'spear') {
        const image = weapon === 'pick' ? this.pick : this.spear;
        const level = state.upgradeLevels[`${weapon}.radius`] ?? 0;
        const size = tile * (weapon === 'pick' ? 2.4 : 3.3) + tile * Math.min(6, level) * 0.5;
        const dash = this.visuals.dashes.get(actor.id);
        const progress = attack ? Math.min(1, attack.player.elapsedSeconds / attack.player.clip.durationSeconds) : 0;
        let weaponX = x, weaponY = y, rotation = weaponPose?.rotation ?? 0;
        if (weapon === 'spear' && attack?.combo && dash && progress >= 0.22 && progress < 0.7) {
          const flight = Math.max(0, Math.min(1, (progress - 0.22) / 0.48));
          weaponX = px(dash.from.x + (dash.to.x - dash.from.x) * flight);
          weaponY = py(dash.from.y + (dash.to.y - dash.from.y) * flight);
          rotation = 0;
        }
        ctx.save(); ctx.translate(weaponX, weaponY); ctx.rotate(angle + Math.PI / 4 + rotation);
        if (image.complete && image.naturalWidth > 0) ctx.drawImage(image, -size * 0.15, -size * 0.85, size, size);
        else { ctx.strokeStyle = '#d9e6d9'; ctx.lineWidth = Math.max(2, tile * 0.1); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 0.65, -size * 0.65); ctx.stroke(); }
        ctx.restore();
      } else if (weapon === 'fists') {
        const reach = tile * (0.4 + (weaponPose?.x ?? 0));
        ctx.fillStyle = '#e0c18c'; ctx.beginPath(); ctx.arc(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, Math.max(2, tile * 0.16), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const impact of this.visuals.impacts) {
      const p = impact.player.pose(), x = px(impact.position.x), y = py(impact.position.y);
      if (impact.kind === 'bombarda') {
        const duration = Math.max(0.01, impact.player.clip.durationSeconds);
        const progress = Math.max(0, Math.min(0.9999, impact.player.elapsedSeconds / duration));
        const frame = Math.floor(progress * explosionFrames);
        const diameter = tile * Math.max(0.01, impact.radius ?? 3) * 1.5;
        ctx.save(); ctx.globalAlpha = p.alpha;
        ctx.drawImage(this.bombardaExplosionAtlas, frame * explosionFrameSize, 0, explosionFrameSize, explosionFrameSize,
          x - diameter / 2, y - diameter / 2, diameter, diameter);
        ctx.restore();
        continue;
      }
      const color = impact.kind === 'emitter' ? '117,248,235' : impact.kind === 'spear' ? '135,236,220' : impact.kind === 'needle' ? '255,170,91' : impact.kind === 'combo' ? '232,192,255' : '255,210,145';
      ctx.strokeStyle = `rgba(${color},${p.alpha})`; ctx.lineWidth = Math.max(1, tile * 0.07); ctx.beginPath(); ctx.arc(x, y, tile * p.scaleX, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + 0.4, distance = tile * (0.25 + p.scaleX);
        ctx.fillStyle = `rgba(${color},${p.alpha * 0.7})`; ctx.fillRect(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, Math.max(1, tile * 0.08), Math.max(1, tile * 0.08));
      }
    }
    if (this.visuals.transition) {
      const effect = this.visuals.transition, p = effect.player.pose();
      const rgb = effect.kind === 'reset' || effect.kind === 'compress' ? '185,144,255' : effect.kind === 'challenge-enter' || effect.kind === 'challenge-exit' ? '105,223,223' : '223,233,255';
      const origin = effect.snapshot?.origin;
      const cx = effect.kind === 'reset' && origin ? px(origin.x) : width / 2;
      const cy = effect.kind === 'complete' ? oy : effect.kind === 'reset' && origin ? py(origin.y) : height / 2;
      ctx.fillStyle = `rgba(${rgb},${p.alpha * 0.2})`; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = `rgba(${rgb},${p.alpha})`; ctx.lineWidth = Math.max(2, tile * 0.2); ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, p.scaleX * width * 0.4), 0, Math.PI * 2); ctx.stroke();
      if (effect.kind === 'charge') {
        const progress = Math.min(1, effect.player.elapsedSeconds / effect.player.clip.durationSeconds);
        const flicker = 0.7 + 0.3 * Math.sin(this.visuals.elapsed * 12);
        ctx.save(); ctx.shadowColor = '#b4a2ff'; ctx.shadowBlur = 6 + progress * 18; ctx.lineWidth = Math.max(2, tile * (0.08 + progress * 0.12));
        ctx.strokeStyle = `rgba(238,242,255,${(0.35 + progress * 0.6) * flicker})`; ctx.beginPath(); ctx.moveTo(ox, oy - 2); ctx.lineTo(ox + map.width * tile, oy - 2); ctx.stroke();
        for (let i = 0; i < 8; i++) { const x = ox + map.width * tile * (i + 0.5) / 8; ctx.fillStyle = `rgba(195,197,255,${0.1 + progress * 0.15})`; ctx.beginPath(); ctx.arc(x, oy - tile * (0.2 + progress * (i % 3 + 1)), tile * (0.15 + progress * 0.3), 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (effect.kind === 'complete') {
        const t = Math.min(1, effect.player.elapsedSeconds / effect.player.clip.durationSeconds);
        ctx.save(); ctx.shadowColor = '#a7a9ff'; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(2, tile * 0.1);
        for (let i = 0; i < 12; i++) {
          const x = ox + map.width * tile * (i + 0.5) / 12, drift = (i - 5.5) * tile * t * 0.24;
          ctx.strokeStyle = `rgba(229,237,255,${0.8 * (1 - t)})`; ctx.beginPath(); ctx.moveTo(x + drift - tile * 0.35, oy + t * t * tile * (1 + i % 3));
          ctx.lineTo(x + drift + tile * 0.35, oy + t * t * tile * (1 + i % 3) + (i % 2 ? 2 : -2)); ctx.stroke();
          ctx.fillStyle = `rgba(183,191,255,${0.12 * (1 - t)})`; ctx.beginPath(); ctx.arc(x + drift, oy - tile * t, tile * (0.2 + t * 0.45), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  private paintTerrain(target: CanvasRenderingContext2D, state: DeepReadonly<GameState>, map: DeepReadonly<GameState['maps'][string]>,
    tileSize: number, ox: number, oy: number, px: (x: number) => number, py: (y: number) => number,
    palette: ReturnType<typeof stonePaletteForLayer>, previous?: Map<string, DeepReadonly<GameState['tiles'][string]>> | null,
    origin?: { x: number; y: number }, wave = Infinity): DeepReadonly<GameState['tiles'][string]>[] {
    const burning: DeepReadonly<GameState['tiles'][string]>[] = [];
    for (const current of Object.values(state.tiles)) {
      if (current.mapId !== map.id) continue;
      const stone = previous && origin && Math.hypot(current.position.x - origin.x, current.position.y - origin.y) > wave
        ? previous.get(`${current.position.x}:${current.position.y}`) : current;
      if (!stone) continue;
      this.paintTile(target, stone, map, tileSize, ox, oy, px, py, palette);
      if (stone.tags.includes('burning')) burning.push(stone);
    }
    return burning;
  }

  private paintTile(target: CanvasRenderingContext2D, stone: DeepReadonly<GameState['tiles'][string]>, map: DeepReadonly<GameState['maps'][string]>,
    tileSize: number, ox: number, oy: number, px: (x: number) => number, py: (y: number) => number,
    palette: ReturnType<typeof stonePaletteForLayer>): void {
    const ratio = Math.max(0, Math.min(1, stone.health / stone.maxHealth)), stage = Math.min(5, Math.ceil((1 - ratio) * 5));
      const left = Math.round(ox + stone.position.x * tileSize), right = Math.round(ox + (stone.position.x + 1) * tileSize);
      const top = Math.round(oy + stone.position.y * tileSize), bottom = Math.round(oy + (stone.position.y + 1) * tileSize);
      const x = ox + stone.position.x * tileSize, y = oy + stone.position.y * tileSize;
    target.fillStyle = stone.kind === 'elemental' ? palette.elemental : stone.kind === 'hard' ? palette.hard : palette.stone;
      target.fillRect(left, top, right - left, bottom - top);
    const key = `${stone.position.x}:${stone.position.y}`;
    let noise = this.noiseCache.get(key);
    if (noise === undefined) {
      noise = stoneTextureNoise(stone.position.x / 4.2, stone.position.y / 4.2, map.layer) + 0.35 * stoneTextureNoise(stone.position.x / 1.8, stone.position.y / 1.8, map.layer + 91);
      this.noiseCache.set(key, noise);
    }
    target.fillStyle = noise >= 0 ? `rgba(244,225,186,${Math.min(0.3, Math.abs(noise) * 0.55)})` : `rgba(23,39,56,${Math.min(0.3, Math.abs(noise) * 0.55)})`;
      target.fillRect(left, top, right - left, bottom - top);
    const variation = (stone.position.x * 17 + stone.position.y * 31 + map.layer * 7) % 7;
    if (variation < 3) { target.fillStyle = variation === 0 ? 'rgba(255,255,255,.07)' : 'rgba(23,35,43,.07)'; target.beginPath(); target.arc(px(stone.position.x) + tileSize * 0.16, py(stone.position.y) - tileSize * 0.1, tileSize * 0.18, 0, Math.PI * 2); target.fill(); }
    if (stage > 0 && tileSize > 5) {
      target.strokeStyle = `rgba(11,22,30,${0.25 + stage * 0.12})`; target.lineWidth = Math.max(0.5, tileSize * 0.04);
      target.beginPath(); target.moveTo(x + tileSize * 0.25, y + tileSize * 0.12); target.lineTo(x + tileSize * 0.52, y + tileSize * 0.48); target.lineTo(x + tileSize * 0.35, y + tileSize * 0.84);
      if (stage >= 2) { target.moveTo(x + tileSize * 0.52, y + tileSize * 0.48); target.lineTo(x + tileSize * 0.85, y + tileSize * 0.7); }
      if (stage >= 3) { target.moveTo(x + tileSize * 0.52, y + tileSize * 0.48); target.lineTo(x + tileSize * 0.78, y + tileSize * 0.18); }
      if (stage >= 4) { target.moveTo(x + tileSize * 0.35, y + tileSize * 0.84); target.lineTo(x + tileSize * 0.1, y + tileSize * 0.68); }
      if (stage >= 5) { target.moveTo(x + tileSize * 0.52, y + tileSize * 0.48); target.lineTo(x + tileSize * 0.15, y + tileSize * 0.25); }
      target.stroke();
    }
  }

  private paintDynamicTerrain(target: CanvasRenderingContext2D, state: DeepReadonly<GameState>, map: DeepReadonly<GameState['maps'][string]>,
    tileSize: number, ox: number, oy: number, px: (x: number) => number, py: (y: number) => number,
    burning: readonly DeepReadonly<GameState['tiles'][string]>[]): void {
    for (const [id, flash] of this.visuals.damageFlashes) {
      const stone = state.tiles[id];
      if (!stone || stone.mapId !== map.id) continue;
      const left = Math.round(ox + stone.position.x * tileSize), right = Math.round(ox + (stone.position.x + 1) * tileSize);
      const top = Math.round(oy + stone.position.y * tileSize), bottom = Math.round(oy + (stone.position.y + 1) * tileSize);
      target.fillStyle = `rgba(255,225,170,${Math.min(0.16, flash)})`; target.fillRect(left, top, right - left, bottom - top);
    }
    for (const stone of burning) {
      const left = Math.round(ox + stone.position.x * tileSize), right = Math.round(ox + (stone.position.x + 1) * tileSize);
      const top = Math.round(oy + stone.position.y * tileSize), bottom = Math.round(oy + (stone.position.y + 1) * tileSize);
      target.fillStyle = `rgba(255,112,28,${0.18 + 0.08 * Math.sin(this.visuals.elapsed * 8 + stone.position.x)})`; target.fillRect(left, top, right - left, bottom - top);
    }
  }
}
