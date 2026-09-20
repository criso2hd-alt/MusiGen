import { create } from "zustand";
import { api } from "./lib/api";
import { composeRecipe } from "./lib/recipe";
import { playbackTracks, adjacentTrack } from "./lib/playbackQueue";
import { audioEngine } from "./lib/audio";
import { dock } from "./components/workspace/dock";
import type {
  EngineInfo,
  GenerationOptions,
  Job,
  LlmOptions,
  ModelStatus,
  Pill,
  PillCatalog,
  PillCategory,
  PillSort,
  Playlist,
  Track, ReferenceMelody,
  VizConfig,
  VizPreset,
} from "./lib/types";

let pillCounter = 0;
let recipeRevision = 0;
function recipePatch(mixerPills: Pill[], extra: string) {
  recipeRevision++;
  return { mixerPills, extra, style: composeRecipe(mixerPills, extra), usedLlm: false, composing: false, promptWarning: "" };
}
const uid = () => `p${Date.now().toString(36)}${pillCounter++}`;

const ls = {
  get: (k: string, fallback: string) => {
    try {
      return localStorage.getItem(k) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};
const num = (k: string, fallback: number) =>
  parseFloat(ls.get(k, String(fallback))) || fallback;

const SKINS = ["bars", "wave", "aurora", "radial", "mirror", "ripple"] as const;

const DEFAULT_VIZ: VizConfig = {
  skin: "bars",
  colors: ["#22d3ee", "#a855f7", "#f43f5e"],
  intensity: 1,
  density: 1,
  glow: 8,
  spin: true,
};

function randomViz(): VizConfig {
  const h = Math.floor(Math.random() * 360);
  const hue = (o: number) => (h + o) % 360;
  const c = (o: number) =>
    `hsl(${hue(o)} ${70 + Math.floor(Math.random() * 20)}% ${
      55 + Math.floor(Math.random() * 12)
    }%)`;
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(SKINS),
    colors: [c(0), c(40 + Math.random() * 140), c(180 + Math.random() * 140)],
    intensity: 0.7 + Math.random() * 0.8,
    density: 0.6 + Math.random() * 1.0,
    glow: Math.floor(Math.random() * 22),
    spin: Math.random() > 0.4,
  };
}

function loadViz(): VizConfig {
  try {
    const raw = ls.get("mg.viz", "");
    if (raw) return { ...DEFAULT_VIZ, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_VIZ;
}

function loadPresets(): VizPreset[] {
  try {
    return JSON.parse(ls.get("mg.vizFavorites", "[]"));
  } catch {
    return [];
  }
}

const DEFAULT_THEME = { accent: "#22d3ee", accent2: "#a855f7", accent3: "#f43f5e" };

function loadTheme(): { accent: string; accent2: string; accent3: string } {
  try {
    const raw = ls.get("mg.theme", "");
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function applyTheme(t: { accent: string; accent2: string; accent3: string }) {
  try {
    const r = document.documentElement.style;
    r.setProperty("--accent", t.accent);
    r.setProperty("--accent-2", t.accent2);
    r.setProperty("--accent-3", t.accent3);
  } catch {
    /* ignore */
  }
}

const defaultOptions: GenerationOptions = {
  cot: "full",
  seed: 831001,
  cfg_scale: null,
  max_duration: 60,
  sampling: { temperature: 1.0, top_p: 0.95, top_k: 100, repetition_penalty: 1.2 },
};

interface State {
  // config
  engine: string; // currently selected engine
  engines: EngineInfo[];
  models: Record<string, ModelStatus>;
  llm: LlmOptions | null;
  ollama: boolean;
  catalog: PillCatalog | null;

  // mixer
  mixerPills: Pill[];
  extra: string;
  style: string;
  usedLlm: boolean;
  promptWarning: string;
  abc: string | null;
  reference: ReferenceMelody | null;
  referenceTask: string | null;
  setReferenceTask: (id: string) => void;
  setReference: (reference: ReferenceMelody | null) => void;
  lyrics: string;
  theme: string;
  title: string;
  lyricsStructure: string[];
  options: GenerationOptions;
  composing: boolean;

  // data
  jobs: Record<string, Job>;
  tracks: Track[];
  playlists: Playlist[];

  // view
  tab: "create" | "library" | "setup";
  activePlaylist: string | null;

  // theme (user-customizable accent colors)
  themeColors: { accent: string; accent2: string; accent3: string };

  // player
  current: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playerExpanded: boolean;

  // visualizer
  viz: VizConfig;
  vizFavorites: VizPreset[];
  vizEngine: "milkdrop" | "classic";
  showLyrics: boolean;

  // cover generation (per-track in-flight flags)
  coverBusy: Record<string, boolean>;

  // mixer sort + search
  pillSort: PillSort;
  pillView: "list" | "watch";
  songSearch: string;
  playlistSearch: string;

  // layout (resizable panels, persisted)
  sidebarW: number;
  trayW: number;
  playerH: number;

  // export + toast
  exportTarget: Track | null;
  lastFolder: string;
  toast: { msg: string; kind: "ok" | "err" } | null;

  // app lifecycle
  closed: boolean;

  // actions
  init: () => Promise<void>;
  setEngine: (id: string) => void;
  shutdownApp: () => Promise<void>;
  downloadModel: (engine: string) => Promise<void>;
  ingestModel: (m: ModelStatus) => void;
  fetchLlmOptions: () => Promise<void>;
  selectLlm: (model: string) => Promise<void>;
  addPill: (category: Pill["category"], label: string) => void;
  removePill: (id: string) => void;
  setPillWeight: (id: string, weight: number) => void;
  clearMixer: () => void;
  setExtra: (v: string) => void;
  setLyrics: (v: string) => void;
  setTheme: (v: string) => void;
  setTitle: (v: string) => void;
  setOptions: (patch: Partial<GenerationOptions>) => void;
  compose: () => Promise<void>;
  refineStyleAI: () => Promise<void>;
  setLyricsStructure: (s: string[]) => void;
  generateLyrics: (fitDuration?: boolean) => Promise<void>;
  generate: () => Promise<void>;
  cancelJob: (id: string) => void;
  ingestJob: (job: Job) => void;
  ingestTrack: (track: Track) => void;
  refreshTracks: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  addToPlaylist: (plId: string, trackId: string) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  remixTrack: (track: Track, newSeed?: boolean) => void;
  generateCover: (trackId: string) => Promise<void>;
  toggleLyrics: () => void;
  renameTrack: (id: string, title: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  reorderPlaylists: (order: string[]) => Promise<void>;
  setTab: (t: State["tab"]) => void;
  setActivePlaylist: (id: string | null) => void;
  setThemeColors: (patch: Partial<State["themeColors"]>) => void;

  // mixer sort + search
  setPillSort: (s: PillSort) => void;
  setPillView: (v: "list" | "watch") => void;
  setSongSearch: (v: string) => void;
  setPlaylistSearch: (v: string) => void;

  // visualizer actions
  setVizEngine: (e: "milkdrop" | "classic") => void;
  setViz: (patch: Partial<VizConfig>) => void;
  randomizeViz: () => void;
  saveVizPreset: (name: string) => void;
  applyVizPreset: (id: string) => void;
  deleteVizPreset: (id: string) => void;

  // player actions
  playTrack: (t: Track) => Promise<void>;
  togglePlay: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  next: () => void;
  prev: () => void;
  setPlayerExpanded: (v: boolean) => void;

  // layout actions
  setSize: (key: "sidebarW" | "trayW" | "playerH", px: number) => void;

  // export + toast actions
  openExport: (t: Track) => void;
  closeExport: () => void;
  exportTrack: (
    folder: string,
    format: "flac" | "wav",
    filename?: string
  ) => Promise<void>;
  showToast: (msg: string, kind?: "ok" | "err") => void;
}

export const useStore = create<State>((set, get) => ({
  engine: "stub",
  engines: [],
  models: {},
  llm: null,
  ollama: false,
  catalog: null,
  mixerPills: [],
  extra: "",
  promptWarning: "",
  abc: null,
  reference: null,
  referenceTask: null,
  setReferenceTask: (id) => set({ referenceTask: id }),
  setReference: (reference) => {
    recipeRevision++;
    set((s) => ({ reference, abc: reference?.abc || null, options: reference ? { ...s.options, cot: "melody", reference_mode: "sing", reference_fit_duration: true } : s.options }));
  },
  style: "",
  usedLlm: false,
  lyrics: "[verse]\n\n[chorus]\n",
  theme: "",
  title: "",
  lyricsStructure: ["verse", "chorus", "verse", "chorus", "bridge", "chorus"],
  options: defaultOptions,
  composing: false,
  jobs: {},
  tracks: [],
  playlists: [],
  tab: "create",
  activePlaylist: null,
  themeColors: loadTheme(),
  current: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.9,
  playerExpanded: false,

  viz: loadViz(),
  vizFavorites: loadPresets(),
  vizEngine: (ls.get("mg.vizEngine", "milkdrop") as "milkdrop" | "classic"),
  showLyrics: ls.get("mg.showLyrics", "0") === "1",
  coverBusy: {},

  pillSort: (ls.get("mg.pillSort", "category") as PillSort) || "category",
  pillView: (ls.get("mg.pillView", "list") as "list" | "watch") || "list",
  songSearch: "",
  playlistSearch: "",

  sidebarW: num("mg.sidebarW", 240),
  trayW: num("mg.trayW", 340),
  playerH: num("mg.playerH", 112),

  exportTarget: null,
  lastFolder: ls.get("mg.lastFolder", ""),
  toast: null,
  closed: false,

  init: async () => {
    applyTheme(get().themeColors);
    const [health, catalog, tracks, playlists, engines, models, llm] =
      await Promise.all([
        api.health().catch(() => ({ engine: "stub", ollama: false })),
        api.pills().catch(() => null),
        api.tracks().catch(() => []),
        api.playlists().catch(() => []),
        api.engines().catch(() => [] as EngineInfo[]),
        api.models().catch(() => ({} as Record<string, ModelStatus>)),
        api.llmOptions().catch(() => null),
      ]);
    // choose selected engine: persisted (if ready) → backend default → first ready
    const saved = ls.get("mg.engine", "");
    const ready = engines.filter((e) => e.ready);
    const pick =
      (saved && ready.some((e) => e.id === saved) && saved) ||
      (ready.some((e) => e.id === health.engine) && health.engine) ||
      ready[0]?.id ||
      health.engine;
    set({
      engine: pick,
      engines,
      models,
      llm,
      ollama: health.ollama,
      catalog,
      tracks,
      playlists,
    });

    // wire audio element -> store
    const el = audioEngine.el;
    el.addEventListener("timeupdate", () =>
      set({ currentTime: el.currentTime, duration: el.duration || 0 })
    );
    el.addEventListener("play", () => set({ isPlaying: true }));
    el.addEventListener("pause", () => set({ isPlaying: false }));
    el.addEventListener("ended", () => get().next());
    audioEngine.setVolume(get().volume);

    // keep status fresh (e.g. after Ollama starts, or a model finishes
    // downloading) WITHOUT overriding the user's engine selection.
    setInterval(async () => {
      try {
        const [h, engines] = await Promise.all([api.health(), api.engines()]);
        set({ ollama: h.ollama, engines });
      } catch {
        /* ignore */
      }
    }, 15000);
  },

  setEngine: (id) => {
    ls.set("mg.engine", id);
    set({ engine: id });
  },

  downloadModel: async (engine) => {
    const m = await api.downloadModel(engine);
    set((s) => ({ models: { ...s.models, [engine]: m } }));
  },
  ingestModel: (m) =>
    set((s) => {
      const models = { ...s.models, [m.engine]: m };
      // refresh engine readiness when a model finishes
      const engines = s.engines.map((e) =>
        e.id === m.engine && m.ready ? { ...e, ready: true, note: "" } : e
      );
      return { models, engines };
    }),
  fetchLlmOptions: async () => {
    const llm = await api.llmOptions().catch(() => null);
    if (llm) set({ llm });
  },
  selectLlm: async (model) => {
    const llm = await api.selectLlm(model);
    // readiness of the "llm" model row depends on the selection → refresh it
    const models = await api.models().catch(() => null);
    set((s) => ({ llm, models: models ?? s.models }));
  },

  shutdownApp: async () => {
    try {
      audioEngine.pause();
    } catch {
      /* ignore */
    }
    await api.shutdown(); // kills the backend process -> releases VRAM
    set({ closed: true });
    try {
      window.close(); // works if the window was script-opened
    } catch {
      /* ignore */
    }
  },

  addPill: (category, label) =>
    set((s) => {
      if (s.mixerPills.some((p) => p.category === category && p.label === label))
        return s;
      return recipePatch([...s.mixerPills, { id: uid(), category, label, weight: 1 }], s.extra);
    }),
  removePill: (id) =>
    set((s) => recipePatch(s.mixerPills.filter((p) => p.id !== id), s.extra)),
  setPillWeight: (id, weight) =>
    set((s) => recipePatch(s.mixerPills.map((p) => (p.id === id ? { ...p, weight } : p)), s.extra)),
  clearMixer: () => set((s) => recipePatch([], s.extra)),
  setExtra: (v) => set((s) => recipePatch(s.mixerPills, v)),
  setLyrics: (v) => set({ lyrics: v }),
  setTheme: (v) => set({ theme: v }),
  setTitle: (v) => set({ title: v }),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),

  compose: async () => {
    const { mixerPills, extra } = get();
    set(recipePatch(mixerPills, extra));
  },

  refineStyleAI: async () => {
    const { mixerPills, extra } = get();
    if (mixerPills.length === 0 && !extra.trim()) return;
    const revision = ++recipeRevision;
    set({ composing: true, promptWarning: "" });
    try {
      const r = await api.compose(mixerPills, extra, true);
      if (revision === recipeRevision) {
        set({ style: r.style, usedLlm: r.used_llm, promptWarning: r.warning || "" });
      }
    } catch (error) {
      if (revision === recipeRevision) set({ promptWarning: String(error) });
    } finally {
      if (revision === recipeRevision) set({ composing: false });
    }
  },
  setLyricsStructure: (s) => set({ lyricsStructure: s }),
  generateLyrics: async (fitDuration = true) => {
    const { theme, mixerPills, lyricsStructure, options, style, lyrics } = get();
    const r = await api.lyrics(theme, mixerPills, lyricsStructure, options.max_duration, options.bpm, fitDuration, style);
    if (get().lyrics !== lyrics || get().theme !== theme || get().mixerPills !== mixerPills || get().lyricsStructure !== lyricsStructure || get().options !== options) {
      throw new Error("Your lyrics or recipe changed while writing. Your edits were kept; press Write again to use the updated recipe.");
    }
    set({ lyrics: r.lyrics });
    if (r.warning) get().showToast(r.warning, "err");
  },

  generate: async () => {
    const { mixerPills, style, extra, abc, reference, lyrics, options, title, engine } = get();
    const job = await api.generate({
      title: title || undefined,
      style: style || undefined,
      extra,
      abc: abc || undefined,
      reference_id: reference?.id,
      pills: mixerPills,
      lyrics,
      options,
      engine,
    });
    get().ingestJob(job);
  },

  cancelJob: (id) => {
    api.cancelJob(id).catch(() => {});
  },

  ingestJob: (job) =>
    set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),

  ingestTrack: (track) =>
    set((s) => ({ tracks: [track, ...s.tracks.filter((t) => t.id !== track.id)], current: s.current?.id === track.id ? track : s.current })),

  refreshTracks: async () => set({ tracks: await api.tracks() }),
  refreshPlaylists: async () => set({ playlists: await api.playlists() }),

  createPlaylist: async (name) => {
    await api.createPlaylist(name);
    await get().refreshPlaylists();
  },
  addToPlaylist: async (plId, trackId) => {
    await api.addToPlaylist(plId, trackId);
    await get().refreshPlaylists();
  },
  deleteTrack: async (id) => {
    await api.deleteTrack(id);
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
  },

  remixTrack: (track, newSeed = true) => {
    recipeRevision++;
    let pills: Pill[] = [];
    const extras: string[] = [];
    if (track.pills && track.pills.length) {
      pills = track.pills.map((p) => ({ ...p, id: uid() }));
    } else if (track.extra == null) {
      // Only reconstruct legacy recipes; a saved empty mixer is intentional.
      const cat = get().catalog;
      const lookup: Record<string, { category: PillCategory; label: string }> = {};
      if (cat) {
        (Object.keys(cat) as PillCategory[]).forEach((c) =>
          cat[c].forEach((l) => (lookup[l.toLowerCase()] = { category: c, label: l }))
        );
      }
      track.style
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((tok) => {
          const hit = lookup[tok.toLowerCase()];
          if (hit) pills.push({ id: uid(), category: hit.category, label: hit.label, weight: 1 });
          else extras.push(tok);
        });
    }
    set({
      mixerPills: pills,
      extra: track.extra ?? extras.join(", "),
      lyrics: track.lyrics || "",
      lyricsStructure: Array.from((track.lyrics || "").matchAll(/^\s*\[([^\]]+)\]\s*$/gm), (match) => match[1]),
      style: track.style,
      abc: track.abc ?? null,
      reference: track.reference ? { ...track.reference, abc: track.abc ?? undefined } : null,
      composing: false,
      usedLlm: false,
      promptWarning: track.options ? "" : "This older track has no saved generation settings. Defaults are shown; its original seed is available.",
      title: track.title,
      engine: track.engine,
      options: { ...(track.options ?? defaultOptions), sampling: { ...(track.options?.sampling ?? defaultOptions.sampling) }, seed: newSeed ? Math.floor(Math.random() * 1_000_000) : track.seed },
      tab: "create",
    });
    get().showToast(`Loaded "${track.title}" — ${newSeed ? "new seed set" : "original seed restored"}`, "ok");
    setTimeout(() => dock.focus("mixer"), 50);
  },

  generateCover: async (trackId) => {
    if (get().coverBusy[trackId]) return;
    if (!get().models.cover?.ready) {
      get().showToast("Download the Cover model in Setup first", "err");
      return;
    }
    set((s) => ({ coverBusy: { ...s.coverBusy, [trackId]: true } }));
    try {
      const t = await api.generateCover(trackId);
      set((s) => ({
        tracks: s.tracks.map((x) => (x.id === t.id ? t : x)),
        current: s.current?.id === t.id ? t : s.current,
      }));
      get().showToast(`Cover created for "${t.title}"`, "ok");
    } catch (e: any) {
      get().showToast(`Cover failed: ${String(e).slice(0, 120)}`, "err");
    } finally {
      set((s) => {
        const cb = { ...s.coverBusy };
        delete cb[trackId];
        return { coverBusy: cb };
      });
    }
  },
  toggleLyrics: () => {
    const showLyrics = !get().showLyrics;
    ls.set("mg.showLyrics", showLyrics ? "1" : "0");
    set({ showLyrics });
  },

  setTab: (t) => set({ tab: t }),
  setActivePlaylist: (id) => set({ activePlaylist: id, tab: "library" }),
  setThemeColors: (patch) => {
    const themeColors = { ...get().themeColors, ...patch };
    ls.set("mg.theme", JSON.stringify(themeColors));
    applyTheme(themeColors);
    set({ themeColors });
  },

  playTrack: async (t) => {
    set({ current: t });
    await audioEngine.play(t.audio_url);
  },
  togglePlay: () => {
    const { isPlaying, current } = get();
    if (!current) return;
    if (isPlaying) audioEngine.pause();
    else audioEngine.play();
  },
  seek: (t) => {
    audioEngine.seek(t);
    set({ currentTime: t });
  },
  setVolume: (v) => {
    audioEngine.setVolume(v);
    set({ volume: v });
  },
  next: () => {
    const { current, tracks, playlists, activePlaylist } = get();
    const track = adjacentTrack(playbackTracks(tracks, playlists, activePlaylist), current?.id, 1);
    if (track) void get().playTrack(track);
    else audioEngine.pause();
  },
  prev: () => {
    const { current, tracks, playlists, activePlaylist } = get();
    const track = adjacentTrack(playbackTracks(tracks, playlists, activePlaylist), current?.id, -1);
    if (track) void get().playTrack(track);
    else audioEngine.pause();
  },
  setPlayerExpanded: (v) => set({ playerExpanded: v }),

  setVizEngine: (e) => {
    ls.set("mg.vizEngine", e);
    set({ vizEngine: e });
  },
  setViz: (patch) => {
    const viz = { ...get().viz, ...patch };
    ls.set("mg.viz", JSON.stringify(viz));
    set({ viz });
  },
  randomizeViz: () => {
    const viz = randomViz();
    ls.set("mg.viz", JSON.stringify(viz));
    set({ viz });
  },
  saveVizPreset: (name) => {
    const preset: VizPreset = {
      id: `viz_${Date.now().toString(36)}`,
      name: name || `Preset ${get().vizFavorites.length + 1}`,
      config: get().viz,
    };
    const vizFavorites = [...get().vizFavorites, preset];
    ls.set("mg.vizFavorites", JSON.stringify(vizFavorites));
    set({ vizFavorites });
    get().showToast(`Saved preset "${preset.name}"`, "ok");
  },
  applyVizPreset: (id) => {
    const p = get().vizFavorites.find((x) => x.id === id);
    if (p) {
      ls.set("mg.viz", JSON.stringify(p.config));
      set({ viz: p.config });
    }
  },
  deleteVizPreset: (id) => {
    const vizFavorites = get().vizFavorites.filter((x) => x.id !== id);
    ls.set("mg.vizFavorites", JSON.stringify(vizFavorites));
    set({ vizFavorites });
  },

  setPillSort: (s) => {
    ls.set("mg.pillSort", s);
    set({ pillSort: s });
  },
  setPillView: (v) => {
    ls.set("mg.pillView", v);
    set({ pillView: v });
  },
  setSongSearch: (v) => set({ songSearch: v }),
  setPlaylistSearch: (v) => set({ playlistSearch: v }),

  renameTrack: async (id, title) => {
    const t = await api.renameTrack(id, title);
    set((s) => ({
      tracks: s.tracks.map((x) => (x.id === id ? t : x)),
      current: s.current?.id === id ? t : s.current,
    }));
  },
  renamePlaylist: async (id, name) => {
    await api.renamePlaylist(id, name);
    await get().refreshPlaylists();
  },
  reorderPlaylists: async (order) => {
    // optimistic
    set((s) => ({
      playlists: order
        .map((id) => s.playlists.find((p) => p.id === id))
        .filter((p): p is Playlist => Boolean(p)),
    }));
    const pls = await api.reorderPlaylists(order);
    set({ playlists: pls });
  },

  setSize: (key, px) => {
    const clamp = {
      sidebarW: [180, 420],
      trayW: [240, 560],
      playerH: [96, 560],
    }[key];
    const val = Math.max(clamp[0], Math.min(clamp[1], px));
    ls.set(`mg.${key}`, String(val));
    set({ [key]: val } as any);
  },

  openExport: (t) => set({ exportTarget: t }),
  closeExport: () => set({ exportTarget: null }),
  exportTrack: async (folder, format, filename) => {
    const t = get().exportTarget;
    if (!t) return;
    try {
      const r = await api.exportTrack(t.id, folder, format, filename);
      ls.set("mg.lastFolder", folder);
      set({ lastFolder: folder, exportTarget: null });
      get().showToast(`Saved to ${r.path}`, "ok");
    } catch (e: any) {
      get().showToast(`Export failed: ${String(e).slice(0, 120)}`, "err");
    }
  },
  showToast: (msg, kind = "ok") => {
    set({ toast: { msg, kind } });
    setTimeout(() => {
      if (get().toast?.msg === msg) set({ toast: null });
    }, 4000);
  },
}));
