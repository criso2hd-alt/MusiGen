import { useState } from "react";
import { usePreferences } from "../../lib/preferences";

export function MicrophoneSetup() {
  const selected = usePreferences((s) => s.microphoneId);
  const update = usePreferences((s) => s.update);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const discover = async () => {
    setBusy(true); setError("");
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable in this browser.");
      stream = await navigator.mediaDevices.getUserMedia({audio: true});
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
    } catch (e) { setError(`Microphone access failed: ${String(e)}. Check Windows microphone privacy settings and allow access for this app.`); }
    finally { stream?.getTracks().forEach((t) => t.stop()); setBusy(false); }
  };
  return <div className="space-y-3 text-sm">
    <p>Choose the microphone used for humming or singing a reference. It records only when you press Record on Create.</p>
    <button disabled={busy} onClick={discover} className="rounded-lg bg-[var(--accent)]/20 px-3 py-2">{busy ? "Finding microphones…" : "Allow access / refresh microphones"}</button>
    <label className="block">Recording microphone<select aria-label="Recording microphone" value={selected || ""} onChange={(e) => update({microphoneId: e.target.value})} className="mt-1 block w-full rounded-lg bg-[var(--panel)] p-2 ring-1 ring-white/15">
      <option value="">System default microphone</option>
      {selected && !devices.some((d) => d.deviceId === selected) && <option value={selected}>Saved microphone · refresh to check availability</option>}
      {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}
    </select></label>
    {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
  </div>;
}
