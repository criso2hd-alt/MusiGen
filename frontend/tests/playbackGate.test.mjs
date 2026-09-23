import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackGate} from '../src/components/library/store3d/playbackGate.ts';
test('audio waits for landing, starts once, and cancellation prevents late playback',()=>{
 const calls=[],gate=createPlaybackGate(t=>calls.push(t));
 gate.request('A');gate.update(false);assert.deepEqual(calls,[]);
 gate.update(true);gate.update(true);assert.deepEqual(calls,['A']);
 gate.request('B');gate.cancel();gate.update(true);assert.deepEqual(calls,['A']);
 gate.request('C');gate.update(false);gate.update(true);assert.deepEqual(calls,['A','C']);
});
