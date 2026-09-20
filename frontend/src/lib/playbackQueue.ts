/** Use playlist order; a missing/empty selected playlist must never fall back to All Tracks. */
export function playbackTracks<T extends { id: string }>(tracks: T[], playlists: { id: string; track_ids: string[] }[], selected: string | null): T[] {
  if (selected === null) return tracks;
  const ids = playlists.find((p) => p.id === selected)?.track_ids || [];
  const lookup = new Map(tracks.map((t) => [t.id, t]));
  return [...new Set(ids)].map((id) => lookup.get(id)).filter((t): t is T => !!t);
}
export function adjacentTrack<T extends { id: string }>(tracks: T[], currentId: string | undefined, direction: 1 | -1): T | undefined {
  if (!tracks.length) return undefined;
  const index = tracks.findIndex((t) => t.id === currentId);
  if (index < 0) return direction === 1 ? tracks[0] : tracks[tracks.length - 1];
  return tracks[(index + direction + tracks.length) % tracks.length];
}
