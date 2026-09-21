const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const nativeHostPath = process.env.PROMPT_ACTION_NATIVE_HOST_PATH ||
  path.join(repoRoot, 'native-host', 'dist', 'PromptAction.NativeHost.exe');

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function readResponse(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timeout = setTimeout(() => {
      child.stdout.off('data', onData);
      reject(new Error('native host response timeout'));
    }, timeoutMs);

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) {
        return;
      }
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) {
        return;
      }
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      resolve(JSON.parse(buffer.subarray(4, length + 4).toString('utf8')));
    }

    child.stdout.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      reject(error);
    });
  });
}

function startNativeHost(fakeCodex, options = {}) {
  const stderr = [];
  const child = spawn(nativeHostPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PROMPT_ACTION_CODEX_PATH: fakeCodex,
      ...options.env
    }
  });
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
  return { child, stderr };
}

async function sendRequest(child, request, timeoutMs = 10000) {
  const responsePromise = readResponse(child, timeoutMs);
  child.stdin.write(frame(request));
  return responsePromise;
}

async function closeHost(host) {
  if (host.child.exitCode === null && !host.child.killed) {
    host.child.stdin.end();
  }
  if (host.child.exitCode === null) {
    await new Promise((resolve) => host.child.once('close', resolve));
  }
}

