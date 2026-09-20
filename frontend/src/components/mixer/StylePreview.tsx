import { Loader2, Terminal, Sparkles, Wand2 } from "lucide-react";
import { useStore } from "../../store";

export function StylePreview() {
  const style = useStore((s) => s.style);
  const warning = useStore((s) => s.promptWarning);
  const composing = useStore((s) => s.composing);
  const usedLlm = useStore((s) => s.usedLlm);
  const extra = useStore((s) => s.extra);
  const setExtra = useStore((s) => s.setExtra);
  const refineStyleAI = useStore((s) => s.refineStyleAI);

  return (
    <div className="glass rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-[var(--accent)]" />
          <h2 className="text-sm font-semibold tracking-wide">
            Generated Prompt
          </h2>

        </div>
        <div className="flex items-center gap-2">
          {composing ? (
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Loader2 size={13} className="animate-spin" /> writing…
            </span>
          ) : usedLlm ? (
            <span className="flex items-center gap-1 rounded-full bg-[var(--accent-2)]/20 px-2 py-1 text-[11px] font-medium text-[var(--accent-2)]">
              <Sparkles size={11} /> AI-refined
            </span>
          ) : null}
          <button
            onClick={refineStyleAI}
            disabled={composing}
            title="Rewrite this prompt with the AI writer"
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-2)]/20 px-2.5 py-1 text-xs font-medium text-[var(--accent-2)] transition hover:bg-[var(--accent-2)]/30 disabled:opacity-50"
          >
            <Wand2 size={13} /> AI write
          </button>
        </div>
      </div>

      <div className="max-h-24 min-h-10 overflow-y-auto rounded-xl bg-black/40 p-2 font-mono text-sm leading-relaxed text-[var(--accent)]">
        {style || (
          <span className="text-[var(--muted)]">
            Your style prompt will appear here as you add pills…
          </span>
        )}
      </div>

      <input
        aria-label="Additional style instructions"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="+ add your own words (e.g. 'sung in Portuguese, tape hiss')"
        className="mt-2 w-full rounded-xl bg-black/30 px-3 py-1.5 text-sm outline-none ring-1 ring-white/10 transition focus:ring-[var(--accent)]/50"
      />
      {warning && <p role="status" className="mt-2 text-sm text-amber-300">{warning}</p>}
    </div>
  );
}
