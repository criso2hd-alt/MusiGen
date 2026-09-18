import clsx from "clsx";
import type { PillCategory } from "../../lib/types";

/** The visual body of a pill, reused by the tray, the board, and the drag overlay. */
export function PillFace({
  category,
  label,
  floating,
  onClick,
}: {
  category: PillCategory;
  label: string;
  floating?: boolean;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={clsx(
        `pill category-${category} inline-flex select-none items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium leading-none`,
        floating ? "cursor-grabbing shadow-2xl" : "cursor-grab"
      )}
      style={{
        borderColor: "color-mix(in srgb, var(--cat) 45%, transparent)",
        background: "color-mix(in srgb, var(--cat) 16%, transparent)",
        color: "color-mix(in srgb, var(--cat) 88%, white)",
        boxShadow: floating
          ? "0 0 22px color-mix(in srgb, var(--cat) 60%, transparent)"
          : undefined,
      }}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: "var(--cat)" }}
      />
      {label}
    </span>
  );
}
