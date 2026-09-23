import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry, Float32BufferAttribute, Mesh} from 'three';
import {createSpeakerMotion, speakerEnergy} from '../src/components/library/store3d/speakers.ts';

test('bass/mid and treble bands remain distinct at either audio sample rate',()=>{
  for (const rate of [44100,48000]) {
    const low=new Uint8Array(512), high=new Uint8Array(512);
    for(let i=0;i<512;i++) {const hz=i*rate/1024;if(hz>=40&&hz<=300)low[i]=255;if(hz>=2500&&hz<=12000)high[i]=255;}
    assert.ok(speakerEnergy(low,rate,'big')>.7);
    assert.equal(speakerEnergy(low,rate,'small'),0);
    assert.ok(speakerEnergy(high,rate,'small')>.9);
    assert.equal(speakerEnergy(high,rate,'big'),0);
  }
  assert.equal(speakerEnergy(new Uint8Array(),48000,'big'),0);
});

test('merged speaker pairs pulse locally, preserve spacing, and return exactly to rest',()=>{
  const geometry=new BufferGeometry();
  // Two symmetric triangles stand in for paired cones.
  geometry.setAttribute('position',new Float32BufferAttribute([-3.2,1,0,-2.8,1,0,-3,1.4,0, 2.8,1,0,3.2,1,0,3,1.4,0],3));
  const mesh=new Mesh(geometry);mesh.rotation.y=.05;mesh.updateMatrixWorld(true);
  const original=Array.from(geometry.attributes.position.array), motion=createSpeakerMotion(mesh,'big');
  motion.update(.02,1);
  const positions=geometry.attributes.position;
  assert.notDeepEqual(Array.from(positions.array),original);
  // World centroids retain their horizontal separation even with a transformed mesh.
  const centers=()=>[0,3].map(start=>{let x=0;for(let i=start;i<start+3;i++)x+=positions.getX(i);return x/3;});
  const [left,right]=centers();assert.ok(Math.abs(right-left-6)<.001);
  for(let i=0;i<200;i++)motion.update(.02,0);
  assert.deepEqual(Array.from(positions.array),original);
  geometry.dispose();mesh.material.dispose();
});

test('steady frequency energy does not create a free-running speaker loop',()=>{
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([-3,1,0,-3.1,1.1,0,-2.9,1.1,0,3,1,0,3.1,1.1,0,2.9,1.1,0],3));
 const mesh=new Mesh(g),motion=createSpeakerMotion(mesh,'big');
 for(let i=0;i<200;i++)motion.update(.02,.6);
 const held=Array.from(g.attributes.position.array);
 for(let i=0;i<60;i++)motion.update(.02,.6);
 assert.deepEqual(Array.from(g.attributes.position.array),held);
 motion.update(.02,.1);assert.notDeepEqual(Array.from(g.attributes.position.array),held);
 g.dispose();mesh.material.dispose();
});
