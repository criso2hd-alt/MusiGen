export type MidiNote = { pitch: number; start: number; duration: number; velocity: number };

/** Format 0, 480 ticks/quarter, with an explicit tempo and complete note-offs. */
export function encodeMidi(notes: MidiNote[], bpm: number): Uint8Array {
  const tempo = Math.round(60_000_000 / Math.max(30, Math.min(240, bpm)));
  const ticks = (s: number) => Math.round(s * 480_000_000 / tempo);
  const events = notes.flatMap((n) => {
    const start = ticks(Math.max(0, n.start));
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
    return [{ t: start, bytes: [0x90, pitch, Math.max(1, Math.min(127, Math.round(n.velocity)))] },
      { t: Math.max(start + 1, ticks(n.start + n.duration)), bytes: [0x80, pitch, 0] }];
  }).sort((a, b) => a.t - b.t || a.bytes[0] - b.bytes[0]);
  const vlq = (value: number) => { const out = [value & 127]; while ((value >>>= 7)) out.unshift((value & 127) | 128); return out; };
  const track = [0, 0xff, 0x51, 3, (tempo >>> 16) & 255, (tempo >>> 8) & 255, tempo & 255, 0, 0xc0, 0];
  let previous = 0;
  for (const event of events) { track.push(...vlq(event.t - previous), ...event.bytes); previous = event.t; }
  track.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,
    (track.length >>> 24)&255,(track.length >>> 16)&255,(track.length >>> 8)&255,track.length&255,...track]);
}