function createFakeCodex() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-action-test-'));
  const scriptPath = path.join(directory, 'fake-codex.js');
  const commandPath = path.join(directory, 'fake-codex.cmd');
  fs.writeFileSync(scriptPath, [
    "const fs = require('fs');",
    "const args = process.argv.slice(2);",
    "const statePath = process.env.PROMPT_ACTION_FAKE_STATE;",
    "const mode = process.env.PROMPT_ACTION_FAKE_MODE || 'success';",
    "const authenticated = process.env.PROMPT_ACTION_FAKE_AUTH !== 'false';",
    "const expected = process.env.PROMPT_ACTION_FAKE_EXPECTED || '한국어 입력 ✅';",
    "function record(value) { if (statePath) fs.appendFileSync(statePath, JSON.stringify(value) + '\\n'); }",
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  if (args[0] === 'login' && args[1] === 'status') {",
    "    record({ method: 'login-status', args, input });",
    "    if (!authenticated) { process.stderr.write('Not logged in'); process.exitCode = 1; return; }",
    "    process.stdout.write('Logged in'); return;",
    "  }",
    "  if (args[0] === 'login') {",
    "    record({ method: 'login', args, input });",
    "    process.stdout.write('Login started'); return;",
    "  }",
    "  record({ method: 'exec', args, input });",
    "  if (mode === 'timeout') { setInterval(() => {}, 1000); return; }",
    "  if (mode === 'auth') { process.stderr.write('Please login to Codex.'); process.exitCode = 1; return; }",
    "  if (mode === 'failure') { process.stderr.write('fake Codex failure'); process.exitCode = 7; return; }",
    "  if (!input.includes(expected)) { process.stderr.write('missing expected stdin'); process.exitCode = 7; return; }",
    "  const effortArg = args.find((value) => value.startsWith('model_reasoning_effort='));",
    "  const effort = effortArg ? effortArg.split('=')[1] : 'missing';",
    "  process.stdout.write('EXEC ' + effort + ' optimized prompt. Please answer in Korean.');",
    "});"
  ].join('\n'), 'utf8');
  const nodePath = process.execPath.replace(/"/g, '');
  const scriptForCmd = scriptPath.replace(/"/g, '');
  fs.writeFileSync(commandPath, `@echo off\r\n"${nodePath}" "${scriptForCmd}" %*\r\n`, 'utf8');
  return { directory, commandPath, statePath: path.join(directory, 'events.jsonl') };
}

function readEvents(statePath) {
  if (!fs.existsSync(statePath)) {
    return [];
  }
  return fs.readFileSync(statePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertHostBuilt(t) {
  if (!fs.existsSync(nativeHostPath)) {
    t.skip('native host is built by scripts/build-native-host.ps1 before integration tests');
    return false;
  }
  return true;
}

test('native host processes multiple frames, preserves IDs, and passes LOW/MEDIUM through stdin', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(fake.commandPath, {
    env: {
      PROMPT_ACTION_FAKE_STATE: fake.statePath,
      PROMPT_ACTION_FAKE_EXPECTED: '한국어 입력 ✅'
    }
  });
  t.after(() => closeHost(host));

  const lowText = '한국어 입력 ✅ ; & $(whoami) "quoted"';
  const mediumText = '한국어 입력 ✅ C:\\path\\to\\prompt-action-ko';
  const low = await sendRequest(host.child, {
    action: 'optimize_prompt',
    requestId: 'low-request',
    effort: 'low',
    text: lowText
  });
  const medium = await sendRequest(host.child, {
    action: 'optimize_prompt',
    requestId: 'medium-request',
    effort: 'medium',
    text: mediumText
  });

  assert.equal(low.ok, true);
  assert.equal(low.requestId, 'low-request');
  assert.equal(low.meta.effort, 'low');
  assert.equal(low.text, 'EXEC low optimized prompt. Please answer in Korean.');
  assert.equal(medium.ok, true);
  assert.equal(medium.requestId, 'medium-request');
  assert.equal(medium.meta.effort, 'medium');
  assert.equal(medium.text, 'EXEC medium optimized prompt. Please answer in Korean.');
  assert.equal(typeof medium.meta.totalMs, 'undefined');
  assert.equal(typeof medium.meta.codexTotalMs, 'number');
  assert.equal(typeof medium.meta.hostTotalMs, 'number');
  assert.equal(typeof medium.meta.hostOverheadMs, 'number');
  assert.equal(typeof medium.meta.codexProcessStartMs, 'number');
  assert.equal(host.stderr.join(''), '');

  const events = readEvents(fake.statePath);
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.method === 'exec'));
  assert.deepEqual(events.map((event) => event.args.find((value) => value.startsWith('model_reasoning_effort='))), [
    'model_reasoning_effort=low',
    'model_reasoning_effort=medium'
  ]);
  assert.ok(events[0].input.includes(lowText));
  assert.ok(events[1].input.includes(mediumText));
  assert.equal(events[0].args.includes(lowText), false);
  assert.equal(events[0].args.some((value) => value.includes('whoami')), false);
});

test('ping and request validation reject unsupported commands', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(fake.commandPath);
  t.after(() => closeHost(host));

  const ping = await sendRequest(host.child, { action: 'ping', requestId: 'ping-request' });
  assert.deepEqual(ping, {
    ok: true,
    requestId: 'ping-request',
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: true
  });

  const unknown = await sendRequest(host.child, {
    action: 'run',
    requestId: 'bad-request',
    command: 'whoami'
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.requestId, 'bad-request');
  assert.equal(unknown.error.code, 'UNKNOWN_ACTION');

  const engineMode = await sendRequest(host.child, {
    action: 'optimize_prompt',
    requestId: 'old-mode',
    effort: 'low',
    engineMode: 'exec',
    text: '한국어 입력 ✅'
  });
  assert.equal(engineMode.ok, false);
  assert.equal(engineMode.error.code, 'INVALID_REQUEST');
});

test('ping distinguishes an installed but unauthenticated Codex CLI', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(fake.commandPath, {
    env: {
      PROMPT_ACTION_FAKE_STATE: fake.statePath,
      PROMPT_ACTION_FAKE_AUTH: 'false'
    }
  });
  t.after(() => closeHost(host));

  const ping = await sendRequest(host.child, { action: 'ping', requestId: 'unauthenticated' });
  assert.deepEqual(ping, {
    ok: true,
    requestId: 'unauthenticated',
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: false
  });
  assert.deepEqual(readEvents(fake.statePath).map((event) => ({ method: event.method, args: event.args })), [
    { method: 'login-status', args: ['login', 'status'] }
  ]);
});

