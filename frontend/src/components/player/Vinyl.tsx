/** A circular vinyl record. When a cover image exists it becomes the label. */
export function Vinyl({
  size = 64,
  spinning = false,
  cover = null,
  seed = 0,
}: {
  size?: number;
  spinning?: boolean;
  cover?: string | null;
  seed?: number;
}) {
  const hue = (seed * 47) % 360;
  const label = size * 0.42;
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "repeating-radial-gradient(circle at 50% 50%, #0b0b10 0px, #0b0b10 1px, #15151d 2px, #0b0b10 3px)",
        boxShadow:
          "0 2px 10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)",
        animation: spinning ? "spin 3.2s linear infinite" : "none",
      }}
    >
      {/* sheen */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 210deg, transparent 0deg, rgba(255,255,255,0.10) 30deg, transparent 70deg, transparent 200deg, rgba(255,255,255,0.06) 230deg, transparent 270deg)",
        }}
      />
      {/* center label */}
      <div
        className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full"
        style={{
          width: label,
          height: label,
          background: cover
            ? undefined
            : `radial-gradient(circle at 35% 30%, hsl(${hue} 70% 60%), hsl(${
                (hue + 40) % 360
              } 70% 45%))`,
        }}
      >
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div
          className="absolute rounded-full bg-[var(--bg)]"
          style={{ width: size * 0.06, height: size * 0.06 }}
        />
      </div>
    </div>
  );
}
