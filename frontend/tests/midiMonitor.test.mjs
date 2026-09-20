import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MidiMonitor } from '../src/lib/midiMonitor.ts';
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
test('live monitor handles chords, velocity-zero releases, retriggers, channel panic and cleanup',async()=>{
 const voices=[];
 globalThis.AudioContext=class {
  state='running'; currentTime=0; destination={};
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createOscillator(){ const voice={frequency:param(),connect(){},disconnect(){},start(){},stop(){this.stopped=true;},stopped:false}; voices.push(voice); return voice; }
  async resume(){} async close(){this.state='closed';}
 };
 const monitor=new MidiMonitor(); await monitor.enable();
 monitor.message(144,69,100); monitor.message(145,60,80);
 assert.equal(voices.length,2); assert.equal(voices[0].frequency.value,440);
 monitor.message(144,69,0); assert.ok(voices[0].stopped); assert.equal(voices[1].stopped,false);
 monitor.message(145,60,100); assert.ok(voices[1].stopped);
 monitor.message(177,123,0); assert.ok(voices[2].stopped);
 monitor.setVolume(0); monitor.message(144,62,100); assert.equal(voices.length,3);
 monitor.setVolume(.5); monitor.message(144,64,100); monitor.close(); assert.ok(voices[3].stopped);
 delete globalThis.AudioContext;
});
