const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const installScript = fs.readFileSync(path.join(root, 'scripts', 'install-native-host.ps1'), 'utf8');
const uninstallScript = fs.readFileSync(path.join(root, 'scripts', 'uninstall-native-host.ps1'), 'utf8');

test('native-host installer supports Chrome, Edge, and Both with Both as the default', () => {
  assert.match(installScript, /ValidateSet\('Chrome', 'Edge', 'Both'\)/);
  assert.match(installScript, /\$Browser = 'Both'/);
  assert.match(installScript, /Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(installScript, /Software\\Microsoft\\Edge\\NativeMessagingHosts/);
  assert.match(installScript, /default \{ @\('Chrome', 'Edge'\) \}/);
  assert.match(installScript, /allowed_origins/);
});

test('native-host uninstaller removes only Prompt Action registry entries and supports both browsers', () => {
  assert.match(uninstallScript, /ValidateSet\('Chrome', 'Edge', 'Both'\)/);
  assert.match(uninstallScript, /\$Browser = 'Both'/);
  assert.match(uninstallScript, /Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(uninstallScript, /Software\\Microsoft\\Edge\\NativeMessagingHosts/);
  assert.match(uninstallScript, /DeleteSubKey\(\$hostName, \$false\)/);
  assert.doesNotMatch(uninstallScript, /Remove-Item.*Registry/i);
});

test('PowerShell scripts configure UTF-8 console output and do not use unsupported browser assumptions', () => {
  for (const file of ['install-native-host.ps1', 'uninstall-native-host.ps1', 'build-native-host.ps1']) {
    const content = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.match(content, /\[Console\]::OutputEncoding/);
    assert.match(content, /\$OutputEncoding/);
  }
});
