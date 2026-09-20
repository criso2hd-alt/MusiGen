import { lazy, Suspense, useState } from "react";
import {
  Play,
  Trash2,
  Plus,
  Disc3,
  Clock,
  FolderDown,
  Search,
  Pencil,
  Wand2,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useStore } from "../../store";
import type { Track } from "../../lib/types";
import { usePreferences } from "../../lib/preferences";
import { Vinyl } from "../player/Vinyl";
import { AlbumArt } from "../player/AlbumArt";
import { PlaylistsPanel } from "../panels/PlaylistsPanel";
import { LyricTimingButton } from "./LyricTimingButton";

const RecordStore = lazy(() => import("./store3d/RecordStore"));

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function TrackCard({ track, view, expanded, onExpand }: { track: Track; view: "compact" | "full" | "records"; expanded: boolean; onExpand: () => void }) {
  const playTrack = useStore((s) => s.playTrack);
  const deleteTrack = useStore((s) => s.deleteTrack);
  const renameTrack = useStore((s) => s.renameTrack);
  const playlists = useStore((s) => s.playlists);
  const addToPlaylist = useStore((s) => s.addToPlaylist);
  const openExport = useStore((s) => s.openExport);
  const remixTrack = useStore((s) => s.remixTrack);
  const generateCover = useStore((s) => s.generateCover);
  const coverBusy = useStore((s) => s.coverBusy[track.id]);
  const coverReady = useStore((s) => s.models.cover?.ready);
  const current = useStore((s) => s.current);
  const isPlaying = useStore((s) => s.isPlaying);
  const isCurrent = current?.id === track.id;
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.title);

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== track.title) renameTrack(track.id, name.trim());
    else setName(track.title);
  };

  return (
    <div
      className={`glass group min-w-0 flex flex-col rounded-2xl p-3 transition hover:bg-white/5 ${view === "records" ? "record-card" : ""} ${
        isCurrent ? "ring-1 ring-[var(--accent)]/60" : ""
      }`}
    >
      <div className={`relative mb-3 grid place-items-center overflow-hidden rounded-xl bg-black/20 ${view === "compact" ? "h-40" : "h-60"}`}>
        {view === "records" ? <Vinyl size={180} spinning={isCurrent && isPlaying} cover={track.cover_url ?? null} seed={seedOf(track.id)} /> : <AlbumArt
          size={view === "compact" ? 128 : 190}
          playing={isCurrent && isPlaying}
          cover={track.cover_url ?? null}
          seed={seedOf(track.id)}
        />}
        <button
          onClick={() => playTrack(track)}
          title="Play"
          className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent)] text-black shadow-xl">
            <Play size={20} className="ml-0.5" />
          </span>
        </button>
        <button
          data-tour="cover-art" onClick={() => generateCover(track.id)}
          disabled={coverBusy}
          title={
            coverReady
              ? track.cover_url
                ? "Regenerate cover art (AI)"
                : "Generate album cover (AI)"
              : "Download the Cover model in Setup to enable this"
          }
          className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/80 px-2 py-1.5 text-xs text-white backdrop-blur-sm transition hover:bg-black disabled:opacity-60"
        >
          {coverBusy ? (
            <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
          ) : (
            <><ImageIcon size={15} /> Cover art</>
          )}
        </button>
      </div>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(track.title);
              setEditing(false);
            }
          }}
          className="mb-1 w-full rounded-md bg-black/40 px-2 py-1 text-sm font-semibold outline-none ring-1 ring-[var(--accent)]/50"
        />
      ) : (
        <div className="mb-1 flex items-center gap-1">
          <div className="truncate font-semibold" title={track.title}>
            {track.title}
          </div>
          <button
            onClick={() => {
              setName(track.title);
              setEditing(true);
            }}
            title="Rename"
            className="rounded p-0.5 text-[var(--muted)] transition hover:text-white"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}

      <div className="mb-2 line-clamp-2 h-8 text-xs text-[var(--muted)]">
        {track.style || "—"}
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {fmtTime(track.duration)}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase">
          {track.engine}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <button onClick={() => remixTrack(track, false)} className="rounded-lg bg-white/5 px-2 py-1.5 text-xs" title="Restore the saved recipe and original seed">Use recipe</button>
        <div className="basis-full" onKeyDown={(e) => { if (e.key === "Escape") setPlaylistOpen(false); }}>
          <button aria-expanded={playlistOpen} onClick={() => setPlaylistOpen(!playlistOpen)} className="my-1 w-full rounded-lg bg-white/5 px-2 py-2 text-left text-xs ring-1 ring-white/10">+ Add to playlist <span className="float-right">{playlistOpen ? "−" : "+"}</span></button>
          {playlistOpen && <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-[#171b29] p-1.5">
            {playlists.length === 0 && <p className="p-2 text-xs text-[var(--muted)]">Create a playlist in the sidebar first.</p>}
            {playlists.map((pl) => <button key={pl.id} disabled={pl.track_ids.includes(track.id)} className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-white/10 disabled:text-[var(--muted)]" onClick={() => { addToPlaylist(pl.id, track.id); setPlaylistOpen(false); }}>{pl.name}{pl.track_ids.includes(track.id) ? " · Added" : ""}</button>)}
          </div>}
        </div>
        <button
          onClick={() => remixTrack(track)}
          className="inline-flex items-center rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent-2)]/20 hover:text-[var(--accent-2)]"
          title="Remix — load this song's pills, lyrics & style into the mixer with a new seed"
        >
          <Wand2 size={14} /><span className="ml-1 text-xs">Remix</span>
        </button>
        <button
          onClick={() => openExport(track)}
          className="inline-flex items-center rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
          title="Save to a file…"
        >
          <FolderDown size={14} /><span className="ml-1 text-xs">Save</span>
        </button>
        <button
          onClick={() => deleteTrack(track.id)}
          className="inline-flex items-center rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent-3)]/20 hover:text-[var(--accent-3)]"
          title="Delete track"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <details open={expanded} className="mt-3 border-t border-white/10 pt-2 text-xs text-[var(--muted)]">
        <summary onClick={(e) => { e.preventDefault(); onExpand(); }} className="cursor-pointer text-[var(--text)]">Song details · seed {track.seed}</summary>
        <div className="mt-2 space-y-2 break-words">
          <p><strong>Ingredients:</strong> {track.pills.map((p) => p.label).join(", ") || "None saved"}</p>
          {track.reference && <p><strong>Reference melody:</strong> {track.reference.name}</p>}
          {track.abc && <p><strong>Arrangement:</strong> {track.options?.reference_mode === "sing" ? "Sing this melody" : track.options?.reference_mode === "backing" ? "Use as backing" : "Original score"}{track.options?.reference_mode && track.options.reference_mode !== "original" ? (track.options.reference_fit_duration !== false ? " · fit to song length" : " · reference length") : ""}</p>}
          <LyricTimingButton track={track} />
          <p><strong>Extra words:</strong> {track.extra === null || track.extra === undefined ? "Not recorded in this older track" : track.extra || "None"}</p>
          <p><strong>Final prompt:</strong> {typeof track.generation_meta?.resolved_style === "string" ? track.generation_meta.resolved_style : track.style}</p>
          {track.options ? <><p>Planning: {track.options.cot} · Requested duration: {track.options.max_duration}s</p><p>Temperature: {track.options.sampling.temperature} · Top-p: {track.options.sampling.top_p} · Top-k: {track.options.sampling.top_k} · Repetition: {track.options.sampling.repetition_penalty}</p></> : <p>Generation settings were not recorded for this track.</p>}
          {track.generation_meta?.truncated && <p className="text-amber-300">Generation reached a token limit; the song may end before its lyrics finish.</p>}
        </div>
      </details>
    </div>
  );
}

function TracksPane() {
  const tracks = useStore((s) => s.tracks);
  const view = usePreferences((s) => s.libraryView);
  const update = usePreferences((s) => s.update);
  const playTrack = useStore((s) => s.playTrack);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const playlists = useStore((s) => s.playlists);
  const activePlaylist = useStore((s) => s.activePlaylist);
  const songSearch = useStore((s) => s.songSearch);
  const setSongSearch = useStore((s) => s.setSongSearch);
  const setTab = useStore((s) => s.setTab);

  const pl = playlists.find((p) => p.id === activePlaylist);
  const base = pl
    ? pl.track_ids
        .map((id) => tracks.find((t) => t.id === id))
        .filter((t): t is Track => Boolean(t))
    : tracks;

  const q = songSearch.trim().toLowerCase();
  const shown = q
    ? base.filter(
        (t) => t.title.toLowerCase().includes(q) || t.style.toLowerCase().includes(q)
      )
    : base;

  return (
    <div data-tour="library" className="flex h-full flex-col overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {pl ? pl.name : "All Tracks"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {shown.length} track{shown.length === 1 ? "" : "s"}
            {q && ` matching “${songSearch}”`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              placeholder="Search songs…"
              title="Search by title or style"
              className="w-56 rounded-xl bg-black/30 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
            />
          </div>
          <button
            onClick={() => setTab("create")}
            title="Create a new song"
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <Plus size={16} /> New Song
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <div aria-label="Library layout" className="flex gap-1 rounded-lg bg-black/30 p-1">{(["compact", "full", "records"] as const).map((mode) => <button key={mode} aria-pressed={view === mode} onClick={() => update({ libraryView: mode })} className={`rounded px-3 py-2 capitalize ${view === mode ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "hover:bg-white/10"}`}>{mode === "records" ? "Record store" : mode}</button>)}</div>
        <button className="rounded-lg bg-white/5 px-3 py-2" onClick={() => setExpanded(new Set(shown.map((t) => t.id)))}>Expand all</button>
        <button className="rounded-lg bg-white/5 px-3 py-2" onClick={() => setExpanded(new Set())}>Collapse all</button>
        {view === "records" && <button disabled={!shown.length} className="rounded-lg bg-[var(--accent-2)]/20 px-3 py-2" onClick={() => { if (shown.length) playTrack(shown[Math.floor(Math.random() * shown.length)]); }}>Pick a record for me</button>}
      </div>
      {view === "records" && <p className="mb-3 text-sm text-[var(--muted)]">Browse the crates · familiar favorites and forgotten discoveries</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/10 text-center text-[var(--muted)]">
            <div>
              <Disc3 size={40} className="mx-auto mb-3 opacity-40" />
              {q ? "No songs match your search." : "No tracks yet. Head to Create to make one."}
            </div>
          </div>
        ) : (
          <div className={`grid items-start gap-4 ${view === "records" ? "record-shelves" : ""}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${view === "compact" ? 220 : view === "records" ? 250 : 310}px), 1fr))` }}>
            {shown.map((t) => (
              <TrackCard key={t.id} track={t} view={view} expanded={expanded.has(t.id)} onExpand={() => setExpanded((old) => { const next = new Set(old); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next; })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LibraryView() {
  const view = usePreferences((s) => s.libraryView);
  if (view === "records") return <div className="h-full p-3"><Suspense fallback={<div className="p-8">Loading record store…</div>}><RecordStore /></Suspense></div>;
  return (
    <div className="flex h-full gap-3 p-3">
      <aside className="glass w-44 lg:w-56 shrink-0 rounded-2xl">
        <PlaylistsPanel />
      </aside>
      <main className="glass min-w-0 flex-1 rounded-2xl">
        <TracksPane />
      </main>
    </div>
  );
}
