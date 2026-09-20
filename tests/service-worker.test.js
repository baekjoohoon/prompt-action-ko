const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../extension/shared/contract.js');
const complexity = require('../extension/shared/complexity.js');
const {
  createNativeClient,
  createServiceWorkerApi
} = require('../extension/service-worker.js');

class FakeEvent {
  constructor() {
    this.listeners = [];
  }

  addListener(listener) {
    this.listeners.push(listener);
  }

  emit(...args) {
    for (const listener of [...this.listeners]) {
      listener(...args);
    }
  }
}

class FakePort {
  constructor() {
    this.onMessage = new FakeEvent();
    this.onDisconnect = new FakeEvent();
    this.messages = [];
    this.disconnected = false;
  }

  postMessage(message) {
    if (this.disconnected) {
      throw new Error('disconnected');
    }
    this.messages.push(message);
  }

  respond(response) {
    this.onMessage.emit(response);
  }

  disconnect() {
    if (!this.disconnected) {
      this.disconnected = true;
      this.onDisconnect.emit();
    }
  }
}

function createFakeChrome() {
  const ports = [];
  const chromeRef = {
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      lastError: null,
      connectNative() {
        const port = new FakePort();
        ports.push(port);
        return port;
      }
    }
  };
  return { chromeRef, ports };
}

function optimizeResponse(text, effort = 'low') {
  return {
    ok: true,
    text,
    meta: {
      effort,
      codexTotalMs: 20,
      hostTotalMs: 21,
      hostOverheadMs: 1,
      codexProcessStartMs: 2
    }
  };
}

test('persistent native port is reused and responses correlate by request ID', async () => {
  const { chromeRef, ports } = createFakeChrome();
  const client = createNativeClient(chromeRef, contract, {
    timeoutMs: 1000,
    now: () => 100
  });

  const firstPromise = client.callNative(
    { action: 'optimize_prompt', text: 'first', effort: 'low' },
    contract.validateOptimizeResponse
  );
  const secondPromise = client.callNative(
    { action: 'ping' },
    contract.validatePingResponse
  );

  assert.equal(ports.length, 1);
  assert.equal(ports[0].messages.length, 2);
  assert.notEqual(ports[0].messages[0].requestId, ports[0].messages[1].requestId);

  const firstId = ports[0].messages[0].requestId;
  const secondId = ports[0].messages[1].requestId;
  ports[0].respond({
    requestId: secondId,
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true
  });
  ports[0].respond({
    requestId: firstId,
    ...optimizeResponse('optimized')
  });

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.ok, true);
  assert.equal(first.text, 'optimized');
  assert.equal(first.meta.nativeTotalMs, 0);
  assert.equal(second.ok, true);
  assert.equal(second.host, 'Prompt Action');
  assert.equal(client.pendingCount(), 0);
});

test('a disconnected native port is cleared and reconnects once on the next request', async () => {
  const { chromeRef, ports } = createFakeChrome();
  const client = createNativeClient(chromeRef, contract, { timeoutMs: 1000 });

  const firstPromise = client.callNative({ action: 'ping' }, contract.validatePingResponse);
  assert.equal(ports.length, 1);
  ports[0].disconnect();
  const first = await firstPromise;
  assert.equal(first.ok, false);
  assert.equal(client.hasPort(), false);

  const secondPromise = client.callNative({ action: 'ping' }, contract.validatePingResponse);
  assert.equal(ports.length, 2);
  assert.equal(client.hasPort(), true);
  ports[1].respond({
    requestId: ports[1].messages[0].requestId,
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true
  });
  const second = await secondPromise;
  assert.equal(second.ok, true);
});

test('native request timeout still returns the original timeout error contract', async () => {
  const { chromeRef, ports } = createFakeChrome();
  const client = createNativeClient(chromeRef, contract, { timeoutMs: 15 });

  const response = await client.callNative({ action: 'optimize_prompt', text: 'slow', effort: 'low' }, contract.validateOptimizeResponse);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'CODEX_TIMEOUT');
  assert.equal(ports.length, 1);
  assert.equal(client.pendingCount(), 0);
});

test('service worker API keeps BUSY protection while reusing its port', async () => {
  const { chromeRef, ports } = createFakeChrome();
  const api = createServiceWorkerApi(chromeRef, contract, complexity, { timeoutMs: 1000 });

  const firstPromise = api.optimizePrompt('이 프로그램 코드를 분석하고 테스트해줘');
  const busy = await api.optimizePrompt('두 번째 요청');
  assert.equal(busy.ok, false);
  assert.equal(busy.error.code, 'BUSY');
  assert.equal(ports.length, 1);
  assert.equal(ports[0].messages[0].effort, 'medium');
  assert.equal('engineMode' in ports[0].messages[0], false);

  ports[0].respond({
    requestId: ports[0].messages[0].requestId,
    ...optimizeResponse('optimized', 'medium')
  });
  const result = await firstPromise;
  assert.equal(result.ok, true);
  assert.equal(result.meta.effort, 'medium');

  const pingPromise = api.checkNativeHost();
  assert.equal(ports.length, 1);
  ports[0].respond({
    requestId: ports[0].messages[1].requestId,
    ok: true,
    host: 'Prompt Action',
    codexAvailable: true
  });
  assert.equal((await pingPromise).ok, true);
});
