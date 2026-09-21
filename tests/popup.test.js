const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.js'), 'utf8');
const popup = require('../extension/popup/popup.js');

test('popup exposes shortcut and Native Host/Codex/auth status without engine settings', () => {
  assert.match(html, /Prompt Action/);
  assert.match(html, /Ctrl/);
  assert.match(html, /id="native-status"/);
  assert.match(html, /id="codex-status"/);
  assert.match(html, /id="codex-auth-status"/);
  assert.match(html, /id="codex-login-button"/);
  assert.match(html, /id="codex-install-link"/);
  assert.match(html, /developers\.openai\.com\/codex\/cli/);
  assert.match(script, /sendMessage\(\{ action: 'codex_login' \}/);
  assert.doesNotMatch(html, /engine-mode|AppServer|Auto|Exec/);
  assert.doesNotMatch(script, /get_engine_mode|set_engine_mode|validateEngineMode/);
  assert.doesNotMatch(script, /chrome\.storage/);
});

test('popup renders ready, login-required, and Codex-missing states', () => {
  const ready = popup.createStatusView({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: true
  });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.auth, '✅ 로그인됨');
  assert.equal(ready.showLogin, false);

  const loginNeeded = popup.createStatusView({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: false
  });
  assert.equal(loginNeeded.state, 'login-needed');
  assert.equal(loginNeeded.auth, '❌ 로그인 필요');
  assert.equal(loginNeeded.showLogin, true);

  const missing = popup.createStatusView({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: false,
    codexAuthenticated: false
  });
  assert.equal(missing.state, 'codex-missing');
  assert.equal(missing.codex, '❌ 설치 필요');
  assert.equal(missing.auth, '— 확인 불가');
  assert.equal(missing.showInstall, true);
});
