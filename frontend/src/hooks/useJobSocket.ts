import { useEffect } from "react";
import { useStore } from "../store";

/** Subscribes to the backend job feed and pipes updates into the store. */
export function useJobSocket() {
  const ingestJob = useStore((s) => s.ingestJob);
  const ingestTrack = useStore((s) => s.ingestTrack);
  const ingestModel = useStore((s) => s.ingestModel);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/jobs`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "job") ingestJob(msg.job);
          else if (msg.type === "track") ingestTrack(msg.track);
          else if (msg.type === "model") ingestModel(msg.model);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [ingestJob, ingestTrack, ingestModel]);
}
