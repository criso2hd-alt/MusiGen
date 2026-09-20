import { useEffect, useRef, useState } from "react";
import { MidiMonitor } from "../../lib/midiMonitor";
import { encodeMidi, type MidiNote } from "../../lib/midiCapture";

export function MidiRecorder({ onUse, disabled, onActive, visible }: { visible: boolean; onActive: (active: boolean) => void; onUse: (file: File) => Promise<void>; disabled: boolean }) {
  const [monitorVolume, setMonitorVolume] = useState(.35);
  const [monitor] = useState(() => new MidiMonitor());
  useEffect(() => { monitor.setVolume(monitorVolume); }, [monitor, monitorVolume]);
  useEffect(() => { if (!visible) monitor.silence(); return () => monitor.silence(); }, [monitor, visible]);
  useEffect(() => () => monitor.close(), [monitor]);
  const enableMonitor = () => monitor.enable().catch((e) => { if (alive.current) setError(`Sound unavailable: ${String(e)}. Click Enable sound to retry.`); });
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [device, setDevice] = useState("");
  const [notes, setNotes] = useState<MidiNote[]>([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [error, setError] = useState("");
  const [lastNote, setLastNote] = useState("");
  const startTime = useRef<number | null>(null);
  const capturing = useRef(false);
  const take = useRef<MidiNote[]>([]);
  const held = useRef(new Map<string, MidiNote>());
  const audio = useRef<AudioContext | null>(null);
  const alive = useRef(true);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAudio = () => { if (playbackTimer.current) clearTimeout(playbackTimer.current); void audio.current?.close(); audio.current = null; setPlaying(false); };
  const stop = () => {
    const end = startTime.current === null ? 0 : Math.min(330, (performance.now() - startTime.current) / 1000);
    for (const n of held.current.values()) take.current.push({ ...n, duration: Math.max(.03, end - n.start) });
    held.current.clear(); capturing.current = false; setRecording(false); setNotes([...take.current]);
  };
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; });
  useEffect(() => { onActive(recording || playing || connecting); return () => onActive(false); }, [recording, playing, connecting, onActive]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; capturing.current = false; if (playbackTimer.current) clearTimeout(playbackTimer.current); void audio.current?.close(); }; }, []);
  useEffect(() => {
    if (!access) return;
    const refresh = () => {
      const ports = [...access.inputs.values()].filter((p) => p.state === "connected");
      setInputs(ports);
      setDevice((id) => ports.some((p) => p.id === id) ? id : ports[0]?.id || "");
    };
    refresh(); access.addEventListener("statechange", refresh);
    return () => access.removeEventListener("statechange", refresh);
  }, [access]);
  useEffect(() => {
    const input = access?.inputs.get(device);
    if (!visible) return;
    if (!input) { if (capturing.current) { stopRef.current(); setError("Keyboard disconnected. Your completed notes were kept."); } return; }
    const receive = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length < 3) return;
      const [status, pitch, velocity] = data;
      monitor.message(status, pitch, velocity);
      const kind = status & 0xf0;
      if (kind !== 0x90 && kind !== 0x80) return;
      const down = kind === 0x90 && velocity > 0;
      setLastNote(`${["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][pitch % 12]}${Math.floor(pitch / 12) - 1}${down ? " pressed" : " released"}`);
      if (!capturing.current) return;
      if (startTime.current === null) { if (!down) return; startTime.current = performance.now(); }
      const time = Math.min(330, (performance.now() - startTime.current) / 1000);
      const key = `${status & 15}:${pitch}`;
      const prior = held.current.get(key);
      if (prior) { take.current.push({ ...prior, duration: Math.max(.03, time - prior.start) }); held.current.delete(key); }
      if (down && time < 330) held.current.set(key, { pitch, velocity, start: time, duration: .1 });
      setNotes([...take.current]);
      if (time >= 330 || take.current.length >= 8000) stopRef.current();
    };
    input.addEventListener("midimessage", receive);
    return () => { input.removeEventListener("midimessage", receive); monitor.silence(); void input.close(); };
  }, [access, device, monitor, visible]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => { const time = startTime.current === null ? 0 : (performance.now() - startTime.current) / 1000; setElapsed(Math.min(time, 330)); if (time >= 330) stopRef.current(); }, 100);
    return () => clearInterval(timer);
  }, [recording]);
  const connect = async () => {
    setConnecting(true); setError("");
    void enableMonitor();
    try {
      if (!navigator.requestMIDIAccess) throw new Error("MIDI keyboard access is unavailable here. You can still import a MIDI file.");
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (alive.current) setAccess(result);
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setConnecting(false); }
  };
  const preview = async () => {
    stopAudio(); setError("");
    try {
      const context = new AudioContext(); audio.current = context; await context.resume();
      if (!alive.current || audio.current !== context) return;
      const base = context.currentTime + .05;
      const master = context.createGain(); master.gain.value = .15; master.connect(context.destination);
      for (const n of notes) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = "triangle"; oscillator.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
        oscillator.connect(gain); gain.connect(master);
        const start = base + n.start, end = start + n.duration;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(n.velocity / 127, start + .01); gain.gain.setTargetAtTime(0, end, .025);
        oscillator.start(start); oscillator.stop(end + .2);
      }
      setPlaying(true); playbackTimer.current = setTimeout(stopAudio, (length + .3) * 1000);
    } catch (e) { setError(`Preview unavailable: ${String(e)}`); stopAudio(); }
  };
  const length = Math.max(1, ...notes.map((n) => n.start + n.duration));
  const low = Math.min(48, ...notes.map((n) => n.pitch)), high = Math.max(72, ...notes.map((n) => n.pitch));
  const button = "rounded-lg bg-white/10 px-3 py-2 disabled:opacity-40";
  return <div className="mt-3 space-y-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={connecting || recording} onClick={connect}>{connecting ? "Detecting…" : "Detect MIDI keyboard"}</button>
      {access && <select aria-label="MIDI keyboard" className="min-w-0 max-w-full rounded-lg bg-[var(--panel)] p-2" value={device} disabled={recording} onChange={(e) => setDevice(e.target.value)}>{!inputs.length && <option value="">No keyboard detected — connect USB MIDI</option>}{inputs.map((p) => <option key={p.id} value={p.id}>{p.name || p.manufacturer || "MIDI input"}</option>)}</select>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} onClick={() => void enableMonitor()}>Enable sound</button>
      <label className="flex items-center gap-2">Monitor volume <input aria-label="MIDI monitor volume" type="range" min="0" max="1" step="0.01" value={monitorVolume} onChange={(e) => setMonitorVolume(Number(e.target.value))} />{Math.round(monitorVolume * 100)}%</label>
    </div>
    <p className="text-[var(--muted)]">Hear a synth tone as you play, including before recording. Set volume to zero to mute.</p>
    <p className="text-[var(--muted)]">Play a short tune on your MIDI keyboard. Recording starts with the first note and stops at 330 seconds. Captures notes and velocity; pedal and instrument controls are not recorded.</p>
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={!device || disabled} onClick={() => { if (recording) stop(); else { void enableMonitor(); stopAudio(); take.current = []; held.current.clear(); startTime.current = null; setNotes([]); setElapsed(0); setError(""); capturing.current = true; setRecording(true); } }}>{recording ? `Stop · ${elapsed.toFixed(1)}s` : "Record new take"}</button>
      <span role="status">{recording && !elapsed ? "Ready — play your first note" : lastNote}</span>
      <label>Tempo <input aria-label="MIDI tempo" type="number" min={30} max={240} value={bpm} disabled={recording} onChange={(e) => setBpm(Math.max(30, Math.min(240, Number(e.target.value) || 120)))} className="w-16 rounded bg-black/30 p-1" /> BPM</label>
    </div>
    {!!notes.length && <>
      <svg role="img" aria-label={`${notes.length} captured notes. Click a note to remove it.`} viewBox="0 0 600 120" className="h-28 w-full rounded-lg bg-black/30">
        {notes.map((n, i) => <rect key={i} x={n.start / length * 600} y={(high - n.pitch) / (high - low + 1) * 112} width={Math.max(3, n.duration / length * 600)} height={4} fill="var(--accent)" className="cursor-pointer" onClick={() => { if (!recording && !playing) setNotes((old) => old.filter((_, index) => index !== i)); }}><title>{n.pitch} · {n.start.toFixed(2)}s — click to delete</title></rect>)}
      </svg>
      <p>{notes.length} notes · {length.toFixed(1)}s · click a note to remove it.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={recording} onClick={() => playing ? stopAudio() : void preview()}>{playing ? "Stop preview" : "Preview tune"}</button>
        <button className={button} disabled={recording || playing} onClick={() => setNotes([])}>Clear take</button>
        <button className="rounded-lg bg-[var(--accent)] px-3 py-2 font-semibold text-black disabled:opacity-40" disabled={disabled || recording || playing} onClick={async () => { const bytes = encodeMidi(notes, bpm); await onUse(new File([bytes as BlobPart], "Keyboard-tune.mid", { type: "audio/midi" })); }}>Use this tune as reference</button>
      </div>
      <p className="text-[var(--muted)]">Preview uses a simple synth tone. Import renders the MIDI through the installed sound bank before extracting the reference.</p>
    </>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>;
}
