import {test} from 'node:test';
import assert from 'node:assert/strict';
import { BINS, canStand, generationBlock } from '../src/components/library/store3d/layout.ts';
test('walkable aisle stays clear and bins, counter and walls block movement',()=>{
 for(let z=-6;z<=8;z+=.1) assert.ok(canStand(0,z));
 for(const bin of BINS) assert.equal(canStand(bin.x,bin.z),false);
 assert.equal(canStand(0,-7.35),false);
 assert.equal(canStand(6.3,0),false);
 assert.equal(canStand(0,9),false);
 assert.equal(canStand(-3.3,5.2),true);
});
test('GPU guard blocks every heavy stage and permits finished, paused and queued jobs',()=>{
 for(const status of ['waiting','downloading','planning','generating','synthesizing','decoding']) assert.ok(generationBlock([{status,engine:'yue2'}],null),status);
 for(const status of ['queued','paused','done','error','cancelled']) assert.equal(generationBlock([{status,engine:'yue2'}],null),null,status);
 assert.equal(generationBlock([{status:'generating',engine:'stub'}],null),null);
 assert.match(generationBlock([],{model_activity:{name:'YuE2',started_at:1}}),/YuE2/);
});
