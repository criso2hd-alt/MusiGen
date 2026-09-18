import { useDroppable } from "@dnd-kit/core";
import { X, Trash2, Wand2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { Pill } from "../../lib/types";

const WEIGHTS = [0.6, 1.0, 1.4];

function BoardPill({ pill }: { pill: Pill }) {
  const removePill = useStore((s) => s.removePill);
  const setPillWeight = useStore((s) => s.setPillWeight);
  const cycleWeight = () => {
    const i = WEIGHTS.indexOf(pill.weight);
    setPillWeight(pill.id, WEIGHTS[(i + 1) % WEIGHTS.length] ?? 1.0);
  };
  const bars = pill.weight >= 1.4 ? 3 : pill.weight >= 1.0 ? 2 : 1;
  return (
    <span
      className={`pill category-${pill.category} group inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium`}
      style={{
        borderColor: "color-mix(in srgb, var(--cat) 50%, transparent)",
        background: "color-mix(in srgb, var(--cat) 20%, transparent)",
        color: "color-mix(in srgb, var(--cat) 90%, white)",
      }}
    >
      <button
        onClick={cycleWeight}
        title="Adjust intensity"
        className="flex items-end gap-[2px]"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-sm"
            style={{
              height: `${5 + i * 3}px`,
              background:
                i < bars ? "var(--cat)" : "color-mix(in srgb, var(--cat) 25%, transparent)",
            }}
          />
        ))}
      </button>
      {pill.label}
      <button
        onClick={() => removePill(pill.id)}
        className="ml-0.5 rounded-full p-0.5 opacity-50 transition hover:bg-black/30 hover:opacity-100"
      >
        <X size={13} />
      </button>
    </span>
  );
}

export function MixerBoard() {
  const mixerPills = useStore((s) => s.mixerPills);
  const clearMixer = useStore((s) => s.clearMixer);
  const { setNodeRef, isOver } = useDroppable({ id: "mixer-board" });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "glass relative rounded-2xl border-2 border-dashed p-4 transition",
        isOver
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-white/10"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-[var(--accent)]" />
          <span className="text-xs text-[var(--muted)]">
            {mixerPills.length} pill{mixerPills.length === 1 ? "" : "s"} in the mix
          </span>
        </div>
        {mixerPills.length > 0 && (
          <button
            onClick={clearMixer}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-white/10 hover:text-white"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      <div className="flex min-h-[92px] flex-wrap content-start gap-2">
        {mixerPills.length === 0 ? (
          <div className="flex h-[92px] w-full items-center justify-center text-sm text-[var(--muted)]">
            Drop moods, genres, instruments &amp; feelings here to shape your song
          </div>
        ) : (
          mixerPills.map((p) => <BoardPill key={p.id} pill={p} />)
        )}
      </div>
    </div>
  );
}
