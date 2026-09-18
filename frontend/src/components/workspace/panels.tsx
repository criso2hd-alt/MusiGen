import type { DockviewApi } from "dockview-react";
import { useStore } from "../../store";
import { PillTray } from "../mixer/PillTray";
import { MixerBoard } from "../mixer/MixerBoard";
import { StylePreview } from "../mixer/StylePreview";
import { GenerateBar } from "../mixer/GenerateBar";
import { LyricsPanel } from "../mixer/LyricsPanel";
import { OptionsPanel } from "../mixer/OptionsPanel";
import { JobsList } from "../JobsList";

function QueueInner() {
  const jobs = useStore((s) => s.jobs);
  if (Object.keys(jobs).length === 0)
    return (
      <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">
        No generations yet.
        <br />
        Build a mix and hit Generate.
      </div>
    );
  return <JobsList />;
}

/** Dockview component registry — keys must match PANELS ids in dock.ts. */
export const dockComponents: Record<string, React.FC<any>> = {
  ingredients: () => (
    <div className="h-full p-1.5">
      <PillTray />
    </div>
  ),
  mixer: () => (
    <div className="h-full space-y-3 overflow-y-auto p-1.5">
      <MixerBoard />
      <StylePreview />
      <GenerateBar />
    </div>
  ),
  lyrics: () => (
    <div className="h-full p-1.5">
      <LyricsPanel />
    </div>
  ),
  options: () => (
    <div className="h-full overflow-y-auto p-1.5">
      <OptionsPanel />
    </div>
  ),
  queue: () => (
    <div className="h-full overflow-y-auto p-1.5">
      <QueueInner />
    </div>
  ),
};

export function buildDefaultLayout(api: DockviewApi) {
  api.addPanel({ id: "ingredients", component: "ingredients", title: "Ingredients" });
  api.addPanel({
    id: "mixer",
    component: "mixer",
    title: "Mixer",
    position: { referencePanel: "ingredients", direction: "right" },
  });
  api.addPanel({
    id: "lyrics",
    component: "lyrics",
    title: "Lyrics",
    position: { referencePanel: "mixer", direction: "right" },
  });
  api.addPanel({
    id: "options",
    component: "options",
    title: "Options",
    position: { referencePanel: "lyrics", direction: "below" },
  });
  api.addPanel({
    id: "queue",
    component: "queue",
    title: "Queue",
    position: { referencePanel: "mixer", direction: "below" },
  });
  api.getPanel("mixer")?.api.setActive();
}
