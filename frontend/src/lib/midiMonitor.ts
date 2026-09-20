/** Small polyphonic monitor; independent of captured MIDI and take playback. */
export class MidiMonitor {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, { oscillator: OscillatorNode; gain: GainNode }>();
  private volume = .35;
  async enable() {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * .2;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.context && this.master) this.master.gain.setTargetAtTime(value * .2, this.context.currentTime, .01);
  }
  release(key: string) {
    const voice = this.voices.get(key);
    if (!voice || !this.context) return;
    this.voices.delete(key);
    voice.gain.gain.cancelScheduledValues(this.context.currentTime);
    voice.gain.gain.setTargetAtTime(0, this.context.currentTime, .02);
    voice.oscillator.stop(this.context.currentTime + .12);
  }
  silence() { for (const key of this.voices.keys()) this.release(key); }
  message(status: number, pitch: number, velocity: number) {
    const channel = status & 15, kind = status & 240, key = `${channel}:${pitch}`;
    if (kind === 176 && [120,123].includes(pitch)) {
      for (const id of this.voices.keys()) if (id.startsWith(`${channel}:`)) this.release(id);
      return;
    }
    if (kind !== 128 && kind !== 144) return;
    this.release(key);
    if (kind === 128 || !velocity || !this.volume || !this.context || !this.master || this.context.state !== "running") return;
    if (this.voices.size >= 32) this.release(this.voices.keys().next().value!);
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(velocity / 127, this.context.currentTime + .005);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    this.voices.set(key, { oscillator, gain }); oscillator.start();
  }
  close() { this.silence(); void this.context?.close(); this.context = null; this.master = null; }
}
