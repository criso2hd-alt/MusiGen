import { useEffect, useState, type ReactNode } from "react";
import {
  Palette,
  Cpu,
  ScrollText,
  Sparkles,
  HardDriveDownload,
  HardDrive,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  Coffee,
} from "lucide-react";
import { useStore } from "../../store";
import { api } from "../../lib/api";
import { EngineSelector } from "./EngineSelector";
import { MicrophoneSetup } from "./MicrophoneSetup";
import { MediaToolsSetup } from "./MediaToolsSetup";

function fmtBytes(n: number) {
  if (!n) return "0 MB";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(n / 1e6))} MB`;
}

function openPath(path: string) {
  const bridge = (window as any).pywebview?.api;
  if (bridge?.open_path) bridge.open_path(path);
}

type StorageInfo = Awaited<ReturnType<typeof api.storage>>;

function StorageSettings() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    api
      .storage()
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const rows: { key: "models" | "music" | "data"; label: string; hint: string }[] = [
    { key: "models", label: "Models", hint: "Downloaded AI models" },
    { key: "music", label: "Music", hint: "Your generated songs" },
    { key: "data", label: "Data", hint: "Library database + cover images" },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        Everything MusiGen stores lives in its own folder next to the app â€” delete
        that folder and it's all gone. Nothing is written elsewhere.
      </p>
      {info &&
        rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-3 rounded-xl bg-black/30 p-3"
          >
            <HardDrive size={16} className="shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.label}</span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {fmtBytes(info[r.key].bytes)}
                </span>
              </div>
              <div className="truncate text-[11px] text-[var(--muted)]" title={info[r.key].path}>
                {r.hint} Â· {info[r.key].path}
              </div>
            </div>
            <button
              onClick={() => openPath(info[r.key].path)}
              title="Open this folder"
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
            >
              <FolderOpen size={13} /> Open
            </button>
          </div>
        ))}
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{info ? `${fmtBytes(info.free_bytes)} free on this drive` : "â€¦"}</span>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:text-white"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </div>
  );
}

function fmtEta(s: number) {
  if (!s || !isFinite(s)) return "";
  s = Math.round(s);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s left` : `${s}s left`;
}

const MODEL_META: Record<string, { label: string; size: string; note: string }> = {
  yue2: {
    label: "YuE2 music model",
    size: "~7.8 GB",
    note: "Needed to generate songs with YuE2. Otherwise it downloads on your first song.",
  },
  llm: {
    label: "Lyric writer (Qwen2.5)",
    size: "~15 GB",
    note: "Powers the AI lyric writer and prompt refiner, on your GPU. Optional.",
  },
  cover: {
    label: "Cover art (SD-Turbo)",
    size: "~2.5 GB",
    note: "Generates album covers from a description, on your GPU. Optional.",
  },
};

function ModelRow({ id }: { id: string }) {
  const m = useStore((s) => s.models[id]);
  const downloadModel = useStore((s) => s.downloadModel);
  const llm = useStore((s) => s.llm);
  let meta = MODEL_META[id];
  // The lyric model's label/size depends on the chosen size.
  if (id === "llm" && llm) {
    const sel = llm.options.find((o) => o.repo === llm.selected);
    if (sel) {
      meta = {
        label: `Lyric writer â€” ${sel.key} (Qwen2.5)`,
        size: sel.size,
        note: "Powers the AI lyric writer and prompt refiner, on your GPU. Optional.",
      };
    }
  }
  if (!m || !meta) return null;

  return (
    <div className="mt-3 rounded-xl bg-black/30 p-3">
      <div className="flex items-center gap-2 text-sm">
        <HardDriveDownload size={14} className="text-[var(--accent)]" />
        <span className="font-medium">{meta.label}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${
            m.ready
              ? "bg-[var(--good)]/15 text-[var(--good)]"
              : m.downloading
              ? "bg-[var(--accent)]/15 text-[var(--accent)]"
              : "bg-white/5 text-[var(--muted)]"
          }`}
        >
          {m.ready ? "installed" : m.downloading ? "downloading" : "not downloaded"}
        </span>
      </div>

      {m.ready ? (
        <p className="mt-1 text-xs text-[var(--muted)]">Ready â€” cached in your MusiGen folder.</p>
      ) : m.downloading ? (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="progress-sheen h-full rounded-full transition-all"
              style={{ width: `${Math.max(3, m.percent)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
            <span>{m.message || `${Math.round(m.percent)}%`}</span>
            <span>
              {m.speed_mbps > 0
                ? `${m.speed_mbps.toFixed(1)} MB/s Â· ${fmtEta(m.eta_sec)}`
                : ""}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1">
          <p className="mb-2 text-xs text-[var(--muted)]">
            {meta.note} ({meta.size}, oneâ€‘time)
          </p>
          <button
            onClick={() => downloadModel(id)}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/20 px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/30"
          >
            <HardDriveDownload size={15} /> Download now ({meta.size})
          </button>
          {m.error && <p className="mt-2 text-xs text-[var(--accent-3)]">{m.error}</p>}
        </div>
      )}
    </div>
  );
}

