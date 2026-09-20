import { useEffect, useState } from "react";
import { Play, Pause, X, CircleCheck, CircleAlert } from "lucide-react";
import { api } from "../lib/api";
import clsx from "clsx";
import { useStore } from "../store";
import type { Job } from "../lib/types";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  waiting: "Waiting for models",
  paused: "Paused",
  downloading: "Downloading model",
  planning: "Planning",
  generating: "Composing",
  synthesizing: "Synthesizing",
  decoding: "Decoding",
  done: "Done",
  error: "Error",
  cancelled: "Cancelled",
};

function JobRow({ job }: { job: Job }) {
  const showToast = useStore((s) => s.showToast);
  const tracks = useStore((s) => s.tracks);
  const playTrack = useStore((s) => s.playTrack);
  const active = !["done", "error", "cancelled", "paused"].includes(job.status);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const elapsed = (job.elapsed_seconds || 0) + (job.run_started_at && active ? Math.max(0, now - job.run_started_at) : 0);
  const quiet = Math.max(0, Math.floor(now - job.updated_at));
  const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); const jobs = await api.jobs(); jobs.forEach(useStore.getState().ingestJob); }
    catch (e) { showToast(String(e), "err"); }
    finally { setBusy(false); }
  };

  const play = () => {
    const t = tracks.find((t) => t.id === job.track_id);
    if (t) playTrack(t);
  };

  return (
    <div className="rounded-xl bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-sm font-medium">{job.title}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {job.status === "done" && (
            <CircleCheck size={14} className="text-[var(--good)]" />
          )}
          {job.status === "error" && (
            <CircleAlert size={14} className="text-[var(--accent-3)]" />
          )}
          {STAGE_LABEL[job.stage] ?? job.stage}
        </span>
        {(job.status === "paused" || (active && job.engine === "yue2")) && <button
          disabled={busy || job.pause_requested || job.cancel_requested}
          onClick={() => void action(() => job.status === "paused" ? api.resumeJob(job.id) : api.pauseJob(job.id))}
          title={job.status === "paused" ? "Resume from saved stages" : "Pause after the current stage"}
          className="rounded-md p-1 text-[var(--accent)] disabled:opacity-40">
          {job.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
        </button>}
        {active || job.status === "paused" ? (
          <button
            disabled={busy || job.cancel_requested}
            onClick={() => void action(() => api.cancelJob(job.id))}
            className="rounded-md p-1 text-[var(--muted)] hover:bg-white/10 hover:text-white"
            title="Cancel"
          >
            <X size={14} />
          </button>
        ) : job.status === "done" && job.track_id ? (
          <button
            onClick={play}
            className="rounded-md p-1 text-[var(--accent)] hover:bg-white/10"
            title="Play"
          >
            <Play size={14} />
          </button>
        ) : null}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            active ? "progress-sheen" : "",
            job.status === "done" && "bg-[var(--good)]",
            job.status === "error" && "bg-[var(--accent-3)]",
            job.status === "cancelled" && "bg-white/20"
          )}
          style={{ width: `${Math.max(4, job.progress * 100)}%` }}
        />
      </div>
      {job.message && (
        <div className="mt-1.5 text-xs text-[var(--muted)]">
          {job.message}
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">
        {job.status === "queued" && !job.started_at ? `Queued ${fmt(Math.max(0, now - job.created_at))}` : `Elapsed ${fmt(elapsed)}`}
        {active && job.status !== "queued" && ` · Last update ${quiet}s ago`}
      </p>
      {active && !["queued", "waiting", "downloading"].includes(job.status) && quiet > 30 && <p className="mt-1 text-xs text-amber-300">No new progress reported. The current GPU operation may still be running.</p>}
    </div>
  );
}

export function JobsList() {
  const jobs = useStore((s) => s.jobs);
  const list = Object.values(jobs).sort((a, b) => b.created_at - a.created_at);
  if (list.length === 0) return null;

  return (
    <div className="glass rounded-2xl p-3">
      <div className="space-y-2">
        {list.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
