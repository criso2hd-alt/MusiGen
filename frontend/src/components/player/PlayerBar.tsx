import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Maximize2,
  FolderDown,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { VizConfig } from "../../lib/types";
import { Visualizer } from "./Visualizer";
import { Milkdrop } from "./Milkdrop";
import { VizControls } from "./VizControls";
import { AlbumArt } from "./AlbumArt";

/**
 * Crossfades between the lightweight canvas visualizer and the full Milkdrop
 * engine. When the docked player is dragged past ~1/3 of the screen height it
 * fades into Milkdrop; shrinking it fades back to the simple skin.
 */
function PlayerViz({
  playing,
  viz,
  big,
}: {
  playing: boolean;
  viz: VizConfig;
  big: boolean;
}) {
  const [mountMd, setMountMd] = useState(big);
  const [mdVisible, setMdVisible] = useState(big);

  useEffect(() => {
    if (big) {
      setMountMd(true);
      const r = requestAnimationFrame(() => setMdVisible(true));
      return () => cancelAnimationFrame(r);
    }
    setMdVisible(false);
    const t = setTimeout(() => setMountMd(false), 550);
    return () => clearTimeout(t);
  }, [big]);

  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: mdVisible ? 0 : 1 }}
      >
        <Visualizer config={viz} playing={playing} />
      </div>
      {mountMd && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: mdVisible ? 1 : 0 }}
        >
          <Milkdrop playing={playing} />
        </div>
      )}
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

function seedOf(id?: string) {
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function PlayerBar() {
  const current = useStore((s) => s.current);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);
  const volume = useStore((s) => s.volume);
  const viz = useStore((s) => s.viz);
  const playerH = useStore((s) => s.playerH);
  const playerExpanded = useStore((s) => s.playerExpanded);
  const togglePlay = useStore((s) => s.togglePlay);

  // Auto-switch to the Milkdrop visualizer when the player is ≥ 1/3 of the screen.
  const [winH, setWinH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const bigViz = !playerExpanded && playerH >= winH / 3;
  const seek = useStore((s) => s.seek);
  const setVolume = useStore((s) => s.setVolume);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const setPlayerExpanded = useStore((s) => s.setPlayerExpanded);
  const openExport = useStore((s) => s.openExport);

  return (
    <div
      className="glass mx-3 mb-3 flex items-stretch gap-4 rounded-2xl p-3"
      style={{ height: playerH }}
    >
      {/* track info */}
      <div className="flex w-60 items-center gap-3">
        <AlbumArt
          size={64}
          playing={isPlaying}
          cover={current?.cover_url ?? null}
          seed={seedOf(current?.id)}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={current?.title}>
            {current ? current.title : "Nothing playing"}
          </div>
          <div className="truncate text-xs text-[var(--muted)]" title={current?.style}>
            {current ? current.style : "Generate a track to begin"}
          </div>
        </div>
      </div>

      {/* center: visualizer + transport + seek */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black/40">
          {!playerExpanded && <PlayerViz playing={isPlaying} viz={viz} big={bigViz} />}
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <VizControls />

          </div>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button onClick={prev} title="Previous" className="text-[var(--muted)] transition hover:text-white">
            <SkipBack size={18} />
          </button>
          <button
            onClick={togglePlay}
            disabled={!current}
            title={isPlaying ? "Pause" : "Play"}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow transition hover:scale-105 disabled:opacity-30"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={next} title="Next" className="text-[var(--muted)] transition hover:text-white">
            <SkipForward size={18} />
          </button>

          <span className="w-10 text-right font-mono text-xs text-[var(--muted)]">
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
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
          />
          <span className="w-10 font-mono text-xs text-[var(--muted)]">
            {fmt(duration)}
          </span>
        </div>
      </div>

      {/* right: save + volume */}
      <div className="flex w-40 flex-col justify-center gap-2">
        <button data-tour="visualizer" onClick={() => setPlayerExpanded(true)} className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-2)]/20 px-2 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--accent-2)]/30"><Maximize2 size={14} /> Full-screen visualizer</button>
        <button
          onClick={() => current && openExport(current)}
          disabled={!current}
          title="Save this song to a folder"
          className={clsx(
            "flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs font-medium transition hover:bg-white/10",
            !current && "opacity-30"
          )}
        >
          <FolderDown size={14} /> Save
        </button>
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="text-[var(--muted)]" />
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
