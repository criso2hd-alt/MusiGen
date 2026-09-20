import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { MediaTask } from "../lib/types";

export function MediaTaskStatus({ id, onReady }: { id: string; onReady: (task: MediaTask) => void }) {
  const [task, setTask] = useState<MediaTask | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api.mediaTask(id);
        if (closed) return;
        setTask(result);
        setCheckedAt(Date.now() / 1000);
        setError("");
        if (!["done", "error", "cancelled"].includes(result.status)) timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!closed) { setError(`${String(e)} · Retrying status…`); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { closed = true; clearTimeout(timer); };
  }, [id]);
  const active = task && !["done", "error", "cancelled"].includes(task.status);
  const elapsed = task ? Math.max(0, Math.floor(checkedAt - task.created_at)) : 0;
  return <div className="mt-2 space-y-2 text-xs" role="status">
    <p>{task?.message || "Reading task status…"}</p>
    {active && <p className="text-[var(--muted)]">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} since submission · includes waiting time</p>}
    {error && <p className="text-amber-300">{error}</p>}
    {active && <button disabled={cancelled} className="rounded bg-white/10 px-2 py-1" onClick={async () => {
      try { await api.cancelMediaTask(id); setCancelled(true); } catch (e) { setError(String(e)); }
    }}>{cancelled ? "Cancelling…" : "Cancel"}</button>}
    {task?.status === "done" && <button className="rounded bg-[var(--accent)]/20 px-2 py-1" onClick={() => onReady(task)}>{task.kind === "reference" ? "Use this melody" : "Show synchronized lyrics"}</button>}
  </div>;
}
