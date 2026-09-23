import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Preferences {
  musicLighting: boolean;
  musicLightIntensity: number;
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
  persist((set) => ({ musicLighting:true, musicLightIntensity:0.45, microphoneId: "", ingredientSize: 12, hiddenIngredients: [], libraryView: "compact",
    lyricSize: 28, lyricBackdrop: 80, lyricPosition: "bottom", lyricDisplay: "phrases",
    update: (patch) => set(patch),
  }), { name: "mg.studioPreferences" })
);
