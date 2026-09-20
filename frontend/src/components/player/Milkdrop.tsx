import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Dice5,
  Repeat,
  Search,
  Maximize,
  ChevronDown,
  Pin,
  PinOff,
  Eye,
  EyeOff,
} from "lucide-react";
import butterchurnImport from "butterchurn";
import butterchurnPresetsImport from "butterchurn-presets";
import butterchurnPresetsExtraImport from "butterchurn-presets/lib/butterchurnPresetsExtra.min.js";
import butterchurnPresetsExtra2Import from "butterchurn-presets/lib/butterchurnPresetsExtra2.min.js";
import { initialPreset } from "../../lib/presetSelection";
import { audioEngine } from "../../lib/audio";

// These packages ship webpack UMD bundles, so the real object can sit under
// `.default` depending on the interop. Unwrap defensively.
const butterchurn: typeof butterchurnImport =
  (butterchurnImport as any)?.createVisualizer
    ? butterchurnImport
    : (butterchurnImport as any).default;
const unwrapPresets = (m: any) => (m?.getPresets ? m : m?.default);
const PRESET_PACKS = [
  butterchurnPresetsImport,
  butterchurnPresetsExtraImport,
  butterchurnPresetsExtra2Import,
].map(unwrapPresets);

const ls = {
  get: (k: string, f: string) => {
    try {
      return localStorage.getItem(k) ?? f;
    } catch {
      return f;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const AUTO_CYCLE_MS = 16_000;
const BLEND_SEC = 3.2;

// Load + merge + sort all preset packs once (module-level cache).
let PRESET_ENTRIES: [string, unknown][] | null = null;
function getPresetEntries(): [string, unknown][] {
  if (PRESET_ENTRIES) return PRESET_ENTRIES;
  const merged: Record<string, unknown> = {};
  for (const pack of PRESET_PACKS) {
    try {
      Object.assign(merged, pack.getPresets());
    } catch {
      /* ignore a pack that fails to load */
    }
  }
  PRESET_ENTRIES = Object.entries(merged).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  return PRESET_ENTRIES;
}

/** Strip the "author - " / rating suffix noise for a cleaner display name. */
function prettyName(raw: string) {
  return raw.replace(/^\d+\s*[-–]\s*/, "").replace(/\.milk$/i, "").trim();
}

export function Milkdrop({ playing }: { playing: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<ReturnType<typeof butterchurn.createVisualizer> | null>(
    null
  );
  const raf = useRef(0);
  const idleTimer = useRef<number>(0);

  const entries = useMemo(getPresetEntries, []);
  const [startIdx] = useState(() => initialPreset(entries.map((entry) => entry[0]),
    ls.get("mg.mdDefault", ""), ls.get("mg.mdPresetName", ""), Number(ls.get("mg.mdPreset", "-1"))));

  const [idx, setIdx] = useState(startIdx);
  const [auto, setAuto] = useState(false);
  const [defaultName, setDefaultName] = useState(() => ls.get("mg.mdDefault", ""));
  const [showUi, setShowUi] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Presets the user has turned OFF in the rotation (by name), persisted.
  const [disabled, setDisabled] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(ls.get("mg.mdDisabled", "[]")));
    } catch {
      return new Set();
    }
  });
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const persistDisabled = (s: Set<string>) => {
    ls.set("mg.mdDisabled", JSON.stringify([...s]));
    setDisabled(new Set(s));
  };
  const toggleEnabled = (name: string) => {
    const s = new Set(disabledRef.current);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    persistDisabled(s);
  };
  const enabledCount = entries.filter(([name]) => !disabled.has(name)).length;

  const idxRef = useRef(idx);
  idxRef.current = idx;

  const loadPreset = (i: number, blend = BLEND_SEC) => {
    const entry = entries[i];
    if (!entry || !vizRef.current) return;
    vizRef.current.loadPreset(entry[1], blend);
    ls.set("mg.mdPreset", String(i));
    ls.set("mg.mdPresetName", entry[0]);
  };

  const goto = (i: number) => {
    const n = ((i % entries.length) + entries.length) % entries.length;
    setIdx(n);
    loadPreset(n);
  };

  // Indices still enabled for the auto-cycle / next / prev / random rotation.
  // Never returns empty (if everything is off, fall back to all).
  const enabledIndices = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (!disabledRef.current.has(entries[i][0])) out.push(i);
    }
    return out;
  };
  const nextPreset = () => {
    const en = enabledIndices();
    if (!en.length) return;
    const cur = idxRef.current;
    goto(en.find((i) => i > cur) ?? en[0]);
  };
  const prevPreset = () => {
    const en = enabledIndices();
    if (!en.length) return;
    const cur = idxRef.current;
    const before = en.filter((i) => i < cur);
    goto(before.length ? before[before.length - 1] : en[en.length - 1]);
  };
  const randomPreset = () => {
    const en = enabledIndices();
    if (!en.length) return;
    goto(en[Math.floor(Math.random() * en.length)]);
  };

  // --- init butterchurn once ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = audioEngine.getContext();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viz = butterchurn.createVisualizer(ctx, canvas, {
      width: wrap.clientWidth,
      height: wrap.clientHeight,
      pixelRatio: dpr,
      textureRatio: 1,
    });
    viz.connectAudio(audioEngine.getSourceNode());
    vizRef.current = viz;
    loadPreset(idxRef.current, 0);

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      viz.setRendererSize(w * dpr, h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const render = () => {
      viz.render();
      raf.current = requestAnimationFrame(render);
    };
    raf.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf.current);
      ro.disconnect();
      vizRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- auto-cycle presets ---
  useEffect(() => {
    if (!auto || !playing) return;
    const t = window.setInterval(() => nextPreset(), AUTO_CYCLE_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, playing]);

  // --- auto-hide the overlay when the mouse is idle ---
  const wake = () => {
    setShowUi(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (!pickerOpen) setShowUi(false);
    }, 2800);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- keyboard: ← / → change presets ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true], [role=dialog]"))) return;
      if (e.key === "ArrowRight") {
        wake();
        nextPreset();
      } else if (e.key === "ArrowLeft") {
        wake();
        prevPreset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAuto = () => {
    const v = !auto;
    setAuto(v);

  };

  const currentName = entries[idx]?.[0] ?? "";
  const isDefault = !!defaultName && defaultName === currentName;
  const togglePin = () => {
    const v = isDefault ? "" : currentName;
    ls.set("mg.mdDefault", v);
    setDefaultName(v);
  };

  const goFullscreen = () => {
    const el = wrapRef.current?.closest("[data-visualizer-stage]") ?? wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  const filtered = query.trim()
    ? entries
        .map((e, i) => ({ i, name: prettyName(e[0]) }))
        .filter((x) => x.name.toLowerCase().includes(query.trim().toLowerCase()))
    : entries.map((e, i) => ({ i, name: prettyName(e[0]) }));

  return (
    <div
      ref={wrapRef}
      onMouseMove={wake}
      className="group relative h-full w-full overflow-hidden bg-black"
    >
      <canvas ref={canvasRef} className="h-full w-full" />

      {/* preset name badge */}
      <div
        className={`pointer-events-none absolute left-4 top-3 flex max-w-[70%] items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm transition-opacity duration-300 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        {isDefault && <Pin size={12} className="shrink-0 text-[var(--accent)]" />}
        <span className="truncate">{prettyName(currentName)}</span>
        <span className="shrink-0 text-white/40">
          {idx + 1}/{entries.length}
        </span>
      </div>

      {/* controls */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-300 ${
          showUi ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <div aria-label="Visualizer preset controls" className="flex items-center gap-1 rounded-2xl bg-black/80 px-2 py-1.5 backdrop-blur-md ring-1 ring-white/10">
          <span className="px-1 text-[10px] uppercase tracking-wider text-white/60">Visuals</span>
          <IconBtn onClick={prevPreset} title="Previous visualizer preset (←)">
            <ArrowLeft size={16} />
          </IconBtn>
          <IconBtn onClick={randomPreset} title="Random preset">
            <Dice5 size={16} /><span className="ml-1 text-xs">Random</span>
          </IconBtn>
          <IconBtn onClick={nextPreset} title="Next visualizer preset (→)">
            <ArrowRight size={16} />
          </IconBtn>
          <div className="mx-1 h-5 w-px bg-white/15" />
          <IconBtn
            onClick={toggleAuto}
            title={auto ? "Auto-cycle: on" : "Auto-cycle: off"}
            active={auto}
          >
            <Repeat size={16} /><span className="ml-1 whitespace-nowrap text-xs">Auto: {auto ? "On" : "Off"}</span>
          </IconBtn>
          <IconBtn
            onClick={togglePin}
            title={
              isDefault
                ? "This is your default preset — click to unpin"
                : "Pin this preset as the default (loads first every time)"
            }
            active={isDefault}
          >
            {isDefault ? <Pin size={16} /> : <PinOff size={16} />}
          </IconBtn>
          <button
            onClick={() => {
              setPickerOpen((o) => !o);
              wake();
            }}
            title="Browse presets"
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            Presets <ChevronDown size={13} />
          </button>
          <IconBtn onClick={goFullscreen} title="Fullscreen">
            <Maximize size={16} />
          </IconBtn>
        </div>

        {/* preset picker */}
        {pickerOpen && (
          <div className="absolute bottom-full left-1/2 mb-2 w-80 -translate-x-1/2 rounded-2xl bg-black/80 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${entries.length} presets…`}
                className="w-full rounded-lg bg-white/5 py-1.5 pl-8 pr-2 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
              />
            </div>
            <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-white/50">
              <span>
                <span className="text-[var(--accent)]">{enabledCount}</span> of{" "}
                {entries.length} in rotation · eye = include in auto-cycle
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => persistDisabled(new Set())}
                  className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white"
                  title="Enable all presets"
                >
                  All
                </button>
                <button
                  onClick={() => persistDisabled(new Set(entries.map((e) => e[0])))}
                  className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white"
                  title="Disable all presets"
                >
                  None
                </button>
              </div>
            </div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {filtered.map((p) => {
                const name = entries[p.i]?.[0] ?? "";
                const off = disabled.has(name);
                return (
                  <div
                    key={p.i}
                    className={`flex items-center gap-1 rounded-md pr-1 text-xs ${
                      p.i === idx
                        ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <button
                      onClick={() => toggleEnabled(name)}
                      title={off ? "Disabled — click to include in auto-cycle" : "Enabled — click to exclude"}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded ${
                        off ? "text-white/30" : "text-[var(--accent-2)]"
                      } hover:bg-white/10`}
                    >
                      {off ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      onClick={() => {
                        goto(p.i);
                        setPickerOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left ${
                        off ? "opacity-40" : ""
                      }`}
                    >
                      {name === defaultName && (
                        <Pin size={11} className="shrink-0 text-[var(--accent)]" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`inline-flex items-center rounded-xl p-2 transition ${
        active
          ? "bg-[var(--accent)]/25 text-[var(--accent)]"
          : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
