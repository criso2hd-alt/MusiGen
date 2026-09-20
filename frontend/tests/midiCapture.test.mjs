import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMidi } from '../src/lib/midiCapture.ts';
function readMidi(bytes) {
  assert.equal(Buffer.from(bytes.slice(0,4)).toString(), 'MThd');
  assert.equal(bytes[13], 224);
  assert.equal(new DataView(bytes.buffer).getUint32(18), bytes.length - 22);
  let pos=22, tick=0; const events=[];
  while(pos<bytes.length) {
    let delta=0, b; do { b=bytes[pos++]; delta=(delta<<7)|(b&127); } while(b&128);
    tick+=delta; const status=bytes[pos++];
    if(status===255) { const type=bytes[pos++], size=bytes[pos++]; if(type===81) events.push({tempo:bytes[pos]*65536+bytes[pos+1]*256+bytes[pos+2]}); pos+=size; }
    else if(status===192) pos++;
    else events.push({tick,status,pitch:bytes[pos++],velocity:bytes[pos++]});
  }
  return events;
}
test('MIDI retains chords, rests, note-offs and velocity with an explicit tempo',()=>{
 const events=readMidi(encodeMidi([{pitch:60,start:0,duration:.5,velocity:90},{pitch:64,start:0,duration:1,velocity:70},{pitch:67,start:2,duration:.25,velocity:80}],120));
 assert.deepEqual(events,[{tempo:500000},{tick:0,status:144,pitch:60,velocity:90},{tick:0,status:144,pitch:64,velocity:70},{tick:480,status:128,pitch:60,velocity:0},{tick:960,status:128,pitch:64,velocity:0},{tick:1920,status:144,pitch:67,velocity:80},{tick:2160,status:128,pitch:67,velocity:0}]);
});
test('repeated notes release before retriggering and tempo preserves seconds',()=>{
 const events=readMidi(encodeMidi([{pitch:60,start:0,duration:1,velocity:100},{pitch:60,start:1,duration:1,velocity:100}],60));
 assert.equal(events[0].tempo,1000000);
 assert.deepEqual(events.slice(2,4).map(e=>[e.tick,e.status]),[[480,128],[480,144]]);
});
