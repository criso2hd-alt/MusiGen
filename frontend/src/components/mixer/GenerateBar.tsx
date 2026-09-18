import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useStore } from "../../store";

export function GenerateBar() {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const style = useStore((s) => s.style);
  const mixerPills = useStore((s) => s.mixerPills);
  const generate = useStore((s) => s.generate);
  const engine = useStore((s) => s.engine);
  const engines = useStore((s) => s.engines);
  const engineLabel = engines.find((e) => e.id === engine)?.label ?? engine;
  const [busy, setBusy] = useState(false);

  const canGen = (style.trim().length > 0 || mixerPills.length > 0) && !busy;

  const run = async () => {
    setBusy(true);
    try {
      await generate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Song title (optional)"
        className="flex-1 rounded-xl bg-black/30 px-4 py-3 text-sm outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
      />
      <button
        onClick={run}
        disabled={!canGen}
        title={
          canGen
            ? "Generate a song from your mix"
            : "Add pills or a style first"
        }
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-6 py-3 font-semibold text-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
}
