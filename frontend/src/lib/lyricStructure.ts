/**
 * Keep the lyrics text and the Structure chips in step.
 *
 * Lyrics are a series of `[section]` tags, each followed by its lines. While the
 * lyrics have no real words yet (empty, or only tags), the text simply mirrors
 * the chips. Once words exist, `applyStructure` reorders the written sections to
 * match the chips without ever discarding text the user wrote.
 */

const TAG = /^\s*\[([^\]]+)\]\s*$/;
const PLACEHOLDER = /^\s*(…|\.\.\.|-|–|—)?\s*$/;

export interface Section {
  tag: string;
  body: string[];
}

export function parseSections(lyrics: string): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  for (const line of (lyrics || "").split(/\r?\n/)) {
    const m = line.match(TAG);
    if (m) sections.push({ tag: m[1].trim().toLowerCase(), body: [] });
    else if (sections.length) sections[sections.length - 1].body.push(line);
    else preamble.push(line);
  }
  return { preamble, sections };
}

/** True when the lyrics contain no words — only tags, blanks or "…" placeholders. */
export function hasNoWords(lyrics: string): boolean {
  return (lyrics || "")
    .split(/\r?\n/)
    .every((line) => TAG.test(line) || PLACEHOLDER.test(line));
}

/** An empty lyrics skeleton for the given structure: one tag per section. */
export function skeleton(structure: string[]): string {
  return structure.map((s) => `[${s}]\n`).join("\n");
}

/** The ordered list of section tags currently in the lyrics. */
export function tagsOf(lyrics: string): string[] {
  return parseSections(lyrics).sections.map((s) => s.tag);
}

const trimBody = (body: string[]) => {
  const out = [...body];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
};

/**
 * Rebuild the lyrics in the chips' order. Each chip takes the next written
 * section with the same tag (so a repeated chorus reuses its own text, in
 * order); a chip with no matching section gets an empty section. Written
 * sections that no chip claims are kept at the end, so nothing is lost.
 */
export function applyStructure(lyrics: string, structure: string[]): string {
  const { preamble, sections } = parseSections(lyrics);
  const used = new Set<number>();
  const blocks: string[] = [];
  const pre = trimBody(preamble);
  if (pre.length) blocks.push(pre.join("\n"));
  for (const name of structure) {
    const tag = name.trim().toLowerCase();
    const i = sections.findIndex((s, idx) => !used.has(idx) && s.tag === tag);
    let body: string[] = [];
    if (i >= 0) {
      used.add(i);
      body = trimBody(sections[i].body);
    } else {
      // A repeated section (e.g. a 3rd chorus) reuses the last text written for it.
      const prior = sections.filter((s) => s.tag === tag && trimBody(s.body).length);
      if (prior.length) body = trimBody(prior[prior.length - 1].body);
    }
    blocks.push([`[${name}]`, ...body].join("\n"));
  }
  const kept = new Set(
    sections.filter((_, idx) => used.has(idx)).map((s) => `${s.tag}\n${trimBody(s.body).join("\n")}`)
  );
  sections.forEach((s, idx) => {
    const body = trimBody(s.body);
    const key = `${s.tag}\n${body.join("\n")}`;
    // Keep unclaimed written text — except exact repeats of a section already kept.
    if (!used.has(idx) && !kept.has(key) && body.some((l) => !PLACEHOLDER.test(l))) {
      kept.add(key);
      blocks.push([`[${s.tag}]`, ...body].join("\n"));
    }
  });
  return blocks.join("\n\n") + "\n";
}
