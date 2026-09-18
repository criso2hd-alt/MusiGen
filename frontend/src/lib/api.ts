import type {
  EngineInfo,
  GenerationOptions,
  Job,
  LlmOptions,
  ModelStatus,
  Pill,
  PillCatalog,
  Playlist,
  Track,
} from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/api/health").then((r) => j<any>(r)),

  pills: () => fetch("/api/pills").then((r) => j<PillCatalog>(r)),

  engines: () => fetch("/api/engines").then((r) => j<EngineInfo[]>(r)),

  models: () => fetch("/api/models").then((r) => j<Record<string, ModelStatus>>(r)),
  downloadModel: (engine: string) =>
    fetch(`/api/models/${engine}/download`, { method: "POST" }).then((r) =>
      j<ModelStatus>(r)
    ),

  storage: () =>
    fetch("/api/storage").then((r) =>
      j<{
        models: { path: string; bytes: number };
        music: { path: string; bytes: number };
        data: { path: string; bytes: number };
        free_bytes: number;
      }>(r)
    ),

  llmOptions: () => fetch("/api/llm/options").then((r) => j<LlmOptions>(r)),
  selectLlm: (model: string) =>
    fetch("/api/llm/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    }).then((r) => j<LlmOptions>(r)),

  // fire-and-forget: the server dies mid-response, so ignore errors
  shutdown: () =>
    fetch("/api/shutdown", { method: "POST" }).then(
      () => true,
      () => true
    ),

  compose: (pills: Pill[], extra = "", ai = false) =>
    fetch("/api/mixer/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pills, extra, ai }),
    }).then((r) => j<{ style: string; used_llm: boolean }>(r)),

  lyrics: (theme: string, pills: Pill[], structure: string[]) =>
    fetch("/api/lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme, pills, structure }),
    }).then((r) => j<{ lyrics: string; used_llm: boolean }>(r)),

  generate: (body: {
    title?: string;
    style?: string;
    pills: Pill[];
    lyrics: string;
    options: GenerationOptions;
    engine?: string;
  }) =>
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<Job>(r)),

  jobs: () => fetch("/api/jobs").then((r) => j<Job[]>(r)),
  cancelJob: (id: string) =>
    fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).then((r) => j(r)),

  tracks: () => fetch("/api/tracks").then((r) => j<Track[]>(r)),
  deleteTrack: (id: string) =>
    fetch(`/api/tracks/${id}`, { method: "DELETE" }).then((r) => j(r)),
  renameTrack: (id: string, title: string) =>
    fetch(`/api/tracks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => j<Track>(r)),

  generateCover: (id: string, opts?: { prompt?: string; seed?: number }) =>
    fetch(`/api/tracks/${id}/cover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts || {}),
    }).then((r) => j<Track>(r)),

  downloadUrl: (id: string) => `/api/tracks/${id}/download`,
  saveTrackTo: (id: string, path: string) =>
    fetch(`/api/tracks/${id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).then((r) => j<{ path: string }>(r)),
  exportTrack: (
    id: string,
    folder: string,
    format: "flac" | "wav",
    filename?: string
  ) =>
    fetch(`/api/tracks/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder, format, filename }),
    }).then((r) => j<{ path: string; folder: string; filename: string }>(r)),

  playlists: () => fetch("/api/playlists").then((r) => j<Playlist[]>(r)),
  createPlaylist: (name: string) =>
    fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<Playlist>(r)),
  renamePlaylist: (id: string, name: string) =>
    fetch(`/api/playlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<Playlist>(r)),
  reorderPlaylists: (order: string[]) =>
    fetch("/api/playlists/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).then((r) => j<Playlist[]>(r)),
  addToPlaylist: (plId: string, trackId: string) =>
    fetch(`/api/playlists/${plId}/tracks/${trackId}`, { method: "POST" }).then(
      (r) => j<Playlist>(r)
    ),
  removeFromPlaylist: (plId: string, trackId: string) =>
    fetch(`/api/playlists/${plId}/tracks/${trackId}`, {
      method: "DELETE",
    }).then((r) => j<Playlist>(r)),
  deletePlaylist: (id: string) =>
    fetch(`/api/playlists/${id}`, { method: "DELETE" }).then((r) => j(r)),
};
