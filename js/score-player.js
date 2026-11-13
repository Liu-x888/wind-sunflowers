export class ScorePlayer {
  constructor(source) {
    this.audio = new Audio(source);
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 0;
    this.targetVolume = 0.62;
    this.muted = false;
    this.running = false;
    this.fadeTimer = null;
    this.pauseTimer = null;
  }

  async start() {
    this.running = true;
    clearTimeout(this.pauseTimer);
    if (this.audio.paused) {
      try {
        await this.audio.play();
      } catch (error) {
        this.running = false;
        throw error;
      }
    }
    this.fadeTo(this.muted ? 0 : this.targetVolume, 900);
  }

  pause() {
    this.running = false;
    this.fadeTo(0.06, 450);
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      if (!this.running && !this.audio.paused) this.audio.pause();
    }, 650);
  }

  resume() {
    return this.start();
  }

  toggleMuted() {
    this.muted = !this.muted;
    const target = this.muted || !this.running ? 0 : this.targetVolume;
    this.fadeTo(target, 250);
    return this.muted;
  }

  fadeTo(target, duration) {
    cancelAnimationFrame(this.fadeTimer);
    clearTimeout(this.fadeTimer);
    const startVolume = this.audio.volume;
    const start = performance.now();
    const tick = (now) => {
      const amount = Math.min(1, (now - start) / duration);
      const eased = amount * amount * (3 - 2 * amount);
      this.audio.volume = startVolume + (target - startVolume) * eased;
      if (amount < 1) {
        this.fadeTimer = requestAnimationFrame(tick);
      }
    };
    this.fadeTimer = requestAnimationFrame(tick);
  }

  restart() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.running = false;
    this.audio.volume = 0;
  }

  destroy() {
    this.audio.pause();
    this.audio.src = "";
  }
}
