import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { dock } from "./workspace/dock";

const steps: { title: string; body: string; tab: "create" | "library" | "setup"; target: string; panel?: string }[] = [
  { title: "Find your ingredients", body: "Search styles and instruments, choose a text size, or explore the endless orbit. Customize hides ingredients you don't use. Click a pill or drag it into your mix.", tab: "create", target: "ingredients", panel: "ingredients" },
  { title: "Build your sound", body: "Mix pills with your own extra words. AI Write turns that combination into a description. Give the song a title or let MusiGen suggest one.", tab: "create", target: "mixer", panel: "mixer" },
  { title: "Bring a melody", body: "Open Reference melody to import audio or MIDI. MIDI becomes audio automatically, then the extracted melody guides your new arrangement. Optional models are configured in Setup.", tab: "create", target: "reference", panel: "mixer" },
  { title: "Give the words room", body: "Drag the lyrics editor's lower-right handle to enlarge it, or resize its panel. The writer can aim for your duration, and fit warnings help you avoid an unfinished verse.", tab: "create", target: "lyrics", panel: "lyrics" },
  { title: "Know what the AI is doing", body: "The slim strip under the header shows GPU memory, CPU and RAM on every page. The queue shows stage progress and elapsed time. Pause saves work at a stage boundary; resume can continue from that saved stage.", tab: "create", target: "queue", panel: "mixer" },
  { title: "Browse your collection", body: "Choose Compact, Full or Record store. Expand one song or every song to see ingredients, extra words, seed and generation settings. Use recipe restores the original seed; Remix chooses a new one.", tab: "library", target: "library" },
  { title: "Artwork and playlists", body: "Cover art creates or replaces a song's artwork. Add to playlist opens a themed list. Song details also contains Synchronize lyrics, which analyzes the actual sung words.", tab: "library", target: "cover-art" },
  { title: "Put the visuals on show", body: "Open the full-screen visualizer here. Its arrows change visual presets; the player's skip buttons change songs. Pin a favorite, or return to your last preset. Auto-cycle starts off.", tab: "library", target: "visualizer" },
  { title: "Make it yours", body: "Setup holds your colors, music engine, model downloads and optional media tools. Replay this tour any time using Quick tour in the top bar.", tab: "setup", target: "setup" },
];
function seen() { try { return localStorage.getItem("mg.tour.v1") === "done"; } catch { return false; } }
export function StudioTour() {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const previous = useRef({ tab: useStore.getState().tab, expanded: useStore.getState().playerExpanded });
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => {
    try { localStorage.setItem("mg.tour.v1", "done"); } catch { /* preference unavailable */ }
    setOpen(false);
    useStore.getState().setTab(previous.current.tab);
    useStore.getState().setPlayerExpanded(previous.current.expanded);
    returnFocus.current?.focus();
  };
  useEffect(() => {
    const start = () => {
      previous.current = { tab: useStore.getState().tab, expanded: useStore.getState().playerExpanded };
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      useStore.getState().setPlayerExpanded(false);
      setRect(null); setStep(-1); setOpen(true);
    };
    window.addEventListener("musigen:tour", start);
    return () => window.removeEventListener("musigen:tour", start);
  }, []);
  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const current = steps[step];
    if (current) useStore.getState().setTab(current.tab);
    let focusedPanel = false;
    let revealedTarget = false;
    const measure = () => {
      if (current?.panel && !focusedPanel && dock.get()) { dock.focus(current.panel); focusedPanel = true; }
      const el = current ? document.querySelector(`[data-tour="${current.target}"]`) ?? document.querySelector(`[data-tour="${current.tab}"]`) : null;
      if (el && !revealedTarget) { el.scrollIntoView({ block: "nearest", inline: "nearest" }); revealedTarget = true; }
      const b = el?.getBoundingClientRect();
      const next = b && b.width > 0 && b.height > 0 && b.top < window.innerHeight && b.bottom > 0 ? { x: Math.max(8, b.x - 5), y: Math.max(8, b.y - 5), w: Math.max(0, Math.min(b.right + 5, window.innerWidth - 8) - Math.max(8, b.x - 5)), h: Math.max(0, Math.min(b.bottom + 5, window.innerHeight - 8) - Math.max(8, b.y - 5)) } : null;
      setRect((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const timer = window.setInterval(measure, 200);
    measure();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const buttons = Array.from(card.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(i + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => { clearInterval(timer); window.removeEventListener("keydown", key); };
    // The close action restores the session snapshot held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);
  if (!open) return null;
  const width = Math.min(370, window.innerWidth - 32);
  const left = rect && rect.x + rect.w + width + 32 < window.innerWidth ? rect.x + rect.w + 16 : rect && rect.x > width + 32 ? rect.x - width - 16 : (window.innerWidth - width) / 2;
  const top = rect ? Math.max(16, Math.min(rect.y + rect.h + 16, window.innerHeight - 310)) : Math.max(16, (window.innerHeight - 300) / 2);
  return <div className="fixed inset-0 z-[100] bg-black/30">
    {rect && <div className="tour-spot pointer-events-none absolute rounded-xl border-2 border-[var(--accent)] shadow-[0_0_0_9999px_rgba(0,0,0,.6)]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
    <div ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} className="tour-card absolute rounded-2xl border border-white/15 bg-[#151925] p-6 text-white shadow-2xl outline-none" style={{ left, top, width }}>
      <p className="mb-2 text-xs uppercase tracking-widest text-[var(--accent)]">{step < 0 ? "Welcome to MusiGen" : `Quick tour · ${step + 1} / ${steps.length}`}</p>
      <h2 id="tour-title" className="mb-3 text-xl font-semibold">{step < 0 ? "Your own music studio" : steps[step].title}</h2>
      <p className="text-sm leading-relaxed text-white/75">{step < 0 ? "Take a short tour of mixing, lyrics, your record collection and the full-screen visualizer. You can skip it now and replay it later." : steps[step].body}</p>
      <div className="mt-6 flex items-center gap-2">
        <button onClick={close} className="mr-auto rounded-lg px-2 py-2 text-xs text-white/65 hover:bg-white/10">{step < 0 ? "Not now" : "Skip tour"}</button>
        {step >= 0 && <button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-30">Back</button>}
        <button onClick={() => step === steps.length - 1 ? close() : setStep(step + 1)} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">{step < 0 ? "Take the tour" : step === steps.length - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  </div>;
}
