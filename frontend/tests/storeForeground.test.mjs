import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene, PerspectiveCamera, Mesh, Group, Color, Fog} from 'three';
import {foreground, renderStore} from '../src/components/library/store3d/foreground.ts';

test('only the inspection clone and deck move to foreground; shelf records remain occluded',()=>{
  const shelf=new Mesh(),held=shelf.clone(),deck=new Group(),arm=new Mesh();
  deck.add(arm);foreground(held);foreground(deck);
  assert.equal(shelf.layers.mask,1);
  assert.equal(held.layers.mask,2);
  assert.equal(deck.layers.mask,2);
  assert.equal(arm.layers.mask,2);
  // Returning discards the clone; the original never loses normal world depth.
  const camera=new PerspectiveCamera();camera.add(held);camera.remove(held);
  assert.equal(shelf.layers.mask,1);
});

test('foreground clears only world depth and preserves depth among held objects',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();
  scene.background=new Color('#11111a');scene.fog=new Fog('#11111a',14,30);
  const background=scene.background,fog=scene.fog,events=[];
  const renderer={autoClear:true,clear(){events.push('clear');},clearDepth(){events.push('depth');},
    render(s,c){events.push({mask:c.layers.mask,background:s.background,fog:s.fog,autoClear:this.autoClear});}};
  renderStore(renderer,scene,camera);
  assert.deepEqual(events,['clear',{mask:1,background,fog,autoClear:false},'depth',{mask:2,background:null,fog:null,autoClear:false}]);
  assert.equal(camera.layers.mask,1);assert.equal(scene.background,background);assert.equal(scene.fog,fog);assert.equal(renderer.autoClear,true);
});

test('a failed foreground render restores world render state',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();scene.background=new Color('black');
  const background=scene.background;
  const renderer={autoClear:true,clear(){},clearDepth(){},render(_s,c){if(c.layers.mask===2)throw Error('GPU interrupted');}};
  assert.throws(()=>renderStore(renderer,scene,camera),/GPU interrupted/);
  assert.equal(camera.layers.mask,1);assert.equal(scene.background,background);assert.equal(renderer.autoClear,true);
});

test('reflections render only the world before the held-object depth pass',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),events=[];
  const renderer={autoClear:true,clear(){},clearDepth(){events.push('depth');},render(_s,c){events.push(c.layers.mask);}};
  renderStore(renderer,scene,camera,()=>{assert.equal(camera.layers.mask,1);events.push('reflections');});
  assert.deepEqual(events,['reflections','depth',2]);
  assert.equal(camera.layers.mask,1);
});
