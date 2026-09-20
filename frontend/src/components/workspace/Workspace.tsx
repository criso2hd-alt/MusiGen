import { useMemo, useState } from "react";
import {
  DockviewReact,
  themeAbyss,
  type DockviewReadyEvent,
} from "dockview-react";
import "dockview/dist/styles/dockview.css";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useStore } from "../../store";
import type { PillCategory } from "../../lib/types";
import { PillFace } from "../mixer/PillChip";
import { dockComponents, buildDefaultLayout } from "./panels";
import { dock } from "./dock";

const LAYOUT_KEY = "mg.layout3"; // bumped: panel set changed (create-only)

export function Workspace() {
  const addPill = useStore((s) => s.addPill);
  const [dragging, setDragging] = useState<{
    category: PillCategory;
    label: string;
  } | null>(null);

  const components = useMemo(() => dockComponents, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onReady = (event: DockviewReadyEvent) => {
    dock.set(event.api);
    let restored = false;
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) {
        event.api.fromJSON(JSON.parse(saved));
        restored = true;
      }
    } catch {
      restored = false;
    }
    if (!restored || event.api.panels.length === 0) {
      event.api.clear();
      buildDefaultLayout(event.api);
    }
    event.api.onDidLayoutChange(() => {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(event.api.toJSON()));
      } catch {
        /* ignore */
      }
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as any;
    if (d) setDragging({ category: d.category, label: d.label });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const d = e.active.data.current as any;
    if (e.over?.id === "mixer-board" && d) addPill(d.category, d.label);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="relative min-h-0 flex-1">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={themeAbyss}
          className="musigen-dock h-full"
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <PillFace category={dragging.category} label={dragging.label} floating />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
