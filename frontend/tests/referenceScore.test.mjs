import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceVocalState } from '../src/lib/referenceScore.ts';

test('instrumental notes do not conceal an explicitly silent vocal part', () => {
  const score = 'X:1\nV: Vocal name="Vocal Melody"\nV: Ins\nK:C\nV: Vocal\nZ4|\nV: Ins\nCDEF|\nV: Vocal\nZ2|';
  assert.equal(referenceVocalState(score), 'silent');
  assert.equal(referenceVocalState(score + '\nC2 D2|'), 'notes');
});
test('unknown scores are not falsely labeled instrumental', () => {
  assert.equal(referenceVocalState('X:1\nK:C\nCDEF|'), 'unknown');
  assert.equal(referenceVocalState(null), 'unknown');
});
