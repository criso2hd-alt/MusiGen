import { useEffect, useMemo, useRef } from "react";
import { usePreferences } from "../../lib/preferences";
import type { LyricTiming } from "../../lib/types";
import { captionAt, captionPhrases } from "../../lib/captions";

/**
 * Real word cues drive phrase captions when available. Otherwise, requested
 * lyrics use explicitly approximate progress-driven scrolling.
 */
export function LyricsOverlay({
  lyrics,
  currentTime,
  duration,
  timing,
}: {
  lyrics: string;
  currentTime: number;
  duration: number;
  timing?: LyricTiming | null;
}) {
  const prefs = usePreferences();
  const appearance = { fontSize: `clamp(18px, 3vw, ${prefs.lyricSize}px)`, background: `rgb(0 0 0 / ${prefs.lyricBackdrop}%)` };
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const phrases = useMemo(() => captionPhrases(timing?.words ?? []), [timing]);
  const phrase = captionAt(phrases, currentTime);

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
  useEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (el && inner) el.scrollTop = Math.max(0, inner.scrollHeight - el.clientHeight) * frac;
  }, [frac, lyrics, prefs.lyricDisplay, prefs.lyricSize]);

  if (timing?.words.length && prefs.lyricDisplay === "phrases") {
    return <div className={`pointer-events-none absolute inset-0 flex ${prefs.lyricPosition === "center" ? "items-center" : "items-end"} justify-center p-4 pb-24`}>
      {phrase && <div style={appearance} className="max-w-3xl rounded-2xl bg-black/75 px-6 py-4 text-center text-3xl font-semibold leading-relaxed text-white shadow-xl backdrop-blur-sm">
        {phrase.map((word, index) => <span key={`${word.start}-${index}`} className={currentTime >= word.start && currentTime < word.end ? "text-[var(--accent)]" : "text-white"}>{word.text}{" "}</span>)}
        <p className="mt-2 text-xs font-normal text-white/60">Recognized lyrics · timing may need correction</p>
      </div>}
    </div>;
  }

  if (!lines.some((line) => !/^\[.+\]$/.test(line))) {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="rounded-lg bg-black/40 px-3 py-1.5 text-sm text-white/60 backdrop-blur-sm">
          No lyrics for this track
        </span>
      </div>
    );
  }

  if (prefs.lyricDisplay === "phrases") {
    const plain = lines.filter((line) => !/^\[.+\]$/.test(line));
    const start = Math.min(Math.max(0, Math.ceil(plain.length / 2) - 1), Math.floor(frac * Math.ceil(plain.length / 2))) * 2;
    return <div className={`pointer-events-none absolute inset-0 flex ${prefs.lyricPosition === "center" ? "items-center" : "items-end"} justify-center p-4 pb-24`}>
      <div style={appearance} className="max-w-3xl rounded-2xl px-6 py-4 text-center font-semibold leading-relaxed text-white shadow-xl backdrop-blur-sm">
        {plain.slice(start, start + 2).map((line, i) => <p key={i}>{line}</p>)}
        <p className="mt-2 text-xs font-normal text-white/70">Approximate timing · synchronize this song in Library for word highlighting</p>
      </div>
    </div>;
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center">
      <span className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white/70">Lyrics · approximate scrolling</span>
      <div
        ref={scrollRef}
        style={{ background: appearance.background }} className="mask-fade h-full w-full max-w-3xl overflow-hidden px-6"
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
                style={{ fontSize: appearance.fontSize }} className="text-center font-semibold leading-snug text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
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
