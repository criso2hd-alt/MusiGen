import { useMemo, useRef } from "react";

/**
 * Lyrics shown over the visualizer. YuE2 gives no per-line timing, so this is a
 * smooth auto-scroll tied to playback progress (not word-synced karaoke).
 * Section tags like [chorus] are rendered as subtle dividers.
 */
export function LyricsOverlay({
  lyrics,
  currentTime,
  duration,
}: {
  lyrics: string;
  currentTime: number;
  duration: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(
    () =>
      (lyrics || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    [lyrics]
  );

  // Progress-driven auto-scroll: map 0..1 of the song to the scrollable range.
  const frac = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const el = scrollRef.current;
  const inner = innerRef.current;
  if (el && inner) {
    const range = Math.max(0, inner.scrollHeight - el.clientHeight);
    el.scrollTop = range * frac;
  }

  if (lines.length === 0) {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-white/60 backdrop-blur-sm">
          No lyrics for this track
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center">
      <div
        ref={scrollRef}
        className="mask-fade h-full w-full max-w-2xl overflow-hidden px-6"
      >
        <div ref={innerRef} className="flex flex-col items-center gap-3 py-[38%]">
          {lines.map((line, i) => {
            const tag = /^\[.+\]$/.test(line);
            return tag ? (
              <div
                key={i}
                className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]/70"
              >
                {line.replace(/[[\]]/g, "")}
              </div>
            ) : (
              <div
                key={i}
                className="text-center text-lg font-semibold leading-snug text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
