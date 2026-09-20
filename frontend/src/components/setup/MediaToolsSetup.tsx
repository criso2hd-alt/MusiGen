import { useEffect, useState } from "react";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import type { MediaCapabilities } from "../../lib/types";

type Installation = Awaited<ReturnType<typeof api.mediaInstallStatus>>;
export function MediaToolsSetup() {
  const [tools, setTools] = useState<MediaCapabilities | null>(null);
  const [install, setInstall] = useState<Installation | null>(null);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || install?.status === "installing";
  useEffect(() => {
    let alive = true;
    const refresh = async () => { try { const [t, i] = await Promise.all([api.mediaTools(), api.mediaInstallStatus()]); if (alive) { setTools(t); setInstall(i); } } catch (e) { if (alive) setError(String(e)); } };
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const run = async (kind: "reference" | "alignment") => {
    setRequesting(true); setError("");
    try { await api.installMedia(kind); setInstall(await api.mediaInstallStatus()); }
    catch (e) { setError(String(e)); } finally { setRequesting(false); }
  };
  return <div className="space-y-3 text-sm">
    <p>Install optional tools here, or reconnect an existing installation after moving the app. Downloads stay in this app’s data folder and may require several GB.</p>
    <button disabled={busy} onClick={async () => { setRequesting(true); setError(""); try { setTools(await api.repairMedia()); } catch (e) { setError(String(e)); } finally { setRequesting(false); } }} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 disabled:opacity-40"><RefreshCw size={14} />Find existing tools / repair paths</button>
    {tools && <>
      <div className="rounded-xl bg-black/25 p-3"><strong>Audio, MIDI and microphone references</strong><p className="my-2 text-xs text-[var(--muted)]">{tools.reference_missing.length || tools.midi_missing.length ? "Setup required: " + [...tools.reference_missing, ...tools.midi_missing].join(", ") : "Installed tools connected"}</p>
        <button disabled={busy} onClick={() => run("reference")} className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/20 px-3 py-2 disabled:opacity-40"><Download size={14} />Install / repair reference tools</button>
        <p className="mt-2 text-[11px] text-[var(--muted)]">Includes SheetSage2, its MERT parent, FFmpeg and a MIDI renderer. SheetSage2 is CC-BY-NC-4.0. <a href="https://huggingface.co/m-a-p/SheetSage2" target="_blank" rel="noreferrer" className="underline">Model details and license</a></p>
      </div>
      <div className="rounded-xl bg-black/25 p-3"><strong>Synchronized lyrics</strong><p className="my-2 text-xs text-[var(--muted)]">{tools.alignment_missing.length ? "Setup required: " + tools.alignment_missing.join(", ") : "Installed tools connected"}</p><button disabled={busy} onClick={() => run("alignment")} className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/20 px-3 py-2 disabled:opacity-40"><Download size={14} />Install / repair lyric timing</button></div>
    </>}
    {install?.message && <div role="status" className="flex items-start gap-2 rounded-lg bg-black/25 p-3 text-xs">{busy && <Loader2 size={14} className="shrink-0 animate-spin" />}<span>{install.message}</span>{install.status === "installing" && <button className="ml-auto underline" onClick={() => api.cancelMediaInstall().catch((e) => setError(String(e)))}>Cancel</button>}</div>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>;
}
