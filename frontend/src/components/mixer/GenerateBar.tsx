import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useStore } from "../../store";
import { dock } from "../workspace/dock";

export function GenerateBar() {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const style = useStore((s) => s.style);
  const mixerPills = useStore((s) => s.mixerPills);
  const generate = useStore((s) => s.generate);
  const engine = useStore((s) => s.engine);
  const engines = useStore((s) => s.engines);
  const abc = useStore((s) => s.abc);
  const lyrics = useStore((s) => s.lyrics);
  const referenceMode = useStore((s) => s.options.reference_mode);
  const setOptions = useStore((s) => s.setOptions);
  const needsLyrics = !!abc && (referenceMode === "sing" || referenceMode === "backing") && !lyrics.split(/\r?\n/).some((line) => line.trim() && !/^\s*\[[^\]]+\]\s*$/.test(line));
  const engineLabel = engines.find((e) => e.id === engine)?.label ?? engine;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canGen = (style.trim().length > 0 || mixerPills.length > 0) && !busy && !needsLyrics;

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await generate();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-2">
      <label className="min-w-0 flex-1 text-xs text-[var(--muted)]">
        Song title · optional
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Leave blank for a title from your lyrics or style"
        className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm text-[var(--text)] outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
      />
      </label>
      <button
        onClick={run}
        disabled={!canGen}
        title={
          canGen
            ? "Generate a song from your mix"
            : needsLyrics ? "Add lyrics or switch to Original score" : "Add pills or a style first"
        }
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2 font-semibold text-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Sparkles size={18} />
        )}
        Generate
        <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] uppercase">
          {engineLabel}
        </span>
      </button>
      {needsLyrics && <div role="status" className="basis-full text-xs text-amber-300">
        <p>{referenceMode === "backing" ? "Backing + new vocals" : "Sing this melody"} needs words to sing. Add lyrics in the Lyrics panel, or use its Write button. A recording supplies the tune, not written lyrics.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" className="underline" onClick={() => dock.focus("lyrics")}>Open Lyrics</button>
          <button type="button" className="underline" onClick={() => { setOptions({ reference_mode: "original" }); setError(""); }}>Use Original score instead</button>
        </div>
      </div>}
      {error && !needsLyrics && <p role="alert" className="basis-full text-sm text-amber-300">{error}</p>}
    </div>
  );
}
