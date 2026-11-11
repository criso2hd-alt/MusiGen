import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStructure, hasNoWords, skeleton, tagsOf } from '../src/lib/lyricStructure.ts';

// Reported: picking Structure chips did nothing to the lyrics box.
test('wordless lyrics are recognised so they can follow the chips', () => {
  assert.equal(hasNoWords(''), true);
  assert.equal(hasNoWords('[verse]\n\n[chorus]\n…\n'), true);
  assert.equal(hasNoWords('[verse]\nȘoseaua mea\n'), false);
  assert.equal(skeleton(['pre-chorus']), '[pre-chorus]\n');
  assert.deepEqual(tagsOf(skeleton(['verse', 'chorus'])), ['verse', 'chorus']);
});

test('apply reorders written sections and keeps every line', () => {
  const lyrics = '[verse]\nV1 line\n\n[chorus]\nHook line\n';
  const out = applyStructure(lyrics, ['chorus', 'verse', 'chorus']);
  assert.deepEqual(tagsOf(out), ['chorus', 'verse', 'chorus']);
  assert.match(out, /\[chorus\]\nHook line\n\n\[verse\]\nV1 line\n\n\[chorus\]\nHook line/);
});

test('apply adds empty sections for new chips', () => {
  const out = applyStructure('[verse]\nV1\n', ['intro', 'verse', 'bridge']);
  assert.deepEqual(tagsOf(out), ['intro', 'verse', 'bridge']);
  assert.match(out, /\[verse\]\nV1/);
});

test('removing a chip never loses unique written text', () => {
  const lyrics = '[verse]\nV1\n\n[bridge]\nOnly bridge words\n';
  const out = applyStructure(lyrics, ['verse']);
  assert.match(out, /Only bridge words/);
});

test('an exact duplicate of a kept section is dropped, not re-appended', () => {
  const lyrics = '[chorus]\nHook\n\n[verse]\nV1\n\n[chorus]\nHook\n';
  const out = applyStructure(lyrics, ['chorus', 'verse']);
  assert.deepEqual(tagsOf(out), ['chorus', 'verse']);
  assert.equal(out.match(/Hook/g).length, 1);
});
