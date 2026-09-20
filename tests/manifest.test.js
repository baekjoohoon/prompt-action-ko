const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Manifest V3 is narrow and points at the implemented components', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.2.0');
  assert.deepEqual(manifest.permissions, ['nativeMessaging']);
  assert.deepEqual(manifest.host_permissions.sort(), [
    'https://chat.openai.com/*',
    'https://chatgpt.com/*'
  ]);
  assert.equal(manifest.background.service_worker, 'service-worker.js');
  assert.equal(manifest.content_scripts.length, 1);
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.ok(!manifest.permissions.includes('tabs'));
  assert.ok(!manifest.permissions.includes('clipboardRead'));
});
