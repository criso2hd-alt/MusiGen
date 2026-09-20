import { useEffect, useRef } from "react";
import type { IDockviewPanelProps, DockviewApi } from "dockview-react";
import { PillTray } from "../mixer/PillTray";
import { MixerBoard } from "../mixer/MixerBoard";
import { StylePreview } from "../mixer/StylePreview";
import { GenerateBar } from "../mixer/GenerateBar";
import { LyricsPanel } from "../mixer/LyricsPanel";
import { OptionsPanel } from "../mixer/OptionsPanel";
import { MixerQueue } from "../mixer/MixerQueue";
import { ReferenceImport } from "../mixer/ReferenceImport";

function MixerPanel({ api }: IDockviewPanelProps) {
  const core = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let group = api.group;
    let previous = { minimumHeight: group.minimumHeight, minimumWidth: group.minimumWidth };
    const update = () => group.api.setConstraints({ minimumHeight: Math.ceil(core.current?.getBoundingClientRect().height || 420) + 105, minimumWidth: 360 });
    const moved = api.onDidGroupChange(() => {
      group.api.setConstraints(previous);
      group = api.group;
      previous = { minimumHeight: group.minimumHeight, minimumWidth: group.minimumWidth };
      update();
    });
    const observer = new ResizeObserver(update);
    if (core.current) observer.observe(core.current);
    update();
    return () => { observer.disconnect(); moved.dispose(); group.api.setConstraints(previous); };
  }, [api]);
  return <div data-tour="mixer" className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-1.5">
    <div ref={core} className="shrink-0 space-y-2">
      <MixerBoard />
      <StylePreview />
      <ReferenceImport />
      <GenerateBar />
    </div>
    <div className="shrink-0 space-y-2">
      <MixerQueue />
    </div>
  </div>;
}

/** Dockview component registry — keys must match PANELS ids in dock.ts. */
export const dockComponents: Record<string, React.FC<any>> = {
  ingredients: () => (
    <div className="h-full p-1.5">
      <PillTray />
    </div>
  ),
  mixer: MixerPanel,
  lyrics: () => (
    <div className="h-full overflow-y-auto p-1.5">
      <LyricsPanel />
    </div>
  ),
  options: () => (
    <div className="h-full overflow-y-auto p-1.5">
      <OptionsPanel />
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
  api.getPanel("mixer")?.api.setActive();
}
