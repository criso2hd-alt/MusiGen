import { useState } from "react";
import { pairingChoices, chooseOther } from "../../lib/pairings";
import { useDroppable } from "@dnd-kit/core";
import { X, Trash2, Wand2, Shuffle, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { Pill, PillCategory } from "../../lib/types";

const WEIGHTS = [0.6, 1.0, 1.4];

function BoardPill({ pill, selected, onSelect }: { pill: Pill; selected: boolean; onSelect: () => void }) {
  const removePill = useStore((s) => s.removePill);
  const setPillWeight = useStore((s) => s.setPillWeight);
  const cycleWeight = () => {
    const i = WEIGHTS.indexOf(pill.weight);
    setPillWeight(pill.id, WEIGHTS[(i + 1) % WEIGHTS.length] ?? 1.0);
  };
  const bars = pill.weight >= 1.4 ? 3 : pill.weight >= 1.0 ? 2 : 1;
  return (
    <span
      className={`pill category-${pill.category} group inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium`}
      style={{
        outline: selected ? "2px solid var(--text)" : undefined,
        outlineOffset: 2,
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
      <button onClick={onSelect} aria-pressed={selected} title="Use this pill as the pairing anchor">{pill.label}</button>
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
  const catalog = useStore((s) => s.catalog);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const anchor = mixerPills.find((p) => p.id === anchorId) || mixerPills.find((p) => p.category === "genre") || mixerPills[0];
  const helpMix = (shake: boolean) => {
    if (!anchor || !catalog) return;
    const state = useStore.getState();
    const genre = mixerPills.find((p) => p.category === "genre");
    const choices = pairingChoices(anchor, catalog);
    if (genre && genre.id !== anchor.id) choices.instrument = [...new Set([...(pairingChoices(genre, catalog).instrument || []), ...(choices.instrument || [])])];
    let changed = 0;
    if (shake) {
      for (const pill of mixerPills.filter((p) => p.id !== anchor.id && p.category !== "genre")) {
        const next = chooseOther(choices[pill.category] || catalog[pill.category], useStore.getState().mixerPills.map((p) => p.label));
        if (next) { state.removePill(pill.id); state.addPill(pill.category, next); const replacement = useStore.getState().mixerPills.find((p) => p.category === pill.category && p.label === next); if (replacement) state.setPillWeight(replacement.id, pill.weight); changed++; }
      }
    }
    if (!shake || !changed) {
      for (const category of ["instrument", "instrument", "instrument", "mood"] as PillCategory[]) {
        if (category === "mood" && mixerPills.some((p) => p.category === category)) continue;
        const next = chooseOther(choices[category] || [], useStore.getState().mixerPills.map((p) => p.label));
        if (next) { state.addPill(category, next); changed++; }
      }
    }
    state.showToast(changed ? `${shake ? "Varied" : "Added"} ${changed} supporting pills around ${anchor.label}` : "No more matching pills to add", "ok");
  };
  const { setNodeRef, isOver } = useDroppable({ id: "mixer-board" });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "glass relative rounded-2xl border-2 border-dashed p-2.5 transition",
        isOver
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-white/10"
      )}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-[var(--accent)]" />
          <span className="text-xs text-[var(--muted)]">
            {mixerPills.length} pill{mixerPills.length === 1 ? "" : "s"} in the mix
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button disabled={!anchor} onClick={() => helpMix(false)} title={anchor ? `Add instruments that pair with ${anchor.label}` : "Add a pill first"} className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 disabled:opacity-40"><Sparkles size={13} /> Pair</button>
          <button disabled={!anchor} onClick={() => helpMix(true)} title="Shake up supporting pills; keep the anchor and genres" className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 disabled:opacity-40"><Shuffle size={13} /> Shake up</button>
        {mixerPills.length > 0 && (
          <button
            onClick={clearMixer}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-white/10 hover:text-white"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
        </div>
      </div>

      {anchor && <p className="mb-1 text-[10px] text-[var(--muted)]">Pairing anchor: {anchor.label} · click a pill to change</p>}
      <div className="flex min-h-14 flex-wrap content-start gap-2 p-1">
        {mixerPills.length === 0 ? (
          <div className="flex min-h-14 w-full items-center justify-center text-sm text-[var(--muted)]">
            Drop moods, genres, instruments &amp; feelings here to shape your song
          </div>
        ) : (
          mixerPills.map((p) => <BoardPill key={p.id} pill={p} selected={anchor?.id === p.id} onSelect={() => setAnchorId(p.id)} />)
        )}
      </div>
    </div>
  );
}
