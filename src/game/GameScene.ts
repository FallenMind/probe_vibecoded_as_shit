import Phaser from 'phaser';
import { Activity, gameState, onToast, sectorName } from './state';

interface Star {
  x: number;
  y: number;
  r: number;
  speed: number;
  base: number;
}

interface Packet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

const ACTIVITY_INFO: Record<Activity, { label: string; color: string }> = {
  explore: { label: 'ИССЛЕДОВАНИЕ', color: '#a5f3fc' },
  mine: { label: 'ДОБЫЧА РУДЫ', color: '#fde68a' },
  travel: { label: 'ПЕРЕЛЁТ', color: '#c4b5fd' },
  storm: { label: 'СОЛНЕЧНАЯ БУРЯ', color: '#fca5a5' },
  charge: { label: 'ПОДЗАРЯДКА', color: '#86efac' },
  dead: { label: 'КРИТ. СОСТОЯНИЕ', color: '#f87171' },
};

/**
 * Сцена корабля (правая часть экрана).
 * Читает общее состояние игры (gameState) и визуализирует зонд,
 * астероиды, лазер, щит и фазы цикла.
 */
export class GameScene extends Phaser.Scene {
  private W = 620;
  private H = 640;

  private stars: Star[] = [];
  private starGfx!: Phaser.GameObjects.Graphics;
  private bgGfx!: Phaser.GameObjects.Graphics;

  private ship!: Phaser.GameObjects.Container;
  private engineGfx!: Phaser.GameObjects.Graphics;
  private glowGfx!: Phaser.GameObjects.Graphics;

  private asteroid!: Phaser.GameObjects.Container;
  private asteroidGfx!: Phaser.GameObjects.Graphics;
  private shipShieldGfx!: Phaser.GameObjects.Graphics;
  private laserA!: Phaser.GameObjects.Rectangle;
  private laserB!: Phaser.GameObjects.Rectangle;
  private laserFlash!: Phaser.GameObjects.Arc;

  private barsGfx!: Phaser.GameObjects.Graphics;
  private hullLabel!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private activityText!: Phaser.GameObjects.Text;
  private sectorText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private countersText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private warningText!: Phaser.GameObjects.Text;

  private packets: Packet[] = [];
  private packetGfx!: Phaser.GameObjects.Graphics;
  private packetTimer = 0;
  private laserFlicker = 0;
  private toastTween?: Phaser.Tweens.Tween;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.bgGfx = this.add.graphics();
    this.starGfx = this.add.graphics();
    this.barsGfx = this.add.graphics();
    this.packetGfx = this.add.graphics();

    this.drawNebula();
    this.createStars();
    this.createPlanet();
    this.createShip();
    this.createAsteroid();
    this.createLaser();
    this.createTexts();

    // Зонд качается на «волнах» космоса
    this.tweens.add({
      targets: this.ship,
      y: this.ship.y + 7,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    onToast((msg) => this.showToast(msg));
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);

    this.updateStars(dt);
    this.updatePackets(dt);
    this.updateShipVisuals(dt);
    this.updateAsteroid(dt);
    this.updateLaser();
    this.updateHud();
  }

  // -------------------------------------------------------------------------
  // Фон
  // -------------------------------------------------------------------------

  private drawNebula(): void {
    const blobs: Array<[number, number, number, number]> = [
      [this.W * 0.78, this.H * 0.18, 150, 0x312e81],
      [this.W * 0.22, this.H * 0.82, 120, 0x831843],
      [this.W * 0.92, this.H * 0.88, 100, 0x1e3a8a],
      [this.W * 0.5, this.H * 0.5, 90, 0x134e4a],
    ];
    for (const [x, y, r, color] of blobs) {
      this.bgGfx.fillStyle(color, 0.35);
      this.bgGfx.fillCircle(x, y, r);
    }
  }

  private createPlanet(): void {
    this.bgGfx.fillStyle(0x64748b, 0.16);
    this.bgGfx.fillCircle(this.W * 0.9, this.H * 0.12, 46);
    this.bgGfx.fillStyle(0x94a3b8, 0.22);
    this.bgGfx.fillCircle(this.W * 0.9, this.H * 0.12, 34);
  }