test('ping reports an unavailable Codex CLI without attempting a command', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(path.join(fake.directory, 'does-not-exist.cmd'));
  t.after(() => closeHost(host));

  const ping = await sendRequest(host.child, { action: 'ping', requestId: 'missing-codex' });
  assert.deepEqual(ping, {
    ok: true,
    requestId: 'missing-codex',
    host: 'Prompt Action',
    codexAvailable: false,
    codexAuthenticated: false
  });
  assert.deepEqual(readEvents(fake.statePath), []);
});

test('codex_login starts only the fixed login command and rejects browser arguments', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(fake.commandPath, {
    env: { PROMPT_ACTION_FAKE_STATE: fake.statePath }
  });
  t.after(() => closeHost(host));

  const startedAt = Date.now();
  const login = await sendRequest(host.child, { action: 'codex_login', requestId: 'login-request' });
  assert.equal(login.ok, true);
  assert.equal(login.requestId, 'login-request');
  assert.equal(login.loginStarted, true);
  assert.ok(Date.now() - startedAt < 2000);

  const invalid = await sendRequest(host.child, {
    action: 'codex_login',
    requestId: 'login-with-arguments',
    executable: 'whoami',
    arguments: ['--unsafe']
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_REQUEST');

  const deadline = Date.now() + 2000;
  let events = [];
  while (Date.now() < deadline) {
    events = readEvents(fake.statePath);
    if (events.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(events.map((event) => ({ method: event.method, args: event.args })), [
    { method: 'login', args: ['login'] }
  ]);
});

test('Codex timeout is bounded and returns the stable error contract', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const fake = createFakeCodex();
  t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
  const host = startNativeHost(fake.commandPath, {
    env: {
      PROMPT_ACTION_FAKE_MODE: 'timeout',
      PROMPT_ACTION_CODEX_TIMEOUT_MS: '100'
    }
  });
  t.after(() => closeHost(host));

  const response = await sendRequest(host.child, {
    action: 'optimize_prompt',
    requestId: 'timeout-request',
    effort: 'low',
    text: '한국어 입력 ✅'
  }, 5000);
  assert.equal(response.ok, false);
  assert.equal(response.requestId, 'timeout-request');
  assert.equal(response.error.code, 'CODEX_TIMEOUT');
});

test('Codex failure, authentication failure, and missing executable are classified', { timeout: 30000 }, async (t) => {
  if (!assertHostBuilt(t)) return;
  const cases = [
    ['failure', 'CODEX_FAILED'],
    ['auth', 'CODEX_NOT_AUTHENTICATED']
  ];

  for (const [mode, code] of cases) {
    const fake = createFakeCodex();
    t.after(() => fs.rmSync(fake.directory, { recursive: true, force: true }));
    const host = startNativeHost(fake.commandPath, { env: { PROMPT_ACTION_FAKE_MODE: mode } });
    t.after(() => closeHost(host));
    const response = await sendRequest(host.child, {
      action: 'optimize_prompt',
      requestId: `${mode}-request`,
      effort: 'medium',
      text: '한국어 입력 ✅'
    });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code);
  }

  const missing = createFakeCodex();
  t.after(() => fs.rmSync(missing.directory, { recursive: true, force: true }));
  const missingHost = startNativeHost(path.join(missing.directory, 'does-not-exist.cmd'));
  t.after(() => closeHost(missingHost));
  const missingResponse = await sendRequest(missingHost.child, {
    action: 'optimize_prompt',
    requestId: 'missing-request',
    effort: 'low',
    text: '한국어 입력 ✅'
  });
  assert.equal(missingResponse.ok, false);
  assert.equal(missingResponse.error.code, 'CODEX_NOT_FOUND');
});
