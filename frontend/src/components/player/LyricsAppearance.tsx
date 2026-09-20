import { usePreferences } from "../../lib/preferences";

export function LyricsAppearance() {
  const prefs = usePreferences();
  return <details className="relative text-xs">
    <summary className="cursor-pointer rounded-lg bg-white/5 px-3 py-2.5">Lyrics appearance</summary>
    <div className="absolute right-0 z-[80] mt-2 w-64 space-y-4 rounded-xl bg-[#171b29] p-4 shadow-2xl ring-1 ring-white/15">
      <label className="block">Text size · {prefs.lyricSize}px<input aria-label="Lyric text size" type="range" min={18} max={48} value={prefs.lyricSize} onChange={(e) => prefs.update({ lyricSize: Number(e.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /></label>
      <label className="block">Backdrop · {prefs.lyricBackdrop}%<input aria-label="Lyric backdrop opacity" type="range" min={40} max={100} value={prefs.lyricBackdrop} onChange={(e) => prefs.update({ lyricBackdrop: Number(e.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /></label>
      <label className="flex justify-between gap-2">Position<select aria-label="Lyric position" value={prefs.lyricPosition} onChange={(e) => prefs.update({ lyricPosition: e.target.value as "bottom" | "center" })} className="rounded bg-black/40 p-1"><option value="bottom">Bottom</option><option value="center">Center</option></select></label>
      <label className="flex justify-between gap-2">Display<select aria-label="Lyric display" value={prefs.lyricDisplay} onChange={(e) => prefs.update({ lyricDisplay: e.target.value as "phrases" | "all" })} className="rounded bg-black/40 p-1"><option value="phrases">Short phrases</option><option value="all">All lyrics</option></select></label>
      <p className="text-[var(--muted)]">Use Synchronize lyrics in song details for word timing. Other scrolling is approximate.</p>
    </div>
  </details>;
}
