import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Wand2, Loader2, Plus, X, Copy, GripVertical } from "lucide-react";
import { useStore } from "../../store";
import { api } from "../../lib/api";
import type { LyricFit } from "../../lib/types";

const SECTION_TYPES = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "post-chorus",
  "bridge",
  "hook",
  "refrain",
  "interlude",
  "outro",
];

type Item = { id: string; name: string };
let sid = 0;
const mk = (name: string): Item => ({ id: `sec${sid++}`, name });

function Chip({
  item,
  onDup,
  onRemove,
}: {
  item: Item;
  onDup: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-full border border-[var(--accent-3)]/40 bg-[var(--accent-3)]/15 py-1 pl-1.5 pr-1 text-xs text-[var(--accent-3)] ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-[var(--accent-3)]/60" title="Drag to reorder">
        <GripVertical size={12} />
      </button>
      <span className="font-medium">{item.name}</span>
      <button onClick={onDup} title="Duplicate" className="rounded p-0.5 opacity-0 transition hover:bg-black/20 group-hover:opacity-100">
        <Copy size={11} />
      </button>
      <button onClick={onRemove} title="Remove" className="rounded p-0.5 opacity-60 transition hover:bg-black/20 hover:opacity-100">
        <X size={12} />
      </button>
    </div>
  );
}

export function LyricsPanel() {
  const lyrics = useStore((s) => s.lyrics);
  const setLyrics = useStore((s) => s.setLyrics);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const generateLyrics = useStore((s) => s.generateLyrics);
  const setLyricsStructure = useStore((s) => s.setLyricsStructure);
  const structure = useStore((s) => s.lyricsStructure);
  const ollama = useStore((s) => s.ollama);
  const models = useStore((s) => s.models);
  const pills = useStore((s) => s.mixerPills);
  const style = useStore((s) => s.style);
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const [fitDuration, setFitDuration] = useState(true);
  const [fit, setFit] = useState<LyricFit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let closed = false;
    const timer = setTimeout(() => {
      api.lyricFit(lyrics, pills, options.max_duration, options.bpm, style)
        .then((result) => { if (!closed) setFit(result); })
        .catch(() => { if (!closed) setFit(null); });
    }, 350);
    return () => { closed = true; clearTimeout(timer); };
  }, [lyrics, pills, options.max_duration, options.bpm, style]);

  // Local {id,name}[] mirror of the structure (stable ids for drag).
  const [items, setItems] = useState<Item[]>(() => structure.map(mk));
  useEffect(() => {
    setLyricsStructure(items.map((i) => i.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((cur) => {
      const from = cur.findIndex((i) => i.id === active.id);
      const to = cur.findIndex((i) => i.id === over.id);
      return arrayMove(cur, from, to);
    });
  };

  const llmReady = models["llm"]?.ready;
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await generateLyrics(fitDuration);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-tour="lyrics" className="glass flex min-h-full flex-col rounded-2xl p-4">
      {/* Structure chips */}
      <div className="mb-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Structure
          </span>
          <div className="relative">
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--muted)] hover:bg-white/10 hover:text-white"
            >
              <Plus size={12} /> section
            </button>
            {addOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
                <div className="glass absolute right-0 z-40 mt-1 w-40 rounded-lg p-1 shadow-2xl">
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setItems((c) => [...c, mk(t)]);
                        setAddOpen(false);
                      }}
                      className="block w-full rounded px-2 py-1 text-left text-xs capitalize text-[var(--muted)] hover:bg-white/5 hover:text-white"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it, idx) => (
                <Chip
                  key={it.id}
                  item={it}
                  onDup={() => setItems((c) => [...c.slice(0, idx + 1), mk(it.name), ...c.slice(idx + 1)])}
                  onRemove={() => setItems((c) => c.filter((x) => x.id !== it.id))}
                />
              ))}
              {items.length === 0 && (
                <span className="text-[11px] text-[var(--muted)]">Add sections →</span>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="mb-2 flex gap-2">
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="theme / idea for the AI writer"
          className="flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[var(--accent-3)]/50"
        />
        <button
          onClick={run}
          disabled={busy}
          title={
            llmReady
              ? "Write lyrics with the local AI (Qwen2.5)"
              : ollama
              ? "Write lyrics with Ollama"
              : "AI model not installed — inserts a tagged template (install in Setup)"
          }
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-3)]/20 px-3 py-2 text-sm font-medium text-[var(--accent-3)] transition hover:bg-[var(--accent-3)]/30 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Write
        </button>
      </div>

      <textarea
        aria-label="Song lyrics"
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        spellCheck={false}
        placeholder="[verse]&#10;…&#10;&#10;[chorus]&#10;…"
        className="min-h-[180px] flex-auto resize-y rounded-xl bg-black/40 p-3 font-mono text-sm leading-relaxed outline-none ring-1 ring-white/10 focus:ring-[var(--accent-3)]/40"
      />
      <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={fitDuration} onChange={(e) => setFitDuration(e.target.checked)} />Write lyrics for the selected duration ({options.max_duration}s)</label>
      {fit && fit.word_count > 0 && <div className="mt-2 text-xs" role="status">
        <p className={fit.warning ? "text-amber-300" : "text-[var(--muted)]"}>{fit.warning || `Estimated vocal fit: ${fit.estimated_min_seconds}–${fit.estimated_max_seconds}s`}</p>
        <p className="mt-1 text-[var(--muted)]">{fit.note}</p>
        {fit.warning && !fit.exceeds_duration_limit && <button className="mt-1 rounded bg-white/10 px-2 py-1" onClick={() => setOptions({ max_duration: fit.suggested_duration })}>Use {fit.suggested_duration}s duration</button>}
        {fit.exceeds_duration_limit && <p className="mt-1 text-amber-300">Consider fewer lyrics; the estimate exceeds the available duration range.</p>}
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-amber-300">{error}</p>}
      <p className="mt-1.5 text-[11px] text-[var(--muted)]">
        Sections above become <code>[tags]</code> the writer fills{" "}
        {!llmReady && !ollama && "· install the lyric model in Setup for real AI lyrics"}
      </p>
    </div>
  );
}
