import { Dice5, Info } from "lucide-react";
import { useStore } from "../../store";

function Label({ text, hint }: { text: string; hint: string }) {
  return (
    <span className="flex items-center gap-1 text-[var(--muted)]" title={hint}>
      {text}
      <span title={hint} className="inline-flex cursor-help">
        <Info size={11} className="opacity-50" />
      </span>
    </span>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="block" title={hint}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <Label text={label} hint={hint} />
        <span className="font-mono text-[var(--text)]">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
      />
    </label>
  );
}

const COT_HINTS: Record<string, string> = {
  full:
    "Full — the model first writes an internal plan (melody + chords as ABC notation), then the song. Best structure & musicality, but slowest and uses the most VRAM.",
  melody:
    "Melody — plans just the melodic line first, then the song. Good structure, faster than Full.",
  off:
    "Off — no planning; generates the song directly. Fastest and most freeform, but less musically structured.",
};

export function OptionsPanel() {
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const setSampling = (patch: Partial<typeof options.sampling>) =>
    setOptions({ sampling: { ...options.sampling, ...patch } });

  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div>
        <div className="mb-1.5">
          <Label
            text="Chain-of-thought (planning)"
            hint="How much the model plans before writing the song. More planning = more coherent structure, but slower."
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-black/30 p-1">
          {(["full", "melody", "off"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setOptions({ cot: m })}
              title={COT_HINTS[m]}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium capitalize transition ${
                options.cot === m
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block" title="Random seed. The same seed with identical settings reproduces the exact same song. Change it (or roll the dice) for a different take.">
          <div className="mb-1 text-xs">
            <Label
              text="Seed"
              hint="Random seed. Same seed + same settings = the exact same song. Change it (or roll the dice) for a different variation."
            />
          </div>
          <div className="flex gap-1">
            <input
              type="number"
              value={options.seed}
              onChange={(e) => setOptions({ seed: parseInt(e.target.value || "0", 10) })}
              className="w-full rounded-lg bg-black/40 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-[var(--accent)]/40"
            />
            <button
              onClick={() => setOptions({ seed: Math.floor(Math.random() * 1_000_000) })}
              title="Randomize the seed"
              className="rounded-lg bg-white/5 px-2 text-[var(--muted)] hover:bg-white/10 hover:text-white"
            >
              <Dice5 size={15} />
            </button>
          </div>
        </label>
        <Slider
          label="Duration"
          hint="Approximate song length in seconds. Longer songs take more time and VRAM (very long ones may spill to shared memory)."
          value={options.max_duration}
          min={15}
          max={240}
          step={5}
          onChange={(v) => setOptions({ max_duration: v })}
          fmt={(v) => `${v}s`}
        />
      </div>

      <Slider
        label="Temperature"
        hint="Creativity / randomness. Higher (→1.5) = more varied and surprising; lower (→0.1) = safer and more predictable/repetitive."
        value={options.sampling.temperature}
        min={0.1}
        max={1.5}
        step={0.05}
        onChange={(v) => setSampling({ temperature: v })}
        fmt={(v) => v.toFixed(2)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Top-p"
          hint="Nucleus sampling — only consider the smallest set of options whose probabilities add up to this. Lower = more focused; 1.0 = consider everything."
          value={options.sampling.top_p}
          min={0.5}
          max={1}
          step={0.01}
          onChange={(v) => setSampling({ top_p: v })}
          fmt={(v) => v.toFixed(2)}
        />
        <Slider
          label="Top-k"
          hint="Only sample from the top K most-likely options each step. Lower = more focused/safe; higher = more variety."
          value={options.sampling.top_k}
          min={0}
          max={200}
          step={5}
          onChange={(v) => setSampling({ top_k: v })}
        />
      </div>
      <Slider
        label="Repetition penalty"
        hint="Discourages repeating the same notes/phrases. Higher = less repetition; too high can make it sound disjointed. ~1.2 is a good default."
        value={options.sampling.repetition_penalty}
        min={1}
        max={2}
        step={0.05}
        onChange={(v) => setSampling({ repetition_penalty: v })}
        fmt={(v) => v.toFixed(2)}
      />
    </div>
  );
}
