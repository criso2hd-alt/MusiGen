import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { SystemStatus } from "../lib/types";

const gib = (n: number | null) => n === null ? "Unavailable" : `${(n / 2 ** 30).toFixed(1)} GB`;
function Meter({ name, percent, detail }: { name: string; percent: number | null; detail?: string }) {
  return <div className="flex shrink-0 items-center gap-2" title={detail}>
    <span className="text-[var(--muted)]">{name}</span>
    <progress aria-label={name} max={100} value={percent ?? 0} className="resource-meter h-1 w-12" />
    <span className="min-w-7 tabular-nums">{percent === null ? "N/A" : `${Math.round(percent)}%`}</span>
    {detail && <span className="text-[var(--muted)]">{detail}</span>}
  </div>;
}

export function SystemMonitor() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await api.system(); if (!closed) { setStatus(result); setError(""); } }
      catch { if (!closed) setError("Resource monitoring disconnected; values may be stale."); }
      if (!closed) setCheckedAt(Date.now() / 1000);
      if (!closed) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { closed = true; clearTimeout(timer); };
  }, []);
  const stale = status?.sampled_at && checkedAt - status.sampled_at > 12;
  const warning = error || (stale ? "Resource sample is stale." : "") || status?.gpu_error || status?.system_error;
  return <section aria-label="System resources" className="flex h-7 shrink-0 items-center overflow-x-auto whitespace-nowrap border-b border-white/10 bg-black/20 px-4 text-[11px] [scrollbar-width:none]">
    <div className="mx-auto flex w-max shrink-0 items-center gap-5">
    <span className="flex shrink-0 items-center gap-2 text-[var(--muted)]"><span className={`h-1.5 w-1.5 rounded-full ${warning ? "bg-amber-400" : status?.model_activity ? "bg-[var(--accent)]" : "bg-emerald-400"}`} />{status?.model_activity?.name || (status ? "Idle" : "Reading system metrics…")}</span>
    {status && <>
      <Meter name="CPU" percent={status.cpu_percent} />
      <Meter name="RAM" percent={status.ram?.percent ?? null} detail={status.ram ? `${gib(status.ram.used_bytes)} used · ${gib(status.ram.available_bytes)} available` : undefined} />
      {status.gpus.map((gpu) => <div key={gpu.index} className="flex shrink-0 items-center gap-4 border-l border-white/10 pl-4">
        <span className="text-[var(--muted)]">{gpu.name}</span>
        <Meter name="GPU" percent={gpu.utilization_percent} />
        <Meter name="VRAM" percent={gpu.used_bytes !== null && gpu.total_bytes ? gpu.used_bytes / gpu.total_bytes * 100 : null} detail={`${gib(gpu.used_bytes)} used · ${gib(gpu.free_bytes)} free`} />
        {gpu.total_bytes && gpu.used_bytes !== null && gpu.used_bytes / gpu.total_bytes > .93 ? <span className="text-amber-300" title="Generation may slow down; this does not confirm shared-memory use.">VRAM nearly full</span> : null}
      </div>)}
    </>}
    {warning && <span role="status" className="text-amber-300">{warning}</span>}
    </div>
  </section>;
}
