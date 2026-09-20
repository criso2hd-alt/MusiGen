import { useEffect } from "react";
import { useStore } from "./store";
import { useJobSocket } from "./hooks/useJobSocket";
import { StudioTour } from "./components/StudioTour";
import { SystemMonitor } from "./components/SystemMonitor";
import { TopBar } from "./components/TopBar";
import { Workspace } from "./components/workspace/Workspace";
import { LibraryView } from "./components/library/LibraryView";
import { SetupView } from "./components/setup/SetupView";
import { PlayerBar } from "./components/player/PlayerBar";
import { ExpandedPlayer } from "./components/player/ExpandedPlayer";
import { ExportDialog } from "./components/ExportDialog";
import { Toast } from "./components/Toast";
import { Resizer } from "./components/Resizer";

export default function App() {
  const init = useStore((s) => s.init);
  const tab = useStore((s) => s.tab);
  const setSize = useStore((s) => s.setSize);
  useJobSocket();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <div className="app-backdrop" />
      <div className="flex h-screen flex-col text-[var(--text)]">
        <TopBar />
        <SystemMonitor />
        {/* Tab content fills the space between the top bar and the player. */}
        {tab === "create" && <Workspace />}
        {tab === "library" && (
          <div className="min-h-0 flex-1">
            <LibraryView />
          </div>
        )}
        {tab === "setup" && (
          <div className="min-h-0 flex-1">
            <SetupView />
          </div>
        )}
        {/* Persistent player: docked to the bottom across every tab. */}
        <Resizer
          axis="y"
          sign={-1}
          getBase={() => useStore.getState().playerH}
          onResize={(v) => setSize("playerH", v)}
          title="Drag to resize player"
        />
        <PlayerBar />
      </div>

      <ExpandedPlayer />
      <ExportDialog />
      <Toast />
      <StudioTour />
    </>
  );
}
