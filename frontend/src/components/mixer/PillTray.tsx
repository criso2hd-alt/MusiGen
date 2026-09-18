import { useMemo, useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Shuffle,
  LayoutGrid,
  Palette,
  Sparkles,
  ArrowDownAZ,
  List,
  Orbit,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { PillCategory, PillSort } from "../../lib/types";
import { PillFace } from "./PillChip";
import { WatchPills } from "./WatchPills";

const CATEGORY_LABELS: Record<string, string> = {
  genre: "Genre",
  mood: "Mood",
  feeling: "Feeling",
  instrument: "Instruments",
  vocal: "Vocals",
  pacing: "Pacing",
  era: "Era",
  keyword: "Scene",
};

// hue of each category accent, for the "by colour" ordering
const CATEGORY_HUE: Record<string, number> = {
  vocal: 45,
  instrument: 160,
  genre: 187,
  pacing: 217,
  mood: 271,
  era: 330,
  feeling: 350,
  keyword: 215,
};

// coarse vibe buckets for "theme similarity"
const THEME_BUCKETS: { key: string; label: string; words: string[] }[] = [
  { key: "bright", label: "Bright & Uplifting", words: ["happy", "uplifting", "euphoric", "joy", "hopeful", "playful", "pop", "k-pop", "j-pop", "summer", "sunrise", "festival", "major"] },
  { key: "dark", label: "Dark & Heavy", words: ["dark", "melancholic", "somber", "grief", "heartbreak", "loneliness", "tense", "anxiety", "aggressive", "metal", "punk", "midnight", "rainy night"] },
  { key: "calm", label: "Calm & Dreamy", words: ["dreamy", "chill", "serenity", "nostalgic", "ambient", "lo-fi", "ballad", "slow", "acoustic guitar", "piano", "flute", "harp", "cello", "underwater", "campfire"] },
  { key: "energetic", label: "Energetic", words: ["driving", "upbeat", "frenetic", "danceable", "epic", "triumph", "rebellion", "freedom", "trap", "drum and bass", "808 bass", "live drums", "house", "electronic"] },
  { key: "organic", label: "Organic & Warm", words: ["romantic", "love", "longing", "wonder", "folk", "country", "soul", "jazz", "jazz-funk", "R&B", "violin", "saxophone", "trumpet", "organ", "choir", "strings"] },
  { key: "electronic", label: "Electronic & Retro", words: ["synthwave", "synth pads", "vocoder", "drum machine", "futuristic", "space", "city lights", "80s", "90s", "retro", "mysterious"] },
];

type Item = { category: PillCategory; label: string };
type Section = { key: string; label: string | null; items: Item[] };

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function arrange(
  catalog: Record<PillCategory, string[]>,
  sort: PillSort,
  seed: number
): Section[] {
  const cats = Object.keys(catalog) as PillCategory[];
  const flat: Item[] = cats.flatMap((c) =>
    catalog[c].map((label) => ({ category: c, label }))
  );

  if (sort === "category" || sort === "color") {
    const ordered =
      sort === "color"
        ? [...cats].sort(
            (a, b) => (CATEGORY_HUE[a] ?? 0) - (CATEGORY_HUE[b] ?? 0)
          )
        : cats;
    return ordered.map((c) => ({
      key: c,
      label: CATEGORY_LABELS[c] ?? c,
      items: catalog[c].map((label) => ({ category: c, label })),
    }));
  }

  if (sort === "az") {
    return [
      {
        key: "az",
        label: null,
        items: [...flat].sort((a, b) => a.label.localeCompare(b.label)),
      },
    ];
  }

  if (sort === "scramble") {
    return [{ key: "scramble", label: null, items: shuffle(flat, seed) }];
  }

  // theme similarity
  const bucketOf = (label: string) => {
    const l = label.toLowerCase();
    for (const b of THEME_BUCKETS) if (b.words.some((w) => l.includes(w) || w.includes(l))) return b.key;
    return "other";
  };
  return [
    ...THEME_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      items: flat.filter((it) => bucketOf(it.label) === b.key),
    })),
    { key: "other", label: "Other", items: flat.filter((it) => bucketOf(it.label) === "other") },
  ].filter((s) => s.items.length > 0);
}

function DraggablePill({ category, label }: Item) {
  const addPill = useStore((s) => s.addPill);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${category}-${label}`,
    data: { category, label },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${label} — click or drag into the mixer`}
      className={isDragging ? "dragging" : ""}
    >
      <PillFace category={category} label={label} onClick={() => addPill(category, label)} />
    </div>
  );
}

const SORTS: { id: PillSort; icon: ReactNode; label: string }[] = [
  { id: "category", icon: <LayoutGrid size={13} />, label: "By category" },
  { id: "color", icon: <Palette size={13} />, label: "By colour" },
  { id: "theme", icon: <Sparkles size={13} />, label: "By theme" },
  { id: "az", icon: <ArrowDownAZ size={13} />, label: "A–Z" },
];

export function PillTray() {
  const catalog = useStore((s) => s.catalog);
  const pillSort = useStore((s) => s.pillSort);
  const setPillSort = useStore((s) => s.setPillSort);
  const pillView = useStore((s) => s.pillView);
  const setPillView = useStore((s) => s.setPillView);
  const [scrambleSeed, setScrambleSeed] = useState(1);

  const sections = useMemo(
    () => (catalog ? arrange(catalog, pillSort, scrambleSeed) : []),
    [catalog, pillSort, scrambleSeed]
  );

  const scramble = () => {
    setScrambleSeed(Math.floor(Math.random() * 1e9) + 1);
    setPillSort("scramble");
  };

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          {pillView === "list" && (
            <>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPillSort(s.id)}
                  title={s.label}
                  className={clsx(
                    "rounded-md p-1.5 transition",
                    pillSort === s.id
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-white/10 hover:text-white"
                  )}
                >
                  {s.icon}
                </button>
              ))}
              <button
                onClick={scramble}
                title="Scramble"
                className={clsx(
                  "rounded-md p-1.5 transition",
                  pillSort === "scramble"
                    ? "bg-[var(--accent-2)]/20 text-[var(--accent-2)]"
                    : "text-[var(--muted)] hover:bg-white/10 hover:text-white"
                )}
              >
                <Shuffle size={13} />
              </button>
            </>
          )}
          <div className="ml-1 flex gap-1 rounded-md bg-black/30 p-0.5">
            <button
              onClick={() => setPillView("list")}
              title="List view"
              className={clsx(
                "rounded p-1 transition",
                pillView === "list"
                  ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              )}
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setPillView("watch")}
              title="Orbit view (magnifying pannable cloud)"
              className={clsx(
                "rounded p-1 transition",
                pillView === "watch"
                  ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              )}
            >
              <Orbit size={13} />
            </button>
          </div>
        </div>
      </div>

      {pillView === "watch" ? (
        <div className="min-h-0 flex-1">
          <WatchPills />
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-[var(--muted)]">
            Drag pills into the mixer — or click to add.
          </p>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {sections.map((sec) => (
              <div key={sec.key}>
                {sec.label && (
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {sec.label}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {sec.items.map((it) => (
                    <DraggablePill key={`${it.category}-${it.label}`} {...it} />
                  ))}
                </div>
              </div>
            ))}
            {!catalog && (
              <p className="text-xs text-[var(--muted)]">Loading palette…</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
