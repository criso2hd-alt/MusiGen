import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListMusic, Plus, Music2, Search, GripVertical } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../store";
import type { Playlist } from "../../lib/types";

function PlaylistRow({ pl, sortable }: { pl: Playlist; sortable: boolean }) {
  const activePlaylist = useStore((s) => s.activePlaylist);
  const setActivePlaylist = useStore((s) => s.setActivePlaylist);
  const renamePlaylist = useStore((s) => s.renamePlaylist);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pl.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pl.id, disabled: !sortable });

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== pl.name) renamePlaylist(pl.id, name.trim());
    else setName(pl.name);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "group flex items-center gap-1 rounded-xl pr-1 transition",
        activePlaylist === pl.id ? "bg-white/10" : "hover:bg-white/5",
        isDragging && "opacity-60"
      )}
    >
      {sortable && (
        <button
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          className="cursor-grab px-1 text-[var(--muted)] opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={13} />
        </button>
      )}
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(pl.name);
              setEditing(false);
            }
          }}
          className="my-1 w-full rounded-md bg-black/40 px-2 py-1 text-sm outline-none ring-1 ring-[var(--accent)]/50"
        />
      ) : (
        <button
          onClick={() => setActivePlaylist(pl.id)}
          onDoubleClick={() => {
            setName(pl.name);
            setEditing(true);
          }}
          title={`${pl.name} — double-click to rename`}
          className={clsx(
            "flex flex-1 items-center gap-2 py-2 text-sm",
            activePlaylist === pl.id ? "text-white" : "text-[var(--muted)]",
            !sortable && "pl-2"
          )}
        >
          <ListMusic size={15} />
          <span className="truncate">{pl.name}</span>
          <span className="ml-auto text-xs text-[var(--muted)]">
            {pl.track_ids.length}
          </span>
        </button>
      )}
    </div>
  );
}

export function PlaylistsPanel() {
  const playlists = useStore((s) => s.playlists);
  const tracks = useStore((s) => s.tracks);
  const activePlaylist = useStore((s) => s.activePlaylist);
  const setActivePlaylist = useStore((s) => s.setActivePlaylist);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const reorderPlaylists = useStore((s) => s.reorderPlaylists);
  const playlistSearch = useStore((s) => s.playlistSearch);
  const setPlaylistSearch = useStore((s) => s.setPlaylistSearch);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const q = playlistSearch.trim().toLowerCase();
  const shown = q
    ? playlists.filter((p) => p.name.toLowerCase().includes(q))
    : playlists;
  const sortable = !q;

  const submit = async () => {
    if (name.trim()) await createPlaylist(name.trim());
    setName("");
    setCreating(false);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = playlists.map((p) => p.id);
    reorderPlaylists(
      arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    );
  };

  return (
    <div className="flex h-full flex-col p-2">
      <button
        onClick={() => setActivePlaylist(null)}
        className={clsx(
          "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
          !activePlaylist
            ? "bg-white/10 text-white"
            : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
        )}
      >
        <Music2 size={16} /> All Tracks
        <span className="ml-auto text-xs text-[var(--muted)]">{tracks.length}</span>
      </button>

      <div className="mb-2 mt-3 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Playlists
        </span>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md p-1 text-[var(--muted)] hover:bg-white/10 hover:text-white"
          title="New playlist"
        >
          <Plus size={15} />
        </button>
      </div>

      {playlists.length > 3 && (
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={playlistSearch}
            onChange={(e) => setPlaylistSearch(e.target.value)}
            placeholder="Search playlists…"
            className="w-full rounded-lg bg-black/30 py-1.5 pl-8 pr-2 text-xs outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/50"
          />
        </div>
      )}

      {creating && (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Playlist name"
          className="mb-1 w-full rounded-lg bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-[var(--accent)]/40"
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && !creating && (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">
            {q ? "No playlists match." : "No playlists yet."}
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {shown.map((pl) => (
                <PlaylistRow key={pl.id} pl={pl} sortable={sortable} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
