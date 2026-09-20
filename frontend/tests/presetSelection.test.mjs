import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPreset } from '../src/lib/presetSelection.ts';

test('pinned preset takes precedence even after the preset pack is reordered', () => {
  assert.equal(initialPreset(['New', 'Last', 'Pinned'], 'Pinned', 'Last', 0), 2);
});

test('missing or unpinned preset returns to the last available name', () => {
  assert.equal(initialPreset(['A', 'B'], 'Removed', 'B', 0), 1);
  assert.equal(initialPreset(['A', 'B'], '', 'B', 0), 1);
});

test('legacy indices migrate only when they are valid', () => {
  assert.equal(initialPreset(['A', 'B'], '', '', 1), 1);
  for (const index of [-1, 2, 0.5, NaN, Infinity]) {
    assert.equal(initialPreset(['A', 'B'], 'Removed', 'Removed', index), 0);
  }
});
