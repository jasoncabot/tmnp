import type { Assets, MusicId, SoundId } from './assets';
import { storage } from './storage';

interface PlayOptions {
  volume?: number;
  /** Random pitch variation in cents, so repeated sounds don't machine-gun. */
  vary?: number;
  rate?: number;
}

// Minimum gap between two plays of the same sound, so rapid fire doesn't turn into a wall of noise.
const THROTTLE: Partial<Record<SoundId, number>> = { 'sfx-shoot': 0.05, 'sfx-hit': 0.04, 'sfx-enemy-shot': 0.06 };

export class SoundSystem {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private musicBus = this.ctx.createGain();
  private sfxBus = this.ctx.createGain();
  private buffers = new Map<SoundId | MusicId, AudioBuffer>();
  private lastPlayed = new Map<SoundId, number>();
  private current?: { id: MusicId; source: AudioBufferSourceNode; gain: GainNode };
  muted = storage.get('muted') === '1';

  constructor(assets: Assets) {
    this.musicBus.gain.value = 0.55;
    this.sfxBus.gain.value = 0.8;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.master.gain.value = this.muted ? 0 : 1;

    for (const [id, data] of Object.entries(assets.sounds)) {
      // decodeAudioData detaches the buffer, so hand it a copy.
      this.ctx
        .decodeAudioData(data.slice(0))
        .then((b) => this.buffers.set(id as SoundId, b))
        .catch(() => console.warn(`Could not decode ${id}`));
    }

    // Browsers only allow audio after a user gesture.
    const unlock = () => void this.ctx.resume();
    for (const e of ['pointerdown', 'keydown', 'touchstart', 'touchend'])
      window.addEventListener(e, unlock, { passive: true });
  }

  play(id: SoundId, { volume = 1, vary = 0, rate = 1 }: PlayOptions = {}) {
    const buffer = this.buffers.get(id);
    if (!buffer || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = THROTTLE[id];
    if (gap && now - (this.lastPlayed.get(id) ?? -1) < gap) return;
    this.lastPlayed.set(id, now);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.detune.value = (Math.random() * 2 - 1) * vary;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.sfxBus);
    source.start();
  }

  /** Crossfades to a looping music track. */
  music(id: MusicId | null, fade = 1.2) {
    if (this.current?.id === id) return;
    const now = this.ctx.currentTime;
    if (this.current) {
      const { source, gain } = this.current;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
      source.stop(now + fade);
      this.current = undefined;
    }
    if (!id) return;
    const buffer = this.buffers.get(id);
    if (!buffer) {
      // Still decoding: try again shortly.
      setTimeout(() => !this.current && this.music(id, fade), 300);
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    source.connect(gain).connect(this.musicBus);
    source.start();
    this.current = { id, source, gain };
  }

  /** Plays a stinger over the music, ducking the music while it plays. */
  jingle(id: SoundId) {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const now = this.ctx.currentTime;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.12, now + 0.15);
    g.setValueAtTime(0.12, now + buffer.duration - 0.5);
    g.linearRampToValueAtTime(0.55, now + buffer.duration + 0.5);
    this.play(id, { volume: 0.9 });
  }

  toggleMute() {
    this.muted = !this.muted;
    storage.set('muted', this.muted ? '1' : '0');
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
