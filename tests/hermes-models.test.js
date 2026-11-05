const {test} = require('node:test');
const assert = require('node:assert/strict');
const {snapshot} = require('../scripts/refresh-hermes-models');
test('free catalog requires explicit zero prices, including stealth models; retired IDs can return', () => {
  const model = (id, prompt, completion) => ({id, pricing: {prompt, completion}, description: 'not persisted'});
  const result = snapshot({data: [model('stealth/new', '0.0000000000', '0'), model('paid:free', '0', '1'), model('missing', undefined, undefined), model('null', null, null), model('empty', '', ''), model('false', false, false), model('returned', 0, 0)]}, {models: [{id: 'old'}], retired_model_ids: ['returned']});
  assert.deepEqual(result.models.map(m => m.id), ['returned', 'stealth/new']);
  assert.deepEqual(result.retired_model_ids, ['old']);
  assert.equal(JSON.stringify(result).includes('not persisted'), false);
});
test('empty, malformed and duplicate catalogs cannot replace a working snapshot', () => {
  for (const catalog of [{}, {data: []}, {data: [{id: 'paid', pricing: {prompt: '1', completion: '1'}}]}, {data: [1, 1].map(() => ({id: 'dup', pricing: {prompt: 0, completion: 0}}))}]) {
    assert.throws(() => snapshot(catalog, {models: [], retired_model_ids: []}));
  }
});
