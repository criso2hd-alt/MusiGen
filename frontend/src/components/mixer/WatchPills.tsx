import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import type { PillCategory } from "../../lib/types";

type Item = { category: PillCategory; label: string };
const wrap = (value: number, size: number) => ((value % size) + size) % size;

/** A toroidal tile larger than the viewport recycles pills offscreen. */
export function WatchPills({ items: source, fontSize }: { items: Item[]; fontSize: number }) {
  const addPill = useStore((s) => s.addPill);
  const container = useRef<HTMLDivElement>(null);
  const elements = useRef<(HTMLButtonElement | null)[]>([]);
  const pan = useRef({ x: 0, y: 0 });
  const cursor = useRef({ x: 0, y: 0, active: false });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [size, setSize] = useState({ w: 600, h: 700 });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const grid = useMemo(() => {
    const dx = Math.max(150, fontSize * 13), dy = Math.max(56, fontSize * 5);
    const cols = Math.max(Math.ceil((size.w + 400) / dx), Math.ceil(Math.sqrt(source.length * 1.6)), 2);
    const rows = Math.ceil(Math.max(Math.ceil(source.length / cols), (size.h + 400) / dy) / 2) * 2;
    return { w: cols * dx, h: rows * dy,
      cells: source.length ? Array.from({ length: cols * rows }, (_, i) => ({
        ...source[i % source.length], x: (i % cols) * dx + (Math.floor(i / cols) % 2 ? dx / 2 : 0), y: Math.floor(i / cols) * dy,
      })) : [] };
  }, [source, size, fontSize]);
  useEffect(() => {
    let frame = 0, previous = 0;
    const tick = (now: number) => {
      const dt = Math.min(32, now - (previous || now)); previous = now;
      const c = cursor.current;
      if (c.active && !drag.current) {
        const edge = (v: number, length: number) => v < 80 ? 1 - v / 80 : v > length - 80 ? -(1 - (length - v) / 80) : 0;
        pan.current.x += edge(c.x, size.w) * dt * .45;
        pan.current.y += edge(c.y, size.h) * dt * .45;
      }
      pan.current.x = wrap(pan.current.x, grid.w); pan.current.y = wrap(pan.current.y, grid.h);
      grid.cells.forEach((item, i) => {
        const el = elements.current[i]; if (!el) return;
        const x = wrap(item.x + pan.current.x + 200, grid.w) - 200;
        const y = wrap(item.y + pan.current.y + 200, grid.h) - 200;
        const distance = (x - (c.active ? c.x : size.w / 2)) ** 2 + (y - (c.active ? c.y : size.h / 2)) ** 2;
        const influence = Math.exp(-distance / (2 * 150 ** 2));
        const scale = .65 + .75 * influence;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
        el.style.zIndex = String(Math.round(scale * 100));
        el.style.opacity = String(.55 + .45 * influence);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [grid, size]);
  return <div ref={container} className="relative h-full min-h-0 overflow-hidden select-none touch-none"
    onContextMenu={(e) => e.preventDefault()}
    onPointerDown={(e) => { if (e.button === 2) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.current.x, py: pan.current.y }; } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); cursor.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true }; if (drag.current) pan.current = { x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }; }}
    onPointerLeave={() => { cursor.current.active = false; }}>
    <p className="pointer-events-none absolute left-2 top-2 z-[150] rounded bg-black/70 px-2 py-1 text-[11px] text-white/70">Move to an edge to explore · right-drag to pan · click to add</p>
    {grid.cells.map((item, i) => <button key={`${item.category}-${item.label}-${i}`} ref={(el) => { elements.current[i] = el; }}
      onClick={() => addPill(item.category, item.label)} title={`Add ${item.label}`}
      className={`category-${item.category} absolute left-0 top-0 whitespace-nowrap rounded-full border px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-white`}
      style={{ fontSize, color: "var(--cat)", background: "color-mix(in srgb, var(--cat) 18%, #10131e)", borderColor: "color-mix(in srgb, var(--cat) 50%, transparent)" }}>{item.label}</button>)}
  </div>;
}
