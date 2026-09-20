import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackTracks, adjacentTrack } from '../src/lib/playbackQueue.ts';
const tracks = ['a','b','c','d'].map(id=>({id}));
const playlists = [{id:'p',track_ids:['c','a','deleted']}];
test('playlist navigation follows playlist order and wraps without leaking other tracks',()=>{
 const queue=playbackTracks(tracks,playlists,'p');
 assert.deepEqual(queue.map(t=>t.id),['c','a']);
 assert.equal(adjacentTrack(queue,'c',1).id,'a');
 assert.equal(adjacentTrack(queue,'a',1).id,'c');
 assert.equal(adjacentTrack(queue,'c',-1).id,'a');
});
test('switching playlist enters it on next; missing and empty playlists stay empty',()=>{
 const queue=playbackTracks(tracks,playlists,'p');
 assert.equal(adjacentTrack(queue,'b',1).id,'c');
 assert.equal(adjacentTrack(queue,'b',-1).id,'a');
 assert.equal(adjacentTrack(playbackTracks(tracks,playlists,'missing'),'a',1),undefined);
 assert.equal(adjacentTrack(playbackTracks(tracks,[{id:'empty',track_ids:[]}],'empty'),'a',1),undefined);
 assert.equal(adjacentTrack([tracks[0]],'a',1).id,'a');
 assert.deepEqual(playbackTracks(tracks,playlists,null),tracks);
});
