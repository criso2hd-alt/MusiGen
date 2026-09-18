import { useState } from "react";
import { FolderDown, X, Download, Save } from "lucide-react";
import { useStore } from "../store";
import { api } from "../lib/api";

function safeName(title: string) {
  return (
    title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim() || "song"
  );
}

// Native OS dialogs are exposed by pywebview when running in the desktop app.
function nativeApi(): any | null {
  const w = window as any;
  return w?.pywebview?.api?.save_dialog ? w.pywebview.api : null;
}

export function ExportDialog() {
  const target = useStore((s) => s.exportTarget);
  const lastFolder = useStore((s) => s.lastFolder);
  const closeExport = useStore((s) => s.closeExport);
  const exportTrack = useStore((s) => s.exportTrack);
  const showToast = useStore((s) => s.showToast);
  const [folder, setFolder] = useState(lastFolder);
  const [format, setFormat] = useState<"flac" | "wav">("flac");
  const [busy, setBusy] = useState(false);

  if (!target) return null;
  const native = nativeApi();

  const FormatToggle = (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--muted)]">Format</span>
      <div className="flex gap-1 rounded-lg bg-black/30 p-1">
        {(["flac", "wav"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            title={f === "flac" ? "Lossless, smaller" : "Uncompressed, universal"}
            className={`rounded-md px-3 py-1 text-xs font-medium uppercase transition ${
              format === f
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );

  const saveNative = async () => {
    setBusy(true);
    try {
      const path = await native.save_dialog(`${safeName(target.title)}.${format}`);
      if (!path) return; // user cancelled
      const r = await api.saveTrackTo(target.id, String(path));
      showToast(`Saved to ${r.path}`, "ok");
      closeExport();
    } catch (e: any) {
      showToast(`Save failed: ${String(e).slice(0, 120)}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const saveFolder = async () => {
    if (!folder.trim()) return;
    setBusy(true);
    try {
      await exportTrack(folder.trim(), format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={closeExport}
    >
      <div
        className="glass w-[460px] max-w-[92vw] rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Save size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-semibold">Save song</h2>
          <button
            onClick={closeExport}
            title="Close"
            className="ml-auto rounded-md p-1 text-[var(--muted)] hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 truncate text-sm text-[var(--muted)]" title={target.title}>
          {target.title}
        </div>

        {native ? (
          <>
            <div className="mb-4">{FormatToggle}</div>
            <button
              onClick={saveNative}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-3 font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              <Save size={16} /> {busy ? "Saving…" : "Choose location & Save…"}
            </button>
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              Opens the standard Windows save dialog — pick any folder and name.
            </p>
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Destination folder
            </label>
            <input
              autoFocus
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveFolder()}
              placeholder="e.g. E:\\Music\\MusiGen"
              className="mb-3 w-full rounded-xl bg-black/40 px-3 py-2.5 font-mono text-sm outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
            />
            <div className="mb-4">{FormatToggle}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveFolder}
                disabled={busy || !folder.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
              >
                <FolderDown size={16} /> {busy ? "Saving…" : "Save to folder"}
              </button>
              <a
                href={api.downloadUrl(target.id)}
                download
                title="Download via browser"
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium hover:bg-white/10"
              >
                <Download size={16} /> Download
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
