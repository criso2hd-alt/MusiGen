import { useState } from "react";
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
import { AlbumArt } from "../player/AlbumArt";
import { PlaylistsPanel } from "../panels/PlaylistsPanel";

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

function TrackCard({ track }: { track: Track }) {
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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.title);

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== track.title) renameTrack(track.id, name.trim());
    else setName(track.title);
  };

  return (
    <div
      className={`glass group flex flex-col rounded-2xl p-4 transition hover:bg-white/5 ${
        isCurrent ? "ring-1 ring-[var(--accent)]/60" : ""
      }`}
    >
      <div className="relative mb-3 grid aspect-square place-items-center overflow-hidden rounded-xl bg-black/20">
        <AlbumArt
          size={150}
          playing={isCurrent && isPlaying}
          cover={track.cover_url ?? null}
          seed={seedOf(track.id)}
        />
        <button
          onClick={() => playTrack(track)}
          title="Play"
          className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent)] text-black shadow-xl">
            <Play size={20} className="ml-0.5" />
          </span>
        </button>
        <button
          onClick={() => generateCover(track.id)}
          disabled={coverBusy}
          title={
            coverReady
              ? track.cover_url
                ? "Regenerate cover art (AI)"
                : "Generate album cover (AI)"
              : "Download the Cover model in Setup to enable this"
          }
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/50 text-white/80 opacity-0 backdrop-blur-sm transition hover:bg-black/70 hover:text-white group-hover:opacity-100 disabled:opacity-100"
        >
          {coverBusy ? (
            <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
          ) : (
            <ImageIcon size={15} />
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
            className="rounded p-0.5 text-[var(--muted)] opacity-0 transition hover:text-white group-hover:opacity-100"
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

      <div className="mt-3 flex flex-wrap items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {playlists.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) addToPlaylist(e.target.value, track.id);
              e.target.value = "";
            }}
            defaultValue=""
            title="Add this track to a playlist"
            className="min-w-0 flex-1 basis-full rounded-lg bg-black/40 px-2 py-1 text-xs outline-none ring-1 ring-white/10"
          >
            <option value="" disabled>
              + Add to playlist
            </option>
            {playlists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => remixTrack(track)}
          className="rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent-2)]/20 hover:text-[var(--accent-2)]"
          title="Remix — load this song's pills, lyrics & style into the mixer with a new seed"
        >
          <Wand2 size={14} />
        </button>
        <button
          onClick={() => openExport(track)}
          className="rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
          title="Save to a file…"
        >
          <FolderDown size={14} />
        </button>
        <button
          onClick={() => deleteTrack(track.id)}
          className="rounded-lg bg-white/5 p-1.5 text-[var(--muted)] hover:bg-[var(--accent-3)]/20 hover:text-[var(--accent-3)]"
          title="Delete track"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function TracksPane() {
  const tracks = useStore((s) => s.tracks);
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
    <div className="flex h-full flex-col overflow-hidden p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {pl ? pl.name : "All Tracks"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {shown.length} track{shown.length === 1 ? "" : "s"}
            {q && ` matching “${songSearch}”`}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/10 text-center text-[var(--muted)]">
            <div>
              <Disc3 size={40} className="mx-auto mb-3 opacity-40" />
              {q ? "No songs match your search." : "No tracks yet. Head to Create to make one."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((t) => (
              <TrackCard key={t.id} track={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LibraryView() {
  return (
    <div className="flex h-full gap-3 p-3">
      <aside className="glass w-64 shrink-0 rounded-2xl">
        <PlaylistsPanel />
      </aside>
      <main className="glass min-w-0 flex-1 rounded-2xl">
        <TracksPane />
      </main>
    </div>
  );
}
