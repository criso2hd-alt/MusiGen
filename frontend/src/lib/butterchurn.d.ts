// Minimal typings for the UMD builds of butterchurn / butterchurn-presets.
declare module "butterchurn" {
  export interface VisualizerOpts {
    width?: number;
    height?: number;
    pixelRatio?: number;
    textureRatio?: number;
    meshWidth?: number;
    meshHeight?: number;
  }
  export interface Visualizer {
    connectAudio(node: AudioNode): void;
    loadPreset(preset: unknown, blendTime?: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
    launchSongTitleAnim?(text: string): void;
  }
  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      opts: VisualizerOpts
    ): Visualizer;
  };
  export default butterchurn;
}

declare module "butterchurn-presets" {
  const presets: {
    getPresets(): Record<string, unknown>;
  };
  export default presets;
}

declare module "butterchurn-presets/lib/butterchurnPresetsExtra.min.js" {
  const presets: {
    getPresets(): Record<string, unknown>;
  };
  export default presets;
}

declare module "butterchurn-presets/lib/butterchurnPresetsExtra2.min.js" {
  const presets: {
    getPresets(): Record<string, unknown>;
  };
  export default presets;
}
