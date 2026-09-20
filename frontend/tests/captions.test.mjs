import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionAt, captionPhrases } from '../src/lib/captions.ts';

test('captions follow timestamps through instrumental gaps and backward seeks', () => {
  const words = [{ text: 'Again', start: 5, end: 6 }, { text: 'again.', start: 6, end: 7 },
    { text: 'Again', start: 20, end: 21 }];
  const phrases = captionPhrases(words);
  assert.equal(captionAt(phrases, 0), null);
  assert.deepEqual(captionAt(phrases, 20), [words[2]]);
  assert.equal(captionAt(phrases, 15), null);
  assert.deepEqual(captionAt(phrases, 5.5), words.slice(0, 2));
  assert.equal(captionAt(phrases, 21), null);
});

test('long uninterrupted lyrics split into readable phrases without dropping words', () => {
  const words = Array.from({ length: 25 }, (_, i) => ({ text: 'la', start: i, end: i + 1 }));
  const phrases = captionPhrases(words);
  assert.ok(phrases.every((phrase) => phrase.length <= 8));
  assert.deepEqual(phrases.flat(), words);
  assert.equal(captionAt([], 10), null);
});

test('coincident word timestamps keep recognized words in their phrase', () => {
  const words = [{ text: 'rise', start: 2, end: 2 }, { text: 'every', start: 2, end: 3 }];
  assert.deepEqual(captionAt(captionPhrases(words), 2.5), words);
  assert.equal(captionAt(captionPhrases(words), 3), null);
});
