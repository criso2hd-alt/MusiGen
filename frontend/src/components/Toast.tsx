import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useStore } from "../store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  const ok = toast.kind === "ok";
  return (
    <div className="pointer-events-none fixed bottom-36 left-1/2 z-[80] -translate-x-1/2">
      <div
        className={`glass flex max-w-[80vw] items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-2xl ${
          ok ? "text-[var(--good)]" : "text-[var(--accent-3)]"
        }`}
      >
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <span className="truncate text-[var(--text)]">{toast.msg}</span>
      </div>
    </div>
  );
}
