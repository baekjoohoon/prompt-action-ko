const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const instruction = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'optimize-prompt.txt'),
  'utf8'
);
const lower = instruction.toLowerCase();

test('optimizer instructions require English output and a Korean answer', () => {
  assert.match(lower, /complete optimized prompt in english/);
  assert.match(lower, /answer the user in korean/);
  assert.match(lower, /please answer in korean/);
  assert.match(lower, /return only the optimized prompt/);
});

test('optimizer instructions explicitly protect important literals', () => {
  for (const literal of ['paths', 'urls', 'commands', 'code', 'filenames', 'identifiers', 'quantities', 'dates', 'prices', 'quoted strings']) {
    assert.match(lower, new RegExp(literal));
  }
  assert.match(lower, /never silently change concrete values/);
  assert.match(lower, /untrusted data/);
});

test('optimizer instructions convert implied execution intent instead of merely translating', () => {
  assert.match(lower, /do not merely translate or paraphrase/);
  assert.match(lower, /concrete, actionable instructions/);
  assert.match(lower, /diagnosing root causes/);
  assert.match(lower, /investigating failures/);
  assert.match(lower, /do not turn every prompt into a large template/);
});
