import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairingChoices, chooseOther } from '../src/lib/pairings.ts';

test('pairings preserve category membership and exclude unavailable labels', () => {
 const catalog = {instrument:['strings','violin','synth pads','drum machine','piano'],mood:['epic','dreamy'],vocal:['choir'],genre:['orchestral','pop']};
 const choices=pairingChoices({category:'genre',label:'orchestral'},catalog);
 assert.deepEqual(choices.instrument,['strings','violin']);
 for(const [category, labels] of Object.entries(choices)) for(const label of labels) assert.ok(catalog[category].includes(label));
 assert.deepEqual(pairingChoices({category:'vocal',label:'vocoder'},catalog).instrument,['synth pads','drum machine']);
});
test('shuffle never duplicates or returns an excluded anchor',()=>{
 assert.equal(chooseOther(['pop','piano','strings'],['pop','piano'],()=>0),'strings');
 assert.equal(chooseOther(['pop'],['pop']),undefined);
});