  private createStars(): void {
    this.stars = [];
    for (let i = 0; i < 110; i += 1) {
      this.stars.push({
        x: Phaser.Math.Between(0, this.W),
        y: Phaser.Math.Between(0, this.H),
        r: Phaser.Math.FloatBetween(0.4, 1.8),
        speed: Phaser.Math.FloatBetween(3, 14),
        base: Phaser.Math.FloatBetween(0.3, 1),
      });
    }
  }

  private updateStars(dt: number): void {
    this.starGfx.clear();
    for (const star of this.stars) {
      star.x -= star.speed * dt;
      if (star.x < -4) {
        star.x = this.W + 4;
        star.y = Phaser.Math.Between(0, this.H);
      }
      const tw = 0.55 + 0.45 * Math.sin(this.time.now / 300 + star.x);
      this.starGfx.fillStyle(0xffffff, star.base * tw);
      this.starGfx.fillCircle(star.x, star.y, star.r);
    }
  }

  // -------------------------------------------------------------------------
  // Корабль
  // -------------------------------------------------------------------------

  private createShip(): void {
    const g = this.add.graphics();

    // Корпус-дротик
    g.fillStyle(0x7dd3fc, 1);
    g.fillTriangle(-20, 0, 26, -15, 26, 15);
    g.fillStyle(0x38bdf8, 1);
    g.fillTriangle(-20, 0, 26, -15, 2, -4);
    // Нос
    g.fillStyle(0xe0f2fe, 1);
    g.fillTriangle(26, -15, 26, 15, 42, 0);
    // Хвостовой блок
    g.fillStyle(0x475569, 1);
    g.fillRect(-28, -13, 10, 26);
    // Кабина
    g.fillStyle(0x0c4a6e, 1);
    g.fillCircle(4, 0, 7);
    g.fillStyle(0x7dd3fc, 1);
    g.fillCircle(4, -2, 3);
    // Солнечные панели
    g.fillStyle(0x1e40af, 1);
    g.fillRect(-6, -26, 16, 8);
    g.fillRect(-6, 18, 16, 8);
    g.fillStyle(0x60a5fa, 0.7);
    g.fillRect(-6, -26, 16, 2);
    g.fillRect(-6, 18, 16, 2);
    // Красные ходовые огни
    g.fillStyle(0xf87171, 1);
    g.fillCircle(-30, 0, 2);

    this.engineGfx = this.add.graphics();
    this.glowGfx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.shipShieldGfx = this.add.graphics();

    this.ship = this.add.container(this.W * 0.36, this.H * 0.52, [
      g,
      this.engineGfx,
      this.glowGfx,
      this.shipShieldGfx,
    ]);
  }

  private updateShipVisuals(dt: number): void {
    const s = gameState;
    this.engineGfx.clear();
    this.glowGfx.clear();

    const thrusting = s.activity === 'travel' || s.activity === 'explore';
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90);
    const flameLen = thrusting ? 14 + 10 * pulse : 6 + 3 * pulse;

    // Пламя двигателя
    this.engineGfx.fillStyle(0xfb923c, 0.9);
    this.engineGfx.fillTriangle(-30, -5, -30 - flameLen, 0, -30, 5);
    this.engineGfx.fillStyle(0xfde047, 0.9);
    this.engineGfx.fillTriangle(-30, -2, -30 - flameLen * 0.6, 0, -30, 2);

    // Искры при перелёте
    if (thrusting && Math.random() < dt * 14) {
      this.glowGfx.fillStyle(0xfdba74, 0.9);
      this.glowGfx.fillCircle(-30 - flameLen, Phaser.Math.Between(-4, 4), Phaser.Math.FloatBetween(1, 2.6));
    }