function LlmPicker() {
  const llm = useStore((s) => s.llm);
  const selectLlm = useStore((s) => s.selectLlm);
  const [busy, setBusy] = useState(false);
  if (!llm) return null;

  const choose = async (repo: string) => {
    if (repo === llm.selected || busy) return;
    setBusy(true);
    try {
      await selectLlm(repo);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-black/30 p-3">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles size={14} className="text-[var(--accent-2)]" />
        <span className="font-medium">Lyric model size</span>
      </div>
      <p className="mt-1 mb-2 text-xs text-[var(--muted)]">
        Bigger = better lyrics but a much larger download. Pick one, then download it below.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {llm.options.map((o) => {
          const active = o.repo === llm.selected;
          return (
            <button
              key={o.repo}
              onClick={() => choose(o.repo)}
              disabled={busy}
              title={o.note}
              className={`rounded-xl p-2.5 text-left transition disabled:opacity-60 ${
                active
                  ? "bg-[var(--accent)]/20 ring-1 ring-[var(--accent)]/50"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${active ? "text-[var(--accent)]" : ""}`}>
                  {o.key}
                </span>
                {o.ready && (
                  <span className="rounded-full bg-[var(--good)]/15 px-1.5 py-0.5 text-[10px] text-[var(--good)]">
                    installed
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">{o.size}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModelDownloads() {
  return (
    <>
      <ModelRow id="yue2" />
      <LlmPicker />
      <ModelRow id="llm" />
      <ModelRow id="cover" />
    </>
  );
}

const THEME_PRESETS: { name: string; c: [string, string, string] }[] = [
  { name: "Neon", c: ["#22d3ee", "#a855f7", "#f43f5e"] },
  { name: "Sunset", c: ["#fb923c", "#f43f5e", "#a855f7"] },
  { name: "Mint", c: ["#34d399", "#22d3ee", "#60a5fa"] },
  { name: "Vapor", c: ["#f472b6", "#a855f7", "#22d3ee"] },
  { name: "Gold", c: ["#fbbf24", "#fb923c", "#f43f5e"] },
  { name: "Ice", c: ["#60a5fa", "#22d3ee", "#818cf8"] },
];

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {desc && <p className="mb-4 text-sm text-[var(--muted)]">{desc}</p>}
      {children}
    </section>
  );
}

function ThemeSettings() {
  const theme = useStore((s) => s.themeColors);
  const setTheme = useStore((s) => s.setThemeColors);
  const keys: ["accent", "accent2", "accent3"] = ["accent", "accent2", "accent3"];
  const labels = { accent: "Primary", accent2: "Secondary", accent3: "Accent" } as const;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">
          Presets
        </div>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() =>
                setTheme({ accent: p.c[0], accent2: p.c[1], accent3: p.c[2] })
              }
              className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm transition hover:bg-white/5"
              title={`Apply ${p.name}`}
            >
              <span className="flex">
                {p.c.map((c) => (
                  <span
                    key={c}
                    className="h-4 w-4 rounded-full ring-1 ring-black/40"
                    style={{ background: c, marginLeft: -4 }}
                  />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">{labels[k]}</span>
            <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
              <input
                type="color"
                value={theme[k]}
                onChange={(e) => setTheme({ [k]: e.target.value } as any)}
                className="h-8 w-8 cursor-pointer rounded-md border-0 bg-transparent"
              />
              <span className="font-mono text-xs text-[var(--muted)]">{theme[k]}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export function SetupView() {
  return (
    <div data-tour="setup" className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Setup</h1>

        <Section icon={<Palette size={17} />} title="Appearance" desc="Theme colours used across the app and visualizer.">
          <ThemeSettings />
        </Section>

        <Section icon={<Cpu size={17} />} title="Models & Engines" desc="Choose the active music engine. Unavailable engines show what's needed.">
          <EngineSelector />
          <ModelDownloads />
        </Section>

        <Section icon={<HardDrive size={17} />} title="Storage" desc="Where MusiGen keeps its models and your music â€” all in one portable folder.">
          <StorageSettings />
        </Section>

        <Section icon={<Cpu size={17} />} title="Microphone" desc="Record a melody directly in Create."><MicrophoneSetup /></Section>
        <Section icon={<Cpu size={17} />} title="Optional media tools" desc="Reference melody import and lyric synchronization.">
          <MediaToolsSetup />
        </Section>

        <Section icon={<ScrollText size={17} />} title="Licenses" desc="MusiGen bundles third-party models and code.">
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            <li>
              <span className="text-[var(--text)]">YuE2</span> â€” code Apache-2.0;
              model weights <span className="text-[var(--warn)]">CC BY-NC 4.0 (non-commercial)</span>.
            </li>
            <li>
              <span className="text-[var(--text)]">Qwen2.5</span> â€” lyric writer,
              Apache-2.0 (Alibaba).
            </li>
            <li>
              <span className="text-[var(--text)]">MusiGen app</span> â€” MIT.
            </li>
          </ul>
        </Section>
        <Section icon={<ExternalLink size={17} />} title="Project & support" desc="Follow MusiGen on GitHub or support its development.">
          <div className="flex flex-wrap gap-3">
            {[
              { label: "GitHub", url: "https://github.com/criso2hd-alt/MusiGen", icon: <ExternalLink size={17} /> },
              { label: "Buy Me a Coffee", url: "https://buymeacoffee.com/criso2hdj", icon: <Coffee size={17} /> },
            ].map(({ label, url, icon }) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                onClick={(event) => {
                  const bridge = (window as any).pywebview?.api;
                  if (bridge?.open_external) {
                    event.preventDefault();
                    bridge.open_external(url);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                {icon}{label}
              </a>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
