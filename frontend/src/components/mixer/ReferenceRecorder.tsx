import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { usePreferences } from "../../lib/preferences";

export function ReferenceRecorder({onUse, disabled, onActive}: {onActive: (active: boolean) => void; onUse: (file: File) => Promise<void>; disabled: boolean}) {
  const deviceId = usePreferences((s) => s.microphoneId);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [limit, setLimit] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); }; }, []);
  useEffect(() => { if (!clip) { setUrl(""); return; } const value = URL.createObjectURL(clip); setUrl(value); return () => URL.revokeObjectURL(value); }, [clip]);
  useEffect(() => { onActive(recording || starting); return () => onActive(false); }, [recording, starting, onActive]);
  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); };
  useEffect(() => {
    if (!recording) return;
    const start = performance.now();
    const timer = setInterval(() => { const seconds = (performance.now()-start)/1000; setElapsed(Math.min(limit, seconds)); if (seconds >= limit - .5) stop(); }, 100);
    return () => clearInterval(timer);
  }, [recording, limit]);
  const start = async () => {
    setStarting(true); setError(""); setClip(null); setElapsed(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable in this browser.");
      const input = await navigator.mediaDevices.getUserMedia({audio: {deviceId: deviceId ? {exact: deviceId} : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      if (!mounted.current) { input.getTracks().forEach((t) => t.stop()); return; }
      stream.current = input;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No supported recording format. Import an audio file instead.");
      const instance = new MediaRecorder(input, {mimeType}); recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      instance.onstop = () => {
        input.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        const suffix = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File(chunks, `Microphone-${new Date().toISOString().replace(/[:.]/g, "-")}.${suffix}`, {type: mimeType});
        if (file.size) setClip(file); else setError("No audio was recorded. Check your microphone and try again.");
      };
      instance.onerror = () => { stop(); setError("Recording stopped unexpectedly. Check your microphone."); };
      instance.start(250); setRecording(true);
    } catch (e) { stream.current?.getTracks().forEach((t) => t.stop()); setError(`Could not record: ${String(e)}. Choose a microphone in Setup and allow microphone access.`); }
    finally { if (mounted.current) setStarting(false); }
  };
  return <div className="mt-3 space-y-2 rounded-lg bg-black/20 p-3 text-xs">
    <p className="font-semibold">Hum or sing a reference</p>
    <div className="flex flex-wrap items-center gap-2">
      {recording ? <button onClick={stop} className="flex items-center gap-2 rounded-lg bg-red-500/25 px-3 py-2"><Square size={14} />Stop recording · {Math.ceil(elapsed)}s / {limit}s</button> : <button disabled={disabled || starting} onClick={start} className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/20 px-3 py-2 disabled:opacity-40"><Mic size={14} />{starting ? "Opening microphone…" : "Record microphone"}</button>}
      <label>Limit <select aria-label="Recording time limit" disabled={recording || starting} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded bg-[var(--panel)] p-1">{[15,30,60,120,240,330].map((n) => <option key={n} value={n}>{n}s</option>)}</select></label>
    </div>
    {recording && <progress aria-label="Recording time" max={limit} value={elapsed} className="w-full" />}
    <p className="text-[var(--muted)]">Start with a short, clear melody. Stops automatically at the selected limit. Microphone selection is in Setup.</p>
    {url && <><audio controls src={url} className="h-9 w-full" /><button disabled={disabled} onClick={async () => { if (clip) await onUse(clip); }} className="rounded-lg bg-[var(--accent)] px-3 py-2 font-semibold text-black disabled:opacity-40">Use this recording as reference</button></>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>;
}
