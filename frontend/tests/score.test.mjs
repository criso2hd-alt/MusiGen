import { test } from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import { exportName, scoreInfo, trackScore, withTitle } from '../src/lib/score.ts';

// The shape YuE2 writes with chain-of-thought on (trimmed from a real track).
const YUE2 = `X:1
T:
M:4/4
L:1/16
Q:1/4=106
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Bbm
% intro
V: Vocal
"Ebm7"z16|"Bbm7"z16|
V: Ins
z8 zB,DF|F4E4D4C4|
% verse
V: Vocal
"Ebm7"f4d4B4f4|"Ab7"e8c8|
V: Ins
B,16|C16|
`;

test('prefers the score YuE2 generated, then a supplied reference score', () => {
  assert.equal(trackScore({ generation_meta: { abc: YUE2 }, abc: 'X:1\nK:C\nC|' }), YUE2);
  assert.equal(trackScore({ generation_meta: {}, abc: 'X:1\nK:C\nC|' }), 'X:1\nK:C\nC|');
  assert.equal(trackScore({ generation_meta: {}, abc: null }), null); // chain-of-thought off
});

test('the empty YuE2 title becomes the song title', () => {
  assert.match(withTitle(YUE2, 'Jazz Cool Jazz'), /^T:Jazz Cool Jazz$/m);
  assert.match(withTitle('X:1\nK:C\nC|', 'Solo'), /^X:1\nT:Solo\nK:C/);
});

test('summarises key, meter, tempo, voices and form', () => {
  const info = scoreInfo(YUE2);
  assert.equal(info.key, 'Bbm');
  assert.equal(info.meter, '4/4');
  assert.equal(info.tempo, 106);
  assert.deepEqual(info.voices, ['Vocal Melody', 'Ins Melody']);
  assert.deepEqual(info.sections, ['intro', 'verse']);
  assert.ok(info.chords >= 4);
});

test('export names are safe Windows file names', () => {
  assert.equal(exportName('Șoseaua: "live" / mix?'), 'Șoseaua live mix');
  assert.equal(exportName('   '), 'song');
});

test('a YuE2 score becomes a valid multi-track MIDI file', () => {
  const out = abcjs.synth.getMidiFile(withTitle(YUE2, 'Test'), { midiOutputType: 'binary' });
  const bytes = Buffer.from(Array.isArray(out) ? out[0] : out);
  assert.equal(bytes.subarray(0, 4).toString(), 'MThd');
  const tracks = bytes.readUInt16BE(10);
  assert.ok(tracks >= 3, `expected tempo + melody voices, got ${tracks} tracks`);
});