    // Щит вокруг зонда
    this.shipShieldGfx.clear();
    if (s.shieldTimer > 0) {
      const a = 0.35 + 0.3 * Math.sin(this.time.now / 70);
      this.drawHex(this.shipShieldGfx, 0, 0, 58, 0x22d3ee, a, 2.5);
    } else if (s.activity === 'storm') {
      this.drawHex(this.shipShieldGfx, 0, 0, 52, 0xef4444, 0.12, 1.5);
    }
  }

  private drawHex(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    for (let i = 0; i <= 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokePath();
  }

  // -------------------------------------------------------------------------
  // Астероид
  // -------------------------------------------------------------------------

  private createAsteroid(): void {
    this.asteroidGfx = this.add.graphics();
    this.asteroid = this.add.container(this.W * 0.78, this.H * 0.55, [this.asteroidGfx]);
    this.asteroid.setScale(0.8);
    this.asteroid.setAlpha(0);
    this.tweens.add({
      targets: this.asteroid,
      angle: 30,
      duration: 9000,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private redrawAsteroid(): void {
    const g = this.asteroidGfx;
    g.clear();
    g.fillStyle(0x64748b, 1);
    g.fillCircle(0, 0, 26);
    g.fillStyle(0x475569, 1);
    g.fillCircle(12, -9, 8);
    g.fillCircle(-14, 6, 6);
    g.fillCircle(4, 14, 7);
    g.fillStyle(0x334155, 1);
    g.fillCircle(-6, -14, 5);
    g.fillCircle(18, 10, 4);
    // Признак богатой руды
    if (gameState.asteroidRich >= 40) {
      g.fillStyle(0xfbbf24, 0.9);
      g.fillCircle(2, 4, 2);
      g.fillCircle(-9, -4, 1.5);
      g.fillCircle(14, 2, 1.5);
    }
  }

  private updateAsteroid(dt: number): void {
    const s = gameState;
    const visible = s.activity === 'mine' || s.activity === 'storm';
    const targetAlpha = visible ? 1 : 0;

    if (visible && this.asteroid.alpha < 0.5) this.redrawAsteroid();
    this.asteroid.setAlpha(Phaser.Math.Linear(this.asteroid.alpha, targetAlpha, dt * 4));

    if (s.activity === 'mine') {
      const pct = Math.max(0, s.asteroidHP) / s.asteroidMaxHP;
      this.asteroid.setScale(0.55 + 0.45 * pct);
    } else {
      this.asteroid.setScale(Phaser.Math.Linear(this.asteroid.scale, 0.8, dt * 3));
    }
  }

  // -------------------------------------------------------------------------
  // Лазер
  // -------------------------------------------------------------------------

  private createLaser(): void {
    this.laserA = this.add
      .rectangle(0, 0, 1, 1, 0xffd166, 0.9)
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.laserB = this.add
      .rectangle(0, 0, 1, 1, 0xfb923c, 0.35)
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.laserFlash = this.add
      .circle(0, 0, 6, 0xffffff, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
  }

  private updateLaser(): void {
    const mining = gameState.activity === 'mine';
    this.laserFlicker = Math.max(0, this.laserFlicker - 0.05);
    if (mining && Math.random() < 0.08) this.laserFlicker = 1;

    if (!mining || this.laserFlicker <= 0.01) {
      this.laserA.setAlpha(0);
      this.laserB.setAlpha(0);
      this.laserFlash.setAlpha(0);
      return;
    }

    const sx = this.ship.x + 30;
    const sy = this.ship.y;
    const tx = this.asteroid.x;
    const ty = this.asteroid.y;
    const len = Phaser.Math.Distance.Between(sx, sy, tx, ty);
    const ang = Math.atan2(ty - sy, tx - sx);
    const wob = 1 + 0.25 * Math.sin(this.time.now / 40);

    this.laserA.setPosition(sx, sy).setRotation(ang).setSize(len, 3 * wob).setAlpha(0.9);
    this.laserB.setPosition(sx, sy).setRotation(ang).setSize(len, 7 * wob).setAlpha(0.35);

    // Вспышка на астероиде
    this.laserFlash
      .setPosition(tx, ty)
      .setAlpha(0.5 + 0.5 * Math.random());
  }

  // -------------------------------------------------------------------------
  // Тексты и HUD
  // -------------------------------------------------------------------------

  private createTexts(): void {
    this.activityText = this.add
      .text(this.W / 2, this.H * 0.82, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.sectorText = this.add
      .text(this.W / 2, 12, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    this.distText = this.add
      .text(this.W - 12, this.H - 12, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#475569',
      })
      .setOrigin(1);

    this.countersText = this.add
      .text(12, this.H - 12, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#64748b',
      })
      .setOrigin(0, 1);

    this.warningText = this.add
      .text(this.W / 2, this.H / 2, '☠ КРИТИЧЕСКОЕ СОСТОЯНИЕ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ef4444',
        backgroundColor: 'rgba(2,6,23,0.75)',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.toastText = this.add
      .text(this.W / 2, this.H - 56, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#f8fafc',
        backgroundColor: 'rgba(2,6,23,0.85)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.hullLabel = this.add.text(20, 37, 'КОРПУС', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#0f172a',
    });
    this.energyLabel = this.add.text(20, 59, 'ЭНЕРГИЯ', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#0f172a',
    });
  }

  private updateHud(): void {
    const s = gameState;
    const info = ACTIVITY_INFO[s.activity];

    this.activityText.setText(info.label).setColor(info.color);

    const hMax = 100 + 40 * (s.upgrades.armor ?? 0);
    const eMax = 100 + 30 * (s.upgrades.energy ?? 0);
    const hp = Phaser.Math.Clamp(s.hull / hMax, 0, 1);
    const ep = Phaser.Math.Clamp(s.energy / eMax, 0, 1);

    this.drawBar(14, 34, this.W - 28, 14, hp, hp > 0.5 ? 0x4ade80 : hp > 0.25 ? 0xfacc15 : 0xef4444);
    this.drawBar(14, 56, this.W - 28, 14, ep, 0x22d3ee);

    this.sectorText.setText(`Сектор: ${sectorName(s)}`);
    this.distText.setText(`${Math.floor(s.distance).toLocaleString('ru-RU')} у.е. от базы`);
    this.countersText.setText(
      `📡 ${Math.floor(s.data).toLocaleString('ru-RU')}   🪨 ${Math.floor(s.ore).toLocaleString('ru-RU')}`,
    );

    // Предупреждение о критическом состоянии
    const wantAlpha = s.activity === 'dead' ? 1 : 0;
    this.warningText.setAlpha(Phaser.Math.Linear(this.warningText.alpha, wantAlpha, 0.04));
  }

  private drawBar(x: number, y: number, w: number, h: number, pct: number, color: number): void {
    const g = this.barsGfx;
    g.clear();
    g.fillStyle(0x0f172a, 0.9);
    g.fillRoundedRect(x, y, w, h, 5);
    g.fillStyle(color, 1);
    if (pct > 0) g.fillRoundedRect(x + 2, y + 2, Math.max(2, (w - 4) * pct), h - 4, 4);
    g.lineStyle(1, 0x334155, 1);
    g.strokeRoundedRect(x, y, w, h, 5);
  }

  // -------------------------------------------------------------------------
  // Пакеты данных (анимация исследования/добычи)
  // -------------------------------------------------------------------------

  private updatePackets(dt: number): void {
    this.packetTimer -= dt;
    const s = gameState;

    if (s.activity === 'explore' && this.packetTimer <= 0) {
      this.packetTimer = 0.55;
      this.packets.push({
        x: this.ship.x + Phaser.Math.Between(-6, 6),
        y: this.ship.y + Phaser.Math.Between(-14, 14),
        vx: Phaser.Math.FloatBetween(-30, -12),
        vy: Phaser.Math.FloatBetween(-46, -28),
        life: 1,
        color: 0x4ade80,
      });
    }

    if (s.activity === 'mine' && this.packetTimer <= 0) {
      this.packetTimer = 0.4;
      this.packets.push({
        x: this.asteroid.x + Phaser.Math.Between(-16, 16),
        y: this.asteroid.y + Phaser.Math.Between(-16, 16),
        vx: Phaser.Math.FloatBetween(-90, -50),
        vy: Phaser.Math.FloatBetween(-14, 14),
        life: 1,
        color: 0xfbbf24,
      });
    }

    this.packetGfx.clear();
    for (const p of this.packets) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.7;
      this.packetGfx.fillStyle(p.color, Phaser.Math.Clamp(p.life, 0, 1));
      this.packetGfx.fillRect(p.x, p.y, 4, 4);
    }
    this.packets = this.packets.filter((p) => p.life > 0);
  }

  // -------------------------------------------------------------------------
  // Тосты
  // -------------------------------------------------------------------------

  private showToast(msg: string): void {
    this.toastText.setText(msg).setAlpha(1);
    this.toastTween?.stop();
    this.toastTween = this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 2600,
      duration: 500,
      ease: 'Quad.easeIn',
    });
  }
}
