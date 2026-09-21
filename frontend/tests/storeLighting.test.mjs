import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MeshBasicMaterial, MeshStandardMaterial} from 'three';
import {roomLightFader} from '../src/components/library/store3d/lighting.ts';

test('emissive Blender bake dims and restores without changing its texture',()=>{
  const bake=new MeshStandardMaterial({color:0,emissive:0xffffff,emissiveIntensity:2});
  const map=bake.emissiveMap, fader=roomLightFader();
  fader.add(bake);fader.set(.08);
  assert.equal(bake.emissiveIntensity,.16);
  assert.equal(bake.emissiveMap,map);
  fader.add(bake); // Shared materials must not capture their already dimmed state.
  fader.set(.5);assert.equal(bake.emissiveIntensity,1);
  fader.set(1);assert.equal(bake.emissiveIntensity,2);
  fader.set(.08);assert.equal(bake.emissiveIntensity,.16);
});

test('unlit bake preserves its original tint while separate neon stays lit',()=>{
  const bake=new MeshBasicMaterial({color:0x80a0c0}), neon=new MeshBasicMaterial({color:0xff2288});
  const original=bake.color.clone(), neonColor=neon.color.clone(), fader=roomLightFader();
  fader.add(bake);fader.set(.08);
  assert.ok(bake.color.equals(original.clone().multiplyScalar(.08)));
  assert.ok(neon.color.equals(neonColor));
  fader.set(1);assert.ok(bake.color.equals(original));
  assert.equal(fader.brightness,1);
});
