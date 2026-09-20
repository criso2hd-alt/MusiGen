import type { Pill, PillCategory } from "./types";

const order: PillCategory[] = ["genre", "mood", "feeling", "instrument", "vocal", "pacing", "era", "keyword"];

/** Immediate preview; no network request can race with typing or Generate. */
export function composeRecipe(pills: Pill[], extra: string): string {
  const weighted = [...pills].sort((a, b) => b.weight - a.weight);
  const seen = new Set<string>();
  const labels = order.flatMap((category) => weighted.filter((p) => p.category === category))
    .filter((p) => {
      const key = p.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((p) => p.label);
  if (extra.trim()) labels.push(extra.trim());
  return labels.join(", ");
}
