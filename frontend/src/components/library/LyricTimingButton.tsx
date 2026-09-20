import { useState } from "react";
import { api } from "../../lib/api";
import type { Track } from "../../lib/types";
import { useStore } from "../../store";
import { MediaTaskStatus } from "../MediaTaskStatus";

export function LyricTimingButton({ track }: { track: Track }) {
  const [taskId, setTaskId] = useState<string | null>(() => sessionStorage.getItem(`mg.timing.${track.id}`));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const show = async () => {
    try {
      const updated = await api.track(track.id);
      const store = useStore.getState();
      store.ingestTrack(updated);
      if (store.current?.id !== updated.id) await store.playTrack(updated);
      if (!store.showLyrics) store.toggleLyrics();
      store.setPlayerExpanded(true);
    } catch (e) { setError(String(e)); }
  };
  return <div className="mt-3 text-xs">
    <button disabled={busy} className="rounded-lg bg-white/10 px-2 py-1.5" onClick={async () => {
      setBusy(true); setError("");
      try { const task = await api.timeLyrics(track.id); setTaskId(task.id); sessionStorage.setItem(`mg.timing.${track.id}`, task.id); }
      catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>{busy ? "Starting…" : track.lyric_timing ? "Re-analyze lyric timing" : "Synchronize lyrics"}</button>
    {track.lyric_timing && <button className="ml-2 underline" onClick={() => void show()}>Show synchronized lyrics</button>}
    {taskId && <MediaTaskStatus key={taskId} id={taskId} onReady={() => void show()} />}
    {error && <p role="alert" className="mt-2 text-amber-300">{error}</p>}
  </div>;
}
