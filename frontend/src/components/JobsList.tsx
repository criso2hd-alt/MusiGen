import { Play, X, CircleCheck, CircleAlert } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";
import type { Job } from "../lib/types";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
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
  const cancelJob = useStore((s) => s.cancelJob);
  const tracks = useStore((s) => s.tracks);
  const playTrack = useStore((s) => s.playTrack);
  const active = !["done", "error", "cancelled"].includes(job.status);

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
        {active ? (
          <button
            onClick={() => cancelJob(job.id)}
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
        <div className="mt-1.5 truncate text-[11px] text-[var(--muted)]">
          {job.message}
        </div>
      )}
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
        {list.slice(0, 6).map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
