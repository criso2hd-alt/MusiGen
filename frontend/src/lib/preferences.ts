import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Preferences {
  microphoneId: string;
  ingredientSize: number;
  hiddenIngredients: string[];
  libraryView: "compact" | "full" | "records";
  lyricSize: number;
  lyricBackdrop: number;
  lyricPosition: "bottom" | "center";
  lyricDisplay: "phrases" | "all";
}
export const usePreferences = create<Preferences & { update: (patch: Partial<Preferences>) => void }>()(
  persist((set) => ({ microphoneId: "", ingredientSize: 12, hiddenIngredients: [], libraryView: "compact",
    lyricSize: 28, lyricBackdrop: 80, lyricPosition: "bottom", lyricDisplay: "phrases",
    update: (patch) => set(patch),
  }), { name: "mg.studioPreferences" })
);
