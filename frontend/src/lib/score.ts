/**
 * Helpers for a song's sheet music.
 *
 * With chain-of-thought on ("Full" or "Melody"), YuE2 first composes a score in
 * ABC notation — vocal line, instrument line, chord symbols, key, meter, tempo
 * and section markers — and then renders the audio from it. That score is saved
 * as `generation_meta.abc`, so the sheet music is what the model actually
 * followed. It is a lead-sheet-style plan, not a transcription of every
 * instrument in the mix.
 */
import type { Track } from "./types";

/** The score YuE2 followed for this track, if one was saved. */
export function trackScore(track: Pick<Track, "generation_meta" | "abc">): string | null {
  const generated = track.generation_meta?.abc;
  if (typeof generated === "string" && generated.trim()) return generated;
  return track.abc && track.abc.trim() ? track.abc : null;
}

/** Give the score a visible title (YuE2 writes an empty `T:` line). */
export function withTitle(abc: string, title: string): string {
  const clean = title.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return abc;
  if (/^T:.*$/m.test(abc)) return abc.replace(/^T:.*$/m, `T:${clean}`);
  // No T: line: insert one right after X:, as ABC requires.
  return abc.replace(/^(X:.*)$/m, `$1\nT:${clean}`);
}

export interface ScoreInfo {
  key: string | null;
  meter: string | null;
  tempo: number | null;
  voices: string[];
  sections: string[];
  chords: number;
}

/** A short, human-readable summary of the score's header and form. */
export function scoreInfo(abc: string): ScoreInfo {
  const header = (field: string) => abc.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1].trim() ?? null;
  const tempo = header("Q")?.match(/=\s*(\d+)/)?.[1];
  const voices: string[] = [];
  for (const m of abc.matchAll(/^V:\s*(\S+)(.*)$/gm)) {
    const name = m[2].match(/name="([^"]+)"/)?.[1] ?? m[1];
    if (!voices.includes(name) && /clef=|name=/.test(m[2])) voices.push(name);
  }
  const sections: string[] = [];
  for (const m of abc.matchAll(/^%\s*([A-Za-z][\w -]*)\s*$/gm)) sections.push(m[1].trim());
  const chords = (abc.match(/"[A-G][^"]*"/g) ?? []).length;
  return { key: header("K"), meter: header("M"), tempo: tempo ? Number(tempo) : null, voices, sections, chords };
}

/** A filesystem-safe base name for exports. */
export function exportName(title: string): string {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "song";
}
