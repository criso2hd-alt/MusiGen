import { useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Minimize2,
  Volume2,
  FolderDown,
  Sparkles,
  SlidersHorizontal,
  Captions,
} from "lucide-react";
import { useStore } from "../../store";
import { Visualizer } from "./Visualizer";
import { Milkdrop } from "./Milkdrop";
import { VizControls } from "./VizControls";
import { AlbumArt } from "./AlbumArt";
import { LyricsOverlay } from "./LyricsOverlay";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export function ExpandedPlayer() {
  const expanded = useStore((s) => s.playerExpanded);
  const current = useStore((s) => s.current);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);
  const volume = useStore((s) => s.volume);
  const viz = useStore((s) => s.viz);
  const vizEngine = useStore((s) => s.vizEngine);
  const setVizEngine = useStore((s) => s.setVizEngine);
  const showLyrics = useStore((s) => s.showLyrics);
  const toggleLyrics = useStore((s) => s.toggleLyrics);
  const togglePlay = useStore((s) => s.togglePlay);
  const seek = useStore((s) => s.seek);
  const setVolume = useStore((s) => s.setVolume);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const setPlayerExpanded = useStore((s) => s.setPlayerExpanded);
  const openExport = useStore((s) => s.openExport);

  // Esc always exits the maximized view (safety against getting "locked in").
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayerExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, setPlayerExpanded]);

  if (!expanded) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)]">
      <div className="app-backdrop" />
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <AlbumArt size={56} playing={isPlaying} cover={current?.cover_url ?? null} />
          <div>
            <div className="text-lg font-semibold">
              {current ? current.title : "Nothing playing"}
            </div>
            <div className="max-w-[60vw] truncate text-sm text-[var(--muted)]">
              {current ? current.style : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* engine toggle: Milkdrop (Winamp-style) vs Classic skins */}
          <div className="flex items-center gap-1 rounded-lg bg-black/30 p-1">
            <button
              onClick={() => setVizEngine("milkdrop")}
              title="Milkdrop — striking Winamp-era WebGL presets"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                vizEngine === "milkdrop"
                  ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <Sparkles size={14} /> Milkdrop
            </button>
            <button
              onClick={() => setVizEngine("classic")}
              title="Classic — the built-in bars / wave / radial skins"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                vizEngine === "classic"
                  ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <SlidersHorizontal size={14} /> Classic
            </button>
          </div>
          {vizEngine === "classic" && <VizControls />}
          <button
            onClick={toggleLyrics}
            title="Show lyrics over the visualizer"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
              showLyrics
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-white/5 hover:bg-white/10"
            }`}
          >
            <Captions size={16} /> Lyrics
          </button>
          <button
            onClick={() => current && openExport(current)}
            disabled={!current}
            title="Save this song to a folder"
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-30"
          >
            <FolderDown size={16} /> Save
          </button>
          <button
            onClick={() => setPlayerExpanded(false)}
            title="Collapse player"
            className="rounded-lg bg-white/5 p-2 text-[var(--muted)] hover:bg-white/10 hover:text-white"
          >
            <Minimize2 size={18} />
          </button>
        </div>
      </div>

      {/* big visualizer */}
      <div className="relative mx-6 min-h-0 flex-1 overflow-hidden rounded-3xl bg-black/40 ring-1 ring-white/5">
        {vizEngine === "milkdrop" ? (
          <Milkdrop playing={isPlaying} />
        ) : (
          <Visualizer config={viz} playing={isPlaying} />
        )}
        {showLyrics && current && (
          <LyricsOverlay
            lyrics={current.lyrics}
            currentTime={currentTime}
            duration={duration}
          />
        )}
      </div>

      {/* controls */}
      <div className="flex items-center gap-4 px-8 py-6">
        <span className="w-12 text-right font-mono text-sm text-[var(--muted)]">
          {fmt(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          title="Seek"
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
        />
        <span className="w-12 font-mono text-sm text-[var(--muted)]">
          {fmt(duration)}
        </span>

        <div className="mx-4 flex items-center gap-5">
          <button onClick={prev} title="Previous" className="text-[var(--muted)] hover:text-white">
            <SkipBack size={24} />
          </button>
          <button
            onClick={togglePlay}
            disabled={!current}
            title={isPlaying ? "Pause" : "Play"}
            className="grid h-14 w-14 place-items-center rounded-full bg-white text-black shadow-xl transition hover:scale-105 disabled:opacity-30"
          >
            {isPlaying ? <Pause size={26} /> : <Play size={26} className="ml-1" />}
          </button>
          <button onClick={next} title="Next" className="text-[var(--muted)] hover:text-white">
            <SkipForward size={24} />
          </button>
        </div>

        <div className="flex w-40 items-center gap-2">
          <Volume2 size={18} className="text-[var(--muted)]" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            title="Volume"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}
