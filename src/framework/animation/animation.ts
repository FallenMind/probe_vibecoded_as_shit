/** Поза не зависит от Phaser и может применяться к спрайту любым визуализатором. */
export interface AnimationPose { x: number; y: number; rotation: number; scaleX: number; scaleY: number; alpha: number }
export interface AnimationKeyframe { at: number; pose: AnimationPose }
export interface AnimationTarget { applyPose(pose: Readonly<AnimationPose>): void }

const poseKeys: readonly (keyof AnimationPose)[] = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'alpha'];

/** Ключевые кадры расположены в нормализованном времени от 0 до 1. */
export class AnimationClip {
  readonly keyframes: readonly AnimationKeyframe[];
  constructor(readonly id: string, readonly durationSeconds: number, frames: readonly AnimationKeyframe[], readonly loop = false) {
    if (!id || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || frames.length < 2 || frames[0].at !== 0 || frames[frames.length - 1].at !== 1 ||
      frames.some((frame, index) => !Number.isFinite(frame.at) || (index > 0 && frame.at <= frames[index - 1].at) || poseKeys.some(key => !Number.isFinite(frame.pose[key])))) {
      throw new Error('Некорректное описание анимации');
    }
    this.keyframes = structuredClone(frames);
  }

  sample(progress: number): AnimationPose {
    if (!Number.isFinite(progress)) throw new Error('Некорректное время анимации');
    const t = Math.max(0, Math.min(1, progress));
    const endIndex = this.keyframes.findIndex(frame => frame.at >= t);
    if (endIndex <= 0) return { ...this.keyframes[0].pose };
    const from = this.keyframes[endIndex - 1];
    const to = this.keyframes[endIndex];
    const fraction = (t - from.at) / (to.at - from.at);
    const result = { ...from.pose };
    for (const key of poseKeys) result[key] = from.pose[key] + (to.pose[key] - from.pose[key]) * fraction;
    return result;
  }
}

/** Состояние воспроизведения отдельного эффекта, оружия или персонажа. */
export class AnimationPlayer {
  elapsedSeconds = 0;
  paused = false;
  finished = false;
  private playbackSpeed = 1;
  constructor(readonly clip: AnimationClip) {}

  get speed(): number { return this.playbackSpeed; }
  set speed(value: number) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Некорректная скорость анимации');
    this.playbackSpeed = value;
  }
  reset(): void { this.elapsedSeconds = 0; this.paused = false; this.finished = false; }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Некорректная длительность тика');
    if (this.paused || this.finished) return;
    const elapsed = this.elapsedSeconds + seconds * this.speed;
    if (this.clip.loop) this.elapsedSeconds = elapsed % this.clip.durationSeconds;
    else { this.elapsedSeconds = Math.min(elapsed, this.clip.durationSeconds); this.finished = elapsed >= this.clip.durationSeconds; }
  }
  pose(): AnimationPose { return this.clip.sample(this.elapsedSeconds / this.clip.durationSeconds); }
  render(target: AnimationTarget): void { target.applyPose(this.pose()); }
}

/** Несколько независимых анимаций с явным управлением их жизненным циклом. */
export class AnimationSystem {
  private readonly players = new Map<string, AnimationPlayer>();
  play(id: string, clip: AnimationClip): AnimationPlayer {
    if (!id) throw new Error('Не указан идентификатор анимации');
    const player = new AnimationPlayer(clip);
    this.players.set(id, player);
    return player;
  }
  get(id: string): AnimationPlayer | undefined { return this.players.get(id); }
  stop(id: string): boolean { return this.players.delete(id); }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Некорректная длительность тика');
    for (const player of this.players.values()) player.tick(seconds);
  }
}
