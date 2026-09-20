import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Shuffle,
  X,
  LayoutGrid,
  Palette,
  Sparkles,
  ArrowDownAZ,
  ArrowUpAZ,
  List,
  Orbit,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { PillCategory, PillSort } from "../../lib/types";
import { PillFace } from "./PillChip";
import { usePreferences } from "../../lib/preferences";
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
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [descending, setDescending] = useState(false);
  const [manage, setManage] = useState(false);
  const fontSize = usePreferences((s) => s.ingredientSize);
  const hidden = usePreferences((s) => s.hiddenIngredients);
  const update = usePreferences((s) => s.update);
  const filteredCatalog = useMemo(() => catalog ? Object.fromEntries(Object.entries(catalog).map(([category, labels]) => [category, labels.filter((label) =>
    !hidden.includes(`${category}:${label}`) && `${category} ${label}`.toLowerCase().includes(query.trim().toLowerCase()))])) as Record<PillCategory, string[]> : null, [catalog, hidden, query]);

  const sections = useMemo(
    () => (filteredCatalog ? arrange(filteredCatalog, pillSort, scrambleSeed).map((section) => ({ ...section, items: pillSort === "az" && descending ? [...section.items].reverse() : section.items })).filter((section) => section.items.length) : []),
    [filteredCatalog, pillSort, scrambleSeed, descending]
  );

  const orbitItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const scramble = () => {
    setScrambleSeed(Math.floor(Math.random() * 1e9) + 1);
    setPillSort("scramble");
  };

  return (
    <div data-tour="ingredients" className="glass ingredient-tray flex h-full min-h-0 flex-col rounded-2xl p-4" style={{ "--ingredient-size": `${fontSize}px` } as React.CSSProperties}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-24 flex-1"><input ref={searchInput} aria-label="Search ingredients" placeholder="Search ingredients..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg bg-black/30 py-2 pl-3 pr-9 text-sm ring-1 ring-white/10" />{query && <button aria-label="Clear ingredient search" title="Clear search" onClick={() => { setQuery(""); searchInput.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] hover:text-white"><X size={14} /></button>}</div>
        <label className="flex items-center gap-1 text-xs">Text <select aria-label="Ingredient text size" value={fontSize} onChange={(e) => update({ ingredientSize: Number(e.target.value) })} className="rounded bg-[#171b29] px-2 py-1.5"><option value={10}>Small</option><option value={12}>Medium</option><option value={15}>Large</option></select></label>
        <button aria-expanded={manage} onClick={() => setManage(!manage)} className="rounded-lg bg-white/10 px-2 py-2 text-xs">Customize</button>
      </div>
      {manage && <div className="mb-3 max-h-52 shrink-0 overflow-auto rounded-lg bg-black/30 p-3 text-xs">
        <div className="mb-2 flex justify-between"><span>Visible ingredients</span><button className="underline" onClick={() => update({ hiddenIngredients: [] })}>Show all</button></div>
        {catalog && Object.entries(catalog).flatMap(([category, labels]) => labels.filter((label) => `${category} ${label}`.toLowerCase().includes(query.toLowerCase())).map((label) => {
          const key = `${category}:${label}`;
          return <label key={key} className="mr-3 inline-flex items-center gap-1 py-1"><input type="checkbox" checked={!hidden.includes(key)} onChange={() => update({ hiddenIngredients: hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key] })} />{label}</label>;
        }))}
      </div>}
      <div className="mb-2 flex items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          {(
            <>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { if (s.id === "az" && pillSort === "az") setDescending(!descending); setPillSort(s.id); }}
                  title={s.id === "az" ? `Alphabetical ${descending ? "Z-A" : "A-Z"} - click to reverse` : s.label}
                  className={clsx(
                    "rounded-md p-1.5 transition",
                    pillSort === s.id
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-white/10 hover:text-white"
                  )}
                >
                  {s.id === "az" && descending ? <ArrowUpAZ size={13} /> : s.icon}
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

      {catalog && orbitItems.length === 0 && <p role="status" className="mb-3 text-sm text-[var(--muted)]">No visible ingredients match. Try another search or Customize / Show all.</p>}
      {pillView === "watch" ? (
        <div className="min-h-0 flex-1">
          <WatchPills items={orbitItems} fontSize={fontSize} />
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
