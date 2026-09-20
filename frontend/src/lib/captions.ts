import type { WordCue } from "./types";

export function captionPhrases(words: WordCue[]): WordCue[][] {
  const phrases: WordCue[][] = [];
  let current: WordCue[] = [];
  for (const word of words) {
    const last = current[current.length - 1];
    if (last && (current.length >= 8 || word.start - last.end > .8 || /[.!?。！？]$/.test(last.text))) {
      phrases.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) phrases.push(current);
  return phrases;
}

export function captionAt(phrases: WordCue[][], time: number): WordCue[] | null {
  return phrases.find((words) => time >= words[0].start && time < words[words.length - 1].end) ?? null;
}
