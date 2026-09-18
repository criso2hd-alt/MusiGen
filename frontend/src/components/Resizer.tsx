/** A thin draggable divider for resizing a neighbouring panel. */
export function Resizer({
  axis,
  sign = 1,
  getBase,
  onResize,
  title,
}: {
  axis: "x" | "y";
  sign?: number;
  getBase: () => number;
  onResize: (value: number) => void;
  title?: string;
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const base = getBase();
    const move = (ev: PointerEvent) => {
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      onResize(base + sign * (pos - startPos));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const base =
    "group relative shrink-0 z-10 flex items-center justify-center transition-colors";
  const dims =
    axis === "x" ? "w-2 cursor-col-resize" : "h-2 w-full cursor-row-resize";

  return (
    <div
      onPointerDown={onPointerDown}
      title={title ?? "Drag to resize"}
      className={`${base} ${dims}`}
    >
      <div
        className={
          axis === "x"
            ? "h-10 w-[3px] rounded-full bg-white/15 group-hover:bg-[var(--accent)]"
            : "h-[3px] w-10 rounded-full bg-white/15 group-hover:bg-[var(--accent)]"
        }
      />
    </div>
  );
}
