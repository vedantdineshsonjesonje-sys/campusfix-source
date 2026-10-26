'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../ai-core.js');

test('semantic category prototypes cover the app categories and are immutable', () => {
  assert.equal(new Set(core.PROTOTYPES.map(item => item.category)).size, 8);
  assert.equal(core.PROTOTYPES.length, 24);
  assert.ok(core.PROTOTYPES.every(item => item.text.length > 20));
  assert.ok(Object.isFrozen(core.PROTOTYPES));
  assert.ok(Object.isFrozen(core.PROTOTYPES[0]));
});
test('cosine similarity handles normalization, negative values, and invalid vectors', () => {
  assert.equal(core.cosine([1, 0], [5, 0]), 1);
  assert.equal(core.cosine([1, 0], [0, 1]), 0);
  assert.equal(core.cosine([1, 0], [-1, 0]), -1);
  assert.equal(core.cosine([0, 0], [0, 0]), 0);
  assert.equal(core.cosine([1], [1, 2]), 0);
  assert.equal(core.cosine([NaN, 0], [1, 0]), 0);
});
test('category ranking uses semantic vectors and weak matches fall back to Other', () => {
  const vectors = core.PROTOTYPES.map(item => item.category === 'Plumbing' ? [1, 0] : [0, 1]);
  const before = JSON.stringify(vectors);
  const ranked = core.rankClassification([1, 0], vectors);
  assert.equal(ranked.category, 'Plumbing');
  assert.equal(ranked.score, 1);
  assert.equal(ranked.alternatives.length, 2);
  assert.equal(JSON.stringify(vectors), before);
  assert.equal(core.rankClassification([0, 0], vectors).category, 'Other');
  assert.throws(() => core.rankClassification([1], []), /incomplete/);
});
test('duplicate scoring rejects unrelated locations and caps stable ranked matches', () => {
  const cases = [
    { id: 'same', vector: [1, 0], locationVector: [1, 0] },
    { id: 'paraphrase', vector: [0.8, 0.6], locationVector: [1, 0] },
    { id: 'different-building', vector: [0.8, 0.6], locationVector: [0, 1] },
    { id: 'unrelated', vector: [0, 1], locationVector: [1, 0] },
    { id: 'related', vector: [0.7, 0.7], locationVector: [1, 0] },
    { id: 'fourth', vector: [0.7, 0.7], locationVector: [1, 0] }
  ];
  const before = JSON.stringify(cases);
  const result = core.rankDuplicates([1, 0], [1, 0], cases);
  assert.deepEqual(result.map(item => item.id), ['same', 'paraphrase', 'related']);
  assert.equal(JSON.stringify(cases), before);
  assert.deepEqual(core.rankDuplicates([1, 0], null, null), []);
});
test('report inputs discard invalid records, deduplicate IDs, and bound text', () => {
  const input = { title: '  Broken tap  ', description: 'x'.repeat(2200), location: '  Library  ', issues: [null, { id: 'one', title: 'A leaking faucet' }, { id: 'one', title: 'Duplicate ID' }, { title: 'No ID' }] };
  const result = core.sanitizeInput(input);
  assert.equal(result.title, 'Broken tap');
  assert.equal(result.description.length, 2000);
  assert.equal(result.location, 'Library');
  assert.equal(result.issues.length, 1);
  assert.equal(input.title, '  Broken tap  ');
  assert.equal(core.reportText(result), 'Broken tap. ' + 'x'.repeat(2000));
  assert.throws(() => core.sanitizeInput({ title: 'a' }), /at least 3/);
});
function createClient(protocol = 'http:') {
  const workers = [];
  class WorkerStub {
    constructor(url, options) { this.url = String(url); this.options = options; this.listeners = {}; this.messages = []; workers.push(this); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(message) { this.listeners.message({ data: message }); }
  }
  const context = { window: {}, location: { protocol }, document: { currentScript: { src: 'http://localhost/ai-client.js' }, baseURI: 'http://localhost/' }, Worker: WorkerStub, WebAssembly: {}, URL, Map, Promise, Object, Error, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ai-client.js'), 'utf8'), context);
  return { client: context.window.CampusAI, workers };
}
test('AI client uses a module worker, forwards progress, and resolves model output', async () => {
  const { client, workers } = createClient();
  const updates = [];
  const pending = client.analyze({ title: 'Leaking tap' }, value => updates.push(value));
  const worker = workers[0];
  assert.equal(worker.options.type, 'module');
  assert.match(worker.url, /ai-worker\.mjs$/);
  assert.equal(client.getStatus(), 'loading');
  const id = worker.messages[0].id;
  worker.emit({ id, type: 'progress', message: 'Loading…' });
  worker.emit({ id, type: 'result', result: { category: 'Plumbing', source: 'local-model' } });
  assert.equal((await pending).category, 'Plumbing');
  assert.deepEqual(updates, ['Loading…']);
  assert.equal(client.getStatus(), 'ready');
});
test('AI client reports worker failure and creates a fresh worker for retry', async () => {
  const { client, workers } = createClient();
  const pending = client.warmup();
  workers[0].listeners.error();
  await assert.rejects(pending, /could not start/);
  assert.equal(workers[0].terminated, true);
  assert.equal(client.getStatus(), 'error');
  const retry = client.warmup();
  assert.equal(workers.length, 2);
  workers[1].emit({ id: workers[1].messages[0].id, type: 'result', result: { source: 'local-model' } });
  assert.equal((await retry).source, 'local-model');
});
test('opening the HTML directly gives an actionable AI startup error', async () => {
  const { client, workers } = createClient('file:');
  await assert.rejects(client.analyze({ title: 'Leaking tap' }), /npm start/);
  assert.equal(workers.length, 0);
});
