import { useEffect, useRef, useState } from "react";
import { Upload, ChevronDown } from "lucide-react";
import { referenceVocalState, referenceTempo } from "../../lib/referenceScore";
import { api } from "../../lib/api";
import type { MediaCapabilities, ReferenceMelody } from "../../lib/types";
import { useStore } from "../../store";
import { MidiRecorder } from "./MidiRecorder";
import { ReferenceRecorder } from "./ReferenceRecorder";
import { MediaTaskStatus } from "../MediaTaskStatus";

export function ReferenceImport() {
  const [source, setSource] = useState<"audio" | "midi" | "mic">("audio");
  const [sourceActive, setSourceActive] = useState(false);
  const reference = useStore((s) => s.reference);
  const abc = useStore((s) => s.abc);
  const lyrics = useStore((s) => s.lyrics);
  const bpm = useStore((s) => s.options.bpm);
  const sourceTempo = referenceTempo(abc || reference?.abc);
  const duration = useStore((s) => s.options.max_duration);
  const mode = useStore((s) => s.options.reference_mode || "original");
  const fit = useStore((s) => s.options.reference_fit_duration !== false);
  const setOptions = useStore((s) => s.setOptions);
  const fileInput = useRef<HTMLInputElement>(null);
  const taskId = useStore((s) => s.referenceTask);
  const setReference = useStore((s) => s.setReference);
  const [tools, setTools] = useState<MediaCapabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; const refresh = () => api.mediaTools().then((value) => { if (alive) setTools(value); }).catch(() => {}); void refresh(); const timer = setInterval(refresh, 5000); return () => { alive = false; clearInterval(timer); }; }, []);
  const importFile = async (file: File) => {
    setBusy(true); setError("");
    try { const task = await api.importReference(file); useStore.getState().setReferenceTask(task.id); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  };
  return <details data-tour="reference" className="glass rounded-2xl p-4 text-sm"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-2.5 font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25"><Upload size={16} /> Reference melody · audio or MIDI <ChevronDown size={16} className="ml-auto" /></summary>
    <p className="my-3 text-xs text-[var(--muted)]">Import a recording or MIDI to extract a score for a new arrangement. The score guides melody, vocal rests and length. Up to 330 seconds / 128 MB.</p>
    <div role="group" aria-label="Reference source" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
      {([['audio', 'Audio file'], ['midi', 'MIDI file / keyboard'], ['mic', 'Record a tune']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={source === id} disabled={sourceActive || busy} onClick={() => setSource(id)} className={`rounded-lg px-2 py-2 text-xs font-medium ${source === id ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-white/5'}`}>{label}</button>)}
    </div>
    {tools && tools.reference_missing.length > 0 && <p className="mb-2 text-xs text-amber-300">Reference extraction needs the optional SheetSage2 tools. <button type="button" className="underline" onClick={() => useStore.getState().setTab("setup")}>Open Setup to install or reconnect them.</button></p>}
    {source !== "mic" && <div><button type="button" onClick={() => fileInput.current?.click()} disabled={busy || !tools || !!tools.reference_missing.length || (source === "midi" && !!tools.midi_missing.length)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black transition hover:brightness-110 disabled:opacity-40"><Upload size={16} />{busy ? "Uploading…" : source === "midi" ? "Import MIDI file" : "Import audio file"}</button><input ref={fileInput} aria-label="Import reference file" className="hidden" type="file"
      accept={source === "midi" ? ".mid,.midi" : tools?.extensions.filter((ext) => ![".mid", ".midi"].includes(ext)).join(",")} onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file) await importFile(file);
      }} /></div>}
    <div hidden={source !== "midi"}>
      {tools && tools.midi_missing.length > 0 && <p className="mt-2 text-xs text-amber-300">MIDI rendering needs FluidSynth and a sound bank. <button className="underline" onClick={() => useStore.getState().setTab("setup")}>Install reference tools in Setup.</button></p>}
      <MidiRecorder visible={source === "midi"} onActive={setSourceActive} onUse={importFile} disabled={busy || !tools || !!tools.reference_missing.length || !!tools.midi_missing.length} />
    </div>
    <div hidden={source !== "mic"}><ReferenceRecorder onActive={setSourceActive} onUse={importFile} disabled={busy || !tools || !!tools.reference_missing.length} /></div>
    {busy && <p className="mt-2 text-xs">Uploading reference…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}
    {taskId && <MediaTaskStatus key={taskId} id={taskId} onReady={(task) => setReference(task.result as ReferenceMelody)} />}
    {(reference || abc) && <div className="mt-3 space-y-2 rounded-lg bg-black/30 p-3 text-xs"><p>Melody attached: {reference?.name || "Saved score"}<button className="ml-2 underline" onClick={() => setReference(null)}>Remove melody</button></p><label className="block">Reference arrangement<select aria-label="Reference arrangement" value={mode} onChange={(e) => setOptions({ reference_mode: e.target.value as "original" | "sing" | "backing" })} className="mt-1 block w-full rounded-lg bg-[var(--panel)] p-2 ring-1 ring-white/20"><option value="sing">Sing this melody · lyrics required</option><option value="backing">Backing + new vocals · lyrics required</option><option value="original">Original score · preserve vocal rests</option></select></label>
      <p className="text-[var(--muted)]">{mode === "sing" ? "Assign the reference tune to the singing voice. Add words in the Lyrics panel; the recording does not fill them in automatically." : mode === "backing" ? "Plan a new vocal melody from your lyrics and repeat the reference underneath. This adds a planning step." : "Follow the extracted score, including silent vocal parts and its original form."}</p>
      {mode !== "original" && <><label className="flex items-center gap-2"><input type="checkbox" checked={fit} onChange={(e) => setOptions({ reference_fit_duration: e.target.checked })} />Fit arrangement to song length</label><p className="text-[var(--muted)]">{fit ? "Repeat the motif across your lyric sections to approach the selected duration, in whole bars. The final audio length and singing may vary." : "Keep the reference’s approximate musical length."}</p></>}
      {sourceTempo && <p className="text-[var(--muted)]">Reference tempo: {Math.round(sourceTempo)} BPM{bpm ? ` → arranged at ${bpm} BPM. Notes stay intact; timing adapts.` : ". Set Tempo in Options to adapt it."}</p>}
      {reference?.duration ? <p>Reference length: {reference.duration.toFixed(1)}s · Generation budget: {duration}s</p> : null}
      {mode === "original" && reference?.duration && duration > reference.duration + 5 ? <p role="status" className="text-amber-300">A larger duration budget does not extend this score. The result may still end near the reference length.</p> : null}
      {mode === "original" && lyrics.replace(/\[[^\]]*\]/g, "").trim() && referenceVocalState(abc || reference?.abc) === "silent" ? <p role="status" className="text-amber-300">This score marks the vocal part as silent. Typed lyrics alone may not produce singing; it needs a vocal arrangement.</p> : null}
    </div>}
  </details>;
}
