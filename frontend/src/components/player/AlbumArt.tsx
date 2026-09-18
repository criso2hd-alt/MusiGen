import { Vinyl } from "./Vinyl";

/**
 * Album art that morphs with playback: when paused it shows the flat cover
 * (jewel-case front); when playing it crossfades into the spinning vinyl whose
 * center label is the same cover. With no cover it's just the vinyl.
 */
export function AlbumArt({
  cover,
  playing,
  size = 64,
  seed = 0,
}: {
  cover?: string | null;
  playing: boolean;
  size?: number;
  seed?: number;
}) {
  // Show the flat cover only when we HAVE one and are not playing.
  const showFlat = Boolean(cover) && !playing;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* spinning vinyl (cover becomes the label) */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: showFlat ? 0 : 1 }}
      >
        <Vinyl size={size} spinning={playing} cover={cover ?? null} seed={seed} />
      </div>

      {/* flat cover front, shown while idle */}
      {cover && (
        <div
          className="absolute inset-0 overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10 transition-opacity duration-700"
          style={{ opacity: showFlat ? 1 : 0 }}
        >
          <img src={cover} alt="" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}
