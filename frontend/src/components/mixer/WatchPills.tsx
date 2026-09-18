import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../../store";
import type { PillCategory } from "../../lib/types";

type Item = { category: PillCategory; label: string; x: number; y: number };

const SPACING_X = 128;
const SPACING_Y = 54;
const RADIUS = 150; // influence radius of the fisheye
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.7;

/** Apple-Watch-style honeycomb of pills: magnifies near the cursor, pan with
 *  right-drag, click to add. DOM is updated in a rAF loop (no per-frame React). */
export function WatchPills() {
  const catalog = useStore((s) => s.catalog);
  const addPill = useStore((s) => s.addPill);

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const elsRef = useRef<(HTMLDivElement | null)[]>([]);
  const scalesRef = useRef<number[]>([]);
  const pan = useRef({ x: 0, y: 0 });
  const cursor = useRef({ x: 0, y: 0, active: false });
  const raf = useRef(0);

  const { items, fieldW, fieldH } = useMemo(() => {
    const flat: { category: PillCategory; label: string }[] = catalog
      ? (Object.keys(catalog) as PillCategory[]).flatMap((c) =>
          catalog[c].map((label) => ({ category: c, label }))
        )
      : [];
    const cols = Math.max(6, Math.ceil(Math.sqrt(flat.length * 1.6)));
    const items: Item[] = flat.map((p, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return {
        ...p,
        x: col * SPACING_X + (row % 2 ? SPACING_X / 2 : 0) + SPACING_X / 2,
        y: row * SPACING_Y + SPACING_Y,
      };
    });
    const rows = Math.ceil(flat.length / cols);
    return {
      items,
      fieldW: cols * SPACING_X + SPACING_X,
      fieldH: rows * SPACING_Y + SPACING_Y,
    };
  }, [catalog]);

  // center the field initially and on resize
  useEffect(() => {
    const center = () => {
      const c = containerRef.current;
      if (!c) return;
      pan.current = {
        x: c.clientWidth / 2 - fieldW / 2,
        y: c.clientHeight / 2 - fieldH / 2,
      };
      cursor.current = { x: c.clientWidth / 2, y: c.clientHeight / 2, active: false };
    };
    center();
    const ro = new ResizeObserver(center);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fieldW, fieldH]);

  // animation loop
  useEffect(() => {
    scalesRef.current = items.map(() => 1);
    const tick = () => {
      const field = fieldRef.current;
      // edge navigation: when the cursor nears an edge, slide the field that way
      const c = containerRef.current;
      if (c && cursor.current.active) {
        const w = c.clientWidth;
        const h = c.clientHeight;
        const m = 90;
        const speed = 11;
        const cxp = cursor.current.x;
        const cyp = cursor.current.y;
        if (cxp < m) pan.current.x += speed * (1 - cxp / m);
        else if (cxp > w - m) pan.current.x -= speed * (1 - (w - cxp) / m);
        if (cyp < m) pan.current.y += speed * (1 - cyp / m);
        else if (cyp > h - m) pan.current.y -= speed * (1 - (h - cyp) / m);
        const pad = 80;
        pan.current.x = Math.max(Math.min(0, w - fieldW) - pad, Math.min(pad, pan.current.x));
        pan.current.y = Math.max(Math.min(0, h - fieldH) - pad, Math.min(pad, pan.current.y));
      }
      if (field) field.style.transform = `translate(${pan.current.x}px, ${pan.current.y}px)`;
      const cx = cursor.current.x;
      const cy = cursor.current.y;
      for (let i = 0; i < items.length; i++) {
        const el = elsRef.current[i];
        if (!el) continue;
        const it = items[i];
        const sx = pan.current.x + it.x;
        const sy = pan.current.y + it.y;
        const dx = sx - cx;
        const dy = sy - cy;
        const d2 = dx * dx + dy * dy;
        const g = Math.exp(-d2 / (2 * RADIUS * RADIUS));
        const target = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * g;
        const cur = scalesRef.current[i] + (target - scalesRef.current[i]) * 0.25;
        scalesRef.current[i] = cur;
        el.style.transform = `translate(-50%, -50%) scale(${cur.toFixed(3)})`;
        el.style.zIndex = String(Math.round(cur * 100));
        el.style.opacity = (0.35 + 0.65 * g).toFixed(3);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [items]);

  const onPointerMove = (e: React.PointerEvent) => {
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    cursor.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true };
  };
  const onPointerLeave = () => {
    const c = containerRef.current;
    if (!c) return;
    cursor.current = { x: c.clientWidth / 2, y: c.clientHeight / 2, active: false };
  };

  // right-drag to pan
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 2) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...pan.current };
    const move = (ev: PointerEvent) => {
      pan.current = { x: base.x + (ev.clientX - startX), y: base.y + (ev.clientY - startY) };
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute left-2 top-2 z-20 rounded-md bg-black/30 px-2 py-0.5 text-[9px] text-[var(--muted)]/80">
        move to edges to slide · click to add
      </div>
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className="relative h-full w-full cursor-grab touch-none select-none"
      >
        <div ref={fieldRef} className="absolute left-0 top-0 will-change-transform">
          {items.map((it, i) => (
            <div
              key={`${it.category}-${it.label}`}
              ref={(el) => {
                elsRef.current[i] = el;
              }}
              onClick={() => addPill(it.category, it.label)}
              className={`category-${it.category} absolute flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium`}
              style={{
                left: it.x,
                top: it.y,
                borderColor: "color-mix(in srgb, var(--cat) 45%, transparent)",
                background: "color-mix(in srgb, var(--cat) 18%, transparent)",
                color: "color-mix(in srgb, var(--cat) 90%, white)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--cat)" }}
              />
              {it.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
