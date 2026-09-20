import { ChevronDown } from "lucide-react";
import { useStore } from "../../store";
import { JobsList } from "../JobsList";

export function MixerQueue() {
  const jobs = Object.values(useStore((s) => s.jobs));
  const queued = jobs.filter((j) => j.status === "queued").length;
  const paused = jobs.filter((j) => j.status === "paused").length;
  const active = jobs.filter((j) => !["queued", "paused", "done", "error", "cancelled"].includes(j.status)).length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const summary = [active && `${active} active`, queued && `${queued} queued`, paused && `${paused} paused`, failed && `${failed} failed`].filter(Boolean).join(" · ") || (jobs.length ? "All generations finished" : "No generations yet");
  return <details data-tour="queue" className="glass group rounded-xl p-3">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm"><ChevronDown size={15} className="shrink-0 transition group-open:rotate-180" /><strong>Queue</strong><span role="status" className="ml-auto text-right text-xs text-[var(--muted)]">{summary}</span></summary>
    <div className="mt-3 max-h-80 overflow-y-auto">{jobs.length ? <JobsList /> : <p className="text-xs text-[var(--muted)]">Build a mix and hit Generate.</p>}</div>
  </details>;
}
