import type { Pill, PillCategory, PillCatalog } from "./types";

// Curated starting points, not restrictions. Only explicit helper clicks use them.
const families = [
  { match: /orchestr|classical|cinematic|violin|cello|harp|opera|soprano/i, instruments: ["strings", "violin", "cello", "French horn", "harp", "timpani", "flute", "grand piano"], mood: ["epic", "dramatic", "dreamy", "majestic"], vocal: ["choir", "operatic", "female vocal"] },
  { match: /synth|electro|vocoder|auto.?tun|trance|techno|house|disco|chip|808/i, instruments: ["synth pads", "synth lead", "arpeggiator", "analog synth", "drum machine", "808 bass"], mood: ["dreamy", "nostalgic", "euphoric", "dark"], vocal: ["vocoder", "airy harmonies", "female vocal"] },
  { match: /rock|metal|punk|electric guitar|distorted/i, instruments: ["electric guitar", "distorted guitar", "electric bass", "live drums", "organ"], mood: ["gritty", "aggressive", "triumphant", "rebellious"], vocal: ["male vocal", "gravelly vocal", "female vocal"] },
  { match: /jazz|blues|sax|trumpet|swing|Rhodes/i, instruments: ["grand piano", "upright bass", "saxophone", "trumpet", "brush drums", "Rhodes"], mood: ["relaxed", "romantic", "melancholic", "playful"], vocal: ["crooning", "scat singing", "female vocal"] },
  { match: /folk|country|acoustic|banjo|mandolin|ukulele/i, instruments: ["acoustic guitar", "banjo", "mandolin", "harmonica", "upright bass", "live drums"], mood: ["hopeful", "nostalgic", "intimate", "peaceful"], vocal: ["male vocal", "female vocal", "harmonies"] },
  { match: /hip.hop|rap|trap|boom bap|spoken/i, instruments: ["808 bass", "drum machine", "Rhodes", "synth pads", "turntable scratches"], mood: ["confident", "gritty", "chill", "dark"], vocal: ["rap", "melodic rap", "spoken word"] },
  { match: /latin|salsa|bossa|samba|conga/i, instruments: ["nylon-string guitar", "congas", "shaker", "upright bass", "grand piano", "trumpet"], mood: ["joyful", "romantic", "relaxed"], vocal: ["female vocal", "male vocal", "harmonies"] },
  { match: /.*/, instruments: ["piano", "electric bass", "acoustic guitar", "synth pads", "live drums"], mood: ["uplifting", "dreamy", "bittersweet", "happy"], vocal: ["female vocal", "male vocal", "harmonies"] },
];

export function pairingChoices(anchor: Pill, catalog: PillCatalog): Partial<Record<PillCategory, string[]>> {
  const family = families.find((f) => f.match.test(anchor.label))!;
  return Object.fromEntries(Object.entries({ instrument: family.instruments, mood: family.mood, vocal: family.vocal }).map(([category, labels]) => [category, labels.filter((label) => catalog[category as PillCategory]?.includes(label))]));
}

export function chooseOther(labels: string[], excluded: string[], random = Math.random) {
  const choices = labels.filter((label) => !excluded.includes(label));
  return choices.length ? choices[Math.floor(random() * choices.length)] : undefined;
}
