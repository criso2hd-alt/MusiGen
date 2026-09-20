/** Preset names survive pack reordering; the old numeric preference is a migration fallback. */
export function initialPreset(names: string[], pinned: string, last: string, legacyIndex: number): number {
  for (const name of [pinned, last]) {
    const index = name ? names.indexOf(name) : -1;
    if (index >= 0) return index;
  }
  return Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < names.length ? legacyIndex : 0;
}
