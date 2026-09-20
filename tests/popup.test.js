const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.js'), 'utf8');

test('popup exposes shortcut and native/Codex status without engine settings', () => {
  assert.match(html, /Prompt Action/);
  assert.match(html, /Ctrl/);
  assert.match(html, /id="native-status"/);
  assert.match(html, /id="codex-status"/);
  assert.doesNotMatch(html, /engine-mode|AppServer|Auto|Exec/);
  assert.doesNotMatch(script, /get_engine_mode|set_engine_mode|validateEngineMode/);
  assert.doesNotMatch(script, /chrome\.storage/);
});
