import { useState } from "react";
import {
  Cpu,
  LayoutTemplate,
  RotateCcw,
  Check,
  Wand2,
  Library as LibraryIcon,
  Settings,
} from "lucide-react";

export const APP_VERSION = "0.0.1";
import type { ReactNode } from "react";
import clsx from "clsx";
import { useStore } from "../store";
import { dock, PANELS } from "./workspace/dock";
import { buildDefaultLayout } from "./workspace/panels";
import { SupportBanner } from "./SupportBanner";

function PanelsMenu() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  const reset = () => {
    const api = dock.get();
    if (!api) return;
    api.clear();
    buildDefaultLayout(api);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          force((n) => n + 1);
          setOpen((o) => !o);
        }}
        className={clsx(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
          open ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
        )}
        title="Show/arrange panels and layouts"
      >
        <LayoutTemplate size={15} /> Panels
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass absolute left-0 z-50 mt-2 w-48 rounded-xl p-1.5 shadow-2xl">
            {PANELS.map((p) => {
              const isOpen = Boolean(dock.get()?.getPanel(p.id));
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    dock.focus(p.id);
                    force((n) => n + 1);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                >
                  <span className="grid h-4 w-4 place-items-center">
                    {isOpen && <Check size={13} className="text-[var(--accent)]" />}
                  </span>
                  {p.title}
                </button>
              );
            })}
            <div className="my-1 h-px bg-white/10" />
            <button
              onClick={reset}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
            >
              <RotateCcw size={14} /> Reset layout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition",
        active ? "bg-white/10 text-white shadow" : "text-[var(--muted)] hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function TopBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const engine = useStore((s) => s.engine);
  const engines = useStore((s) => s.engines);
  const engineLabel =
    engines.find((e) => e.id === engine)?.label ??
    (engine === "yue2" ? "YuE2" : "Stub");

  return (
    <header className="glass relative z-50 flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3">
        <img
          src="/musigen.png"
          alt="MusiGen"
          className="h-9 w-9 rounded-xl shadow-lg"
        />
        <div className="flex items-baseline gap-1.5">
          <div className="text-lg font-bold leading-none neon-text tracking-wide">
            MusiGen
          </div>
          <span className="text-[11px] font-medium text-[var(--muted)]">
            v{APP_VERSION}
          </span>
        </div>
      </div>

      <nav className="flex items-center gap-1 rounded-xl bg-black/30 p-1">
        <Tab active={tab === "create"} onClick={() => setTab("create")} icon={<Wand2 size={16} />} label="Create" />
        <Tab active={tab === "library"} onClick={() => setTab("library")} icon={<LibraryIcon size={16} />} label="Library" />
        <Tab active={tab === "setup"} onClick={() => setTab("setup")} icon={<Settings size={16} />} label="Setup" />
      </nav>

      <div className="flex items-center gap-2 text-xs">
        {tab === "create" && <PanelsMenu />}
        <button
          onClick={() => setTab("setup")}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition",
            engine === "stub"
              ? "bg-white/10 text-[var(--muted)]"
              : "bg-[var(--accent-2)]/20 text-[var(--accent-2)]"
          )}
          title="Active engine — click to open Setup"
        >
          <Cpu size={13} />
          {engineLabel}
        </button>
        <SupportBanner />
      </div>
    </header>
  );
}
