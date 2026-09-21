const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../extension/shared/contract.js');

test('native message contract accepts only an optimize_prompt payload', () => {
  const result = contract.validateOptimizeRequest({
    action: 'optimize_prompt',
    text: '엑셀 BOM을 분석해줘'
  });

  assert.deepEqual(result, { ok: true, text: '엑셀 BOM을 분석해줘' });
  assert.equal(contract.validateOptimizeRequest({ action: 'run', command: 'whoami' }).ok, false);
  assert.equal(contract.validateOptimizeRequest({
    action: 'optimize_prompt',
    text: 'ok',
    executable: 'cmd.exe'
  }).error.code, 'INVALID_REQUEST');
});

test('contract rejects unknown actions, oversized input, and empty input', () => {
  assert.equal(contract.validateOptimizeRequest({ action: 'unknown', text: 'x' }).error.code, 'UNKNOWN_ACTION');
  assert.equal(contract.validateOptimizeRequest({
    action: 'optimize_prompt',
    text: 'x'.repeat(contract.MAX_PROMPT_LENGTH + 1)
  }).error.code, 'INPUT_TOO_LARGE');
  assert.equal(contract.validateOptimizeRequest({ action: 'optimize_prompt', text: ' \n\t' }).error.code, 'EMPTY_PROMPT');
  assert.equal(contract.validatePingRequest({ action: 'ping' }).ok, true);
  assert.equal(contract.validatePingRequest({ action: 'ping', text: 'not allowed' }).error.code, 'INVALID_REQUEST');
  assert.equal(contract.validateCodexLoginRequest({ action: 'codex_login' }).ok, true);
  assert.equal(contract.validateCodexLoginRequest({
    action: 'codex_login',
    command: 'whoami'
  }).error.code, 'INVALID_REQUEST');
});

test('ping and Codex login responses require the narrow status contract', () => {
  const authenticated = contract.validatePingResponse({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: true
  });
  assert.deepEqual(authenticated, {
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: true
  });
  assert.equal(contract.validatePingResponse({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true
  }).ok, false);
  assert.equal(contract.validatePingResponse({
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true,
    codexAuthenticated: true,
    command: 'whoami'
  }).ok, false);
  assert.deepEqual(
    contract.validateCodexLoginResponse({ ok: true, loginStarted: true }),
    { ok: true, loginStarted: true }
  );
  assert.equal(contract.validateCodexLoginResponse({
    ok: true,
    loginStarted: true,
    executable: 'codex.exe'
  }).ok, false);
});

test('optimize response accepts LOW/MEDIUM timing metadata and rejects HIGH', () => {
  const valid = contract.validateOptimizeResponse({
    ok: true,
    text: 'Build a prompt. Please answer in Korean.',
    meta: {
      effort: 'medium',
      totalMs: 3200,
      codexTotalMs: 2840,
      hostTotalMs: 2860,
      hostOverheadMs: 20,
      codexProcessStartMs: 12,
      nativeTotalMs: 2870,
      applyMs: 40
    }
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.meta.effort, 'medium');
  assert.equal(contract.validateOptimizeResponse({
    ok: true,
    text: 'Build a prompt. Please answer in Korean.',
    meta: { effort: 'high', codexTotalMs: 1 }
  }).error.code, 'INVALID_NATIVE_RESPONSE');
});

test('final contract exposes one Exec path and no App Server metadata', () => {
  assert.equal('ENGINE_MODES' in contract, false);
  assert.equal('validateEngineMode' in contract, false);
  assert.equal(contract.ERROR_CODES.some((code) => code.startsWith('APP_SERVER')), false);
  assert.equal(contract.validateOptimizeResponse({
    ok: true,
    text: 'Please answer in Korean.',
    meta: { effort: 'low', codexTotalMs: 1 }
  }).ok, true);
  assert.equal(contract.validateOptimizeResponse({
    ok: true,
    text: 'Please answer in Korean.',
    meta: { effort: 'low', engine: 'exec' }
  }).error.code, 'INVALID_NATIVE_RESPONSE');
});

test('supported ChatGPT URL validation is narrow', () => {
  assert.equal(contract.isSupportedChatGPTUrl('https://chatgpt.com/c/123'), true);
  assert.equal(contract.isSupportedChatGPTUrl('https://chat.openai.com/'), true);
  assert.equal(contract.isSupportedChatGPTUrl('http://chatgpt.com/'), false);
  assert.equal(contract.isSupportedChatGPTUrl('https://example.com/'), false);
  assert.equal(contract.isSupportedChatGPTUrl('https://evil-chatgpt.com/'), false);
});
