import { useEffect, useMemo, useRef, useState } from "react";
import { FileMusic, Printer, Download, X, Crosshair, Info } from "lucide-react";
import { useStore } from "../../store";
import { audioEngine } from "../../lib/audio";
import { saveFile } from "../../lib/fileSave";
import { exportName, scoreInfo, trackScore, withTitle } from "../../lib/score";

type Abcjs = typeof import("abcjs");
type TuneObject = import("abcjs").TuneObject;
type TimingCallbacks = import("abcjs").TimingCallbacks;

const ACTIVE = "mg-score-active";

/**
 * Sheet music for a song: renders the score YuE2 composed (vocal line,
 * instrument line, chords, key, tempo, sections) and exports it as MIDI/ABC or
 * prints it (Windows' print dialog can save it as PDF). While the song plays,
 * the current notes can be highlighted.
 */
export function SheetMusic() {
  const track = useStore((s) => s.sheetTrack);
  const closeSheet = useStore((s) => s.closeSheet);
  const showToast = useStore((s) => s.showToast);
  const current = useStore((s) => s.current);
  const isPlaying = useStore((s) => s.isPlaying);
  const paperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abcjsRef = useRef<Abcjs | null>(null);
  const tuneRef = useRef<TuneObject | null>(null);
  const [error, setError] = useState("");
  const [follow, setFollow] = useState(true);
  const [rendered, setRendered] = useState(0);

  const abc = useMemo(() => (track ? trackScore(track) : null), [track]);
  const titled = useMemo(() => (abc && track ? withTitle(abc, track.title) : null), [abc, track]);
  const info = useMemo(() => (abc ? scoreInfo(abc) : null), [abc]);
  const isCurrent = !!track && current?.id === track.id;

  // Render the score (abcjs is loaded on demand to keep the app bundle small).
  useEffect(() => {
    if (!titled || !paperRef.current) return;
    let cancelled = false;
    setError("");
    import("abcjs")
      .then((mod) => {
        if (cancelled || !paperRef.current) return;
        const ABCJS = ((mod as unknown as { default?: Abcjs }).default ?? mod) as Abcjs;
        abcjsRef.current = ABCJS;
        const [tune] = ABCJS.renderAbc(paperRef.current, titled, {
          add_classes: true,
          oneSvgPerLine: true, // lets printed pages break between systems
          responsive: "resize",
          staffwidth: 860,
          wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
          paddingtop: 12,
          paddingbottom: 24,
        });
        tuneRef.current = tune ?? null;
        setRendered((n) => n + 1);
      })
      .catch((e) => setError(`Couldn't render the score: ${String(e)}`));
    return () => {
      cancelled = true;
      tuneRef.current = null;
    };
  }, [titled]);

  // Follow playback: highlight the notes being played, kept in sync with the
  // audio element. The score's own tempo drives the cursor, so it is close to,
  // but not guaranteed to match, the rendered audio.
  useEffect(() => {
    const tune = tuneRef.current;
    const ABCJS = abcjsRef.current;
    if (!follow || !isCurrent || !tune || !ABCJS) return;
    const el = audioEngine.el;
    let previous: Element[] = [];
    const clear = () => {
      previous.forEach((n) => n.classList.remove(ACTIVE));
      previous = [];
    };
    const timer: TimingCallbacks = new ABCJS.TimingCallbacks(tune, {
      eventCallback: (ev) => {
        clear();
        if (!ev) return undefined;
        previous = (ev.elements ?? []).flat();
        previous.forEach((n) => n.classList.add(ACTIVE));
        const first = previous[0] as HTMLElement | undefined;
        const box = scrollRef.current;
        if (first && box) {
          const r = first.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          if (r.top < b.top + 40 || r.bottom > b.bottom - 40) {
            box.scrollBy({ top: r.top - b.top - b.height / 3, behavior: "smooth" });
          }
        }
        return undefined;
      },
    });
    const sync = () => timer.setProgress(el.currentTime, "seconds");
    const onPlay = () => timer.start(el.currentTime || undefined, "seconds");
    const onPause = () => timer.pause();
    if (!el.paused) onPlay();
    else sync();
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("seeked", sync);
    const drift = window.setInterval(() => {
      if (!el.paused && Math.abs(timer.currentMillisecond() / 1000 - el.currentTime) > 0.35) sync();
    }, 1000);
    return () => {
      window.clearInterval(drift);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("seeked", sync);
      timer.stop();
      clear();
    };
    // rendered: attach once the score exists (abcjs loads asynchronously).
  }, [follow, isCurrent, rendered, isPlaying]);

  useEffect(() => {
    if (!track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [track, closeSheet]);

  if (!track) return null;
  const name = exportName(track.title);

  const exportMidi = async () => {
    const ABCJS = abcjsRef.current;
    if (!titled || !ABCJS) return;
    try {
      const out = ABCJS.synth.getMidiFile(titled, { midiOutputType: "binary" });
      const bytes: Uint8Array = Array.isArray(out) ? out[0] : out;
      const saved = await saveFile(`${name}.mid`, bytes, "midi");
      if (saved) showToast(saved === "downloaded" ? "MIDI downloaded" : `Saved ${saved}`, "ok");
    } catch (e) {
      showToast(`MIDI export failed: ${String(e).slice(0, 120)}`, "err");
    }
  };

  const exportAbc = async () => {
    if (!titled) return;
    const saved = await saveFile(`${name}.abc`, titled, "abc");
    if (saved) showToast(saved === "downloaded" ? "ABC downloaded" : `Saved ${saved}`, "ok");
  };

  const print = () => {
    if (!paperRef.current) return;
    // Print a plain top-level copy of the score: the modal is fixed, clipped and
    // blurred, which browsers print as one cut-off page.
    const root = document.createElement("div");
    root.id = "mg-print-root";
    root.innerHTML = paperRef.current.innerHTML;
    root.querySelectorAll(`.${ACTIVE}`).forEach((n) => n.classList.remove(ACTIVE));
    document.body.appendChild(root);
    document.documentElement.classList.add("printing-score");
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      document.documentElement.classList.remove("printing-score");
      root.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    window.setTimeout(done, 60_000); // fallback if afterprint never fires
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={closeSheet}>
      <div
        role="dialog"
        aria-label={`Sheet music for ${track.title}`}
        className="glass flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <FileMusic size={18} className="text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{track.title}</div>
            {info && (
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] text-[var(--muted)]">
                {info.key && <span className="rounded bg-white/5 px-1.5 py-0.5">Key {info.key}</span>}
                {info.meter && <span className="rounded bg-white/5 px-1.5 py-0.5">{info.meter} time</span>}
                {info.tempo && <span className="rounded bg-white/5 px-1.5 py-0.5">♩ = {info.tempo}</span>}
                {info.voices.length > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5">{info.voices.join(" · ")}</span>}
                {info.chords > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5">chord symbols</span>}
              </div>
            )}
          </div>
          {abc && (
            <>
              <button
                onClick={() => setFollow((f) => !f)}
                disabled={!isCurrent}
                title={isCurrent ? "Highlight the notes as the song plays (approximate)" : "Play this song to follow along in the score"}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40 ${follow && isCurrent ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 hover:bg-white/10"}`}
              >
                <Crosshair size={14} /> Follow
              </button>
              <button onClick={print} title="Print, or choose “Microsoft Print to PDF” to save a PDF" className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10">
                <Printer size={14} /> Print / PDF
              </button>
              <button onClick={() => void exportMidi()} title="Save a MIDI file (vocal line, instrument line and chords) for your DAW or MuseScore" className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10">
                <Download size={14} /> MIDI
              </button>
              <button onClick={() => void exportAbc()} title="Save the score in ABC notation" className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10">
                <Download size={14} /> ABC
              </button>
            </>
          )}
          <button onClick={closeSheet} title="Close (Esc)" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {abc ? (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#f7f5ef] p-4">
              <div id="mg-score-paper" ref={paperRef} className="mx-auto max-w-[920px] text-black" />
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            </div>
            <p className="flex items-start gap-1.5 border-t border-white/10 px-4 py-2 text-[11px] text-[var(--muted)]">
              <Info size={12} className="mt-0.5 shrink-0" />
              This is the score YuE2 composed and then sang and played — melody, instrument line and chords. The audio follows it closely, but it isn't a note-for-note transcription of every instrument in the mix.
            </p>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-[var(--muted)]">
            <FileMusic size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium text-[var(--text)]">No sheet music for this song</p>
            <p className="mx-auto mt-2 max-w-md">
              YuE2 only writes a score when <strong>Chain-of-thought</strong> is set to <strong>Melody</strong> or <strong>Full</strong>.
              This song was made with it off. Use the recipe with one of those settings to get sheet music.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
