import type { DockviewApi } from "dockview-react";

/** Module-level handle to the live Dockview API, plus panel metadata. */
let apiRef: DockviewApi | null = null;

export const PANELS: { id: string; title: string }[] = [
  { id: "ingredients", title: "Ingredients" },
  { id: "mixer", title: "Mixer" },
  { id: "lyrics", title: "Lyrics" },
  { id: "options", title: "Options" },
  { id: "queue", title: "Queue" },
];

export const dock = {
  set(api: DockviewApi | null) {
    apiRef = api;
  },
  get(): DockviewApi | null {
    return apiRef;
  },
  /** Focus a panel, adding it back if it was closed. */
  focus(id: string) {
    const api = apiRef;
    if (!api) return;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
    } else {
      const meta = PANELS.find((p) => p.id === id);
      api.addPanel({ id, component: id, title: meta?.title ?? id });
    }
  },
};
