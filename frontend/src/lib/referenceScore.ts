/** Inspect the explicit Vocal voice emitted by SheetSage2; unknown formats stay unknown. */
export function referenceVocalState(abc: string | null | undefined): "notes" | "silent" | "unknown" {
  if (!abc) return "unknown";
  let vocal = false, seen = false, body = false;
  for (const raw of abc.split(/\r?\n/)) {
    const line = raw.replace(/%.*/, "").trim();
    if (/^K:/.test(line)) body = true;
    if (/^V:/.test(line)) {
      vocal = /^V:\s*Vocal(?:\s|$)/i.test(line);
      if (body && vocal) seen = true;
      continue;
    }
    if (!body || !vocal || !line || /^[A-Za-z]:/.test(line)) continue;
    // Chord labels, decorations and inline fields are not note events.
    const notes = line.replace(/"[^"]*"|![^!]*!|\[[A-Za-z]:[^\]]*\]/g, "");
    if (/[A-Ga-g]/.test(notes)) return "notes";
    if (!/^[zZxX\d/|:[\]\s.()-]+$/.test(notes)) return "unknown";
  }
  return seen ? "silent" : "unknown";
}
export function referenceTempo(abc: string | null | undefined): number | null {
  const match = abc?.match(/^Q:\s*(?:(\d+)\/(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/m);
  return match ? Number(match[3]) * (match[1] ? 4 * Number(match[1]) / Number(match[2]) : 1) : null;
}
