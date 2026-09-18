import { Lock } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";

export function EngineSelector() {
  const engines = useStore((s) => s.engines);
  const engine = useStore((s) => s.engine);
  const setEngine = useStore((s) => s.setEngine);
  const selected = engines.find((e) => e.id === engine);

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {engines.map((e) => (
        <button
          key={e.id}
          disabled={!e.ready}
          onClick={() => e.ready && setEngine(e.id)}
          title={e.ready ? e.desc : e.note}
          className={clsx(
            "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
            engine === e.id
              ? "bg-[var(--accent)]/20 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
              : e.ready
              ? "bg-black/30 text-[var(--text)] hover:bg-white/5"
              : "bg-black/20 text-[var(--muted)] opacity-60"
          )}
        >
          <span className="flex flex-col">
            <span className="font-medium">{e.label}</span>
            <span className="text-[11px] text-[var(--muted)]">{e.desc}</span>
          </span>
          {!e.ready && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--warn)]" title={e.note}>
              <Lock size={11} /> setup
            </span>
          )}
        </button>
      ))}
      {selected && !selected.ready && (
        <p className="mt-1 text-[11px] text-[var(--warn)]">{selected.note}</p>
      )}
    </div>
  );
}
