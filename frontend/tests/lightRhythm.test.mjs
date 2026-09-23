import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLightRhythm,styleLighting} from '../src/components/library/store3d/lightRhythm.ts';
test('saved tempo drives sequencing and seek or track changes reset it',()=>{
 const r=createLightRhythm();let state;
 for(let i=0;i<=100;i++)state=r.update(i/50,.3,120,'one');
 assert.ok(Math.abs(state.beat-4)<.001);assert.equal(state.tempo,120);
 assert.equal(r.update(0,.3,90,'two').beat,0);
 assert.ok(styleLighting('synthwave dance').pace>styleLighting('ambient lo-fi').pace);
});
