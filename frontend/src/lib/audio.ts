/**
 * Singleton audio engine: owns one <audio> element plus a Web Audio graph with
 * an AnalyserNode so the visualizer can read live frequency/waveform data.
 */
const FADE_MS = 420;

class AudioEngine {
  el: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  freq: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  wave: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  constructor() {
    this.el = new Audio();
    this.el.crossOrigin = "anonymous";
    this.el.preload = "auto";
  }

  private ensureGraph() {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.source = this.ctx.createMediaElementSource(this.el);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    // source -> analyser (visualizer tap, full signal) -> gain (fades) -> out
    this.gain = this.ctx.createGain();
    this.source.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Ramp the fade gain to `target` over `ms`; resolves when done. */
  private ramp(target: number, ms: number): Promise<void> {
    if (!this.ctx || !this.gain) return Promise.resolve();
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(Math.max(0.0001, target), now + ms / 1000);
    } catch {
      g.value = target;
    }
    return new Promise((r) => setTimeout(r, ms));
  }

  async play(url?: string) {
    this.ensureGraph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
    const changing =
      url && this.el.src !== new URL(url, location.href).href;
    if (changing) {
      // fade the old track out, swap, then fade the new one in
      if (!this.el.paused) await this.ramp(0, FADE_MS);
      this.el.src = url!;
      if (this.gain) this.gain.gain.value = 0.0001;
      await this.el.play();
      await this.ramp(1, FADE_MS);
    } else {
      await this.el.play();
      await this.ramp(1, FADE_MS);
    }
  }

  pause() {
    this.el.pause();
  }

  seek(t: number) {
    this.el.currentTime = t;
  }

  setVolume(v: number) {
    this.el.volume = v;
  }

  get sampleRate() { return this.ctx?.sampleRate ?? 48000; }

  sample() {
    if (!this.analyser) return { freq: this.freq, wave: this.wave };
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    return { freq: this.freq, wave: this.wave };
  }

  /**
   * Expose the raw Web Audio context + a tap node for heavy visualizers
   * (Butterchurn / Milkdrop) that build their own analysers. Safe to call
   * before playback — this lazily creates the graph.
   */
  getContext(): AudioContext {
    this.ensureGraph();
    return this.ctx!;
  }

  /** A node the visualizer can connect its own analyser to. */
  getSourceNode(): AudioNode {
    this.ensureGraph();
    return this.analyser!;
  }
}

export const audioEngine = new AudioEngine();
