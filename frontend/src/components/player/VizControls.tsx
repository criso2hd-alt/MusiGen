import { useState } from "react";
import {
  BarChart3,
  Activity,
  Waves,
  Radar,
  AudioLines,
  Radio,
  Shuffle,
  Heart,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { Skin } from "../../lib/types";

const SKINS: { id: Skin; icon: ReactNode; label: string }[] = [
  { id: "bars", icon: <BarChart3 size={15} />, label: "Bars" },
  { id: "mirror", icon: <AudioLines size={15} />, label: "Mirror" },
  { id: "wave", icon: <Activity size={15} />, label: "Oscilloscope" },
  { id: "aurora", icon: <Waves size={15} />, label: "Aurora" },
  { id: "radial", icon: <Radar size={15} />, label: "Radial" },
  { id: "ripple", icon: <Radio size={15} />, label: "Ripple" },
];

export function SkinSwitcher() {
  const skin = useStore((s) => s.viz.skin);
  const setViz = useStore((s) => s.setViz);
  return (
    <div className="flex flex-wrap gap-1">
      {SKINS.map((s) => (
        <button
          key={s.id}
          onClick={() => setViz({ skin: s.id })}
          title={`Visualizer: ${s.label}`}
          className={clsx(
            "rounded-md p-1.5 transition",
            skin === s.id
              ? "bg-[var(--accent)]/25 text-[var(--accent)]"
              : "bg-black/30 text-[var(--muted)] hover:text-white"
          )}
        >
          {s.icon}
        </button>
      ))}
    </div>
  );
}

export function VizControls({ compact = false }: { compact?: boolean }) {
  const randomizeViz = useStore((s) => s.randomizeViz);
  const saveVizPreset = useStore((s) => s.saveVizPreset);
  const favorites = useStore((s) => s.vizFavorites);
  const applyVizPreset = useStore((s) => s.applyVizPreset);
  const deleteVizPreset = useStore((s) => s.deleteVizPreset);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {!compact && <SkinSwitcher />}
      <button
        onClick={randomizeViz}
        title="Randomize colors, size & style"
        className="rounded-md bg-black/30 p-1.5 text-[var(--muted)] transition hover:text-[var(--accent-2)]"
      >
        <Shuffle size={15} />
      </button>
      <button
        onClick={() => saveVizPreset("")}
        title="Save current look as a favorite preset"
        className="rounded-md bg-black/30 p-1.5 text-[var(--muted)] transition hover:text-[var(--accent-3)]"
      >
        <Heart size={15} />
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          title="Favorite presets"
          className={clsx(
            "rounded-md p-1.5 transition",
            open
              ? "bg-[var(--accent)]/20 text-[var(--accent)]"
              : "bg-black/30 text-[var(--muted)] hover:text-white"
          )}
        >
          <Star size={15} />
        </button>
        {open && (
          <div className="glass absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl p-2 shadow-2xl">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Presets
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-[var(--muted)] hover:text-white"
              >
                <X size={13} />
              </button>
            </div>
            {favorites.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[var(--muted)]">
                No presets yet. Randomize a look you like, then tap the heart.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {favorites.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
                  >
                    <div className="flex gap-1">
                      {p.config.colors.map((c, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        applyVizPreset(p.id);
                        setOpen(false);
                      }}
                      className="flex-1 truncate text-left text-xs"
                      title={`Apply "${p.name}" (${p.config.skin})`}
                    >
                      {p.name}
                    </button>
                    <button
                      onClick={() => deleteVizPreset(p.id)}
                      title="Delete preset"
                      className="rounded p-0.5 text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--accent-3)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
