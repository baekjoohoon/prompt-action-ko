const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createController,
  createToast,
  formatSuccessToast,
  isOptimizationShortcut
} = require('../extension/content/prompt-action.js');

class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }
}

class FakeAdapter {
  constructor(text = '') {
    this.text = text;
    this.composer = { id: 'composer' };
    this.focusCount = 0;
  }

  findComposer() {
    return this.composer;
  }

  getText() {
    return this.text;
  }

  setText(text) {
    this.text = text;
    return true;
  }

  focus() {
    this.focusCount += 1;
    return true;
  }
}

function keyEvent(code, extra = {}) {
  let prevented = false;
  let stopped = false;
  return {
    code,
    ctrlKey: true,
    isComposing: false,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    get prevented() { return prevented; },
    get stopped() { return stopped; },
    ...extra
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('Ctrl+Backquote recognition uses the physical Backquote code', () => {
  assert.equal(isOptimizationShortcut({ ctrlKey: true, code: 'Backquote' }), true);
  assert.equal(isOptimizationShortcut({ ctrlKey: true, code: 'Quote' }), false);
  assert.equal(isOptimizationShortcut({ ctrlKey: false, code: 'Backquote' }), false);
});

test('IME composition does not trigger optimization and empty input is ignored', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('');
  let calls = 0;
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: async () => { calls += 1; return { ok: true, text: 'unused' }; },
    showStatus: () => {}
  });

  const composing = keyEvent('Backquote', { isComposing: true });
  controller.handleKeydown(composing);
  controller.handleKeydown(keyEvent('Backquote'));
  await settle();

  assert.equal(calls, 0);
  assert.equal(composing.prevented, false);
});

test('duplicate shortcuts are blocked while one optimization is running', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('rough prompt');
  let resolveOptimization;
  let calls = 0;
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: () => {
      calls += 1;
      return new Promise((resolve) => { resolveOptimization = resolve; });
    },
    showStatus: () => {}
  });

  controller.handleKeydown(keyEvent('Backquote'));
  const duplicate = keyEvent('Backquote');
  controller.handleKeydown(duplicate);
  assert.equal(calls, 1);
  assert.equal(duplicate.prevented, true);

  resolveOptimization({ ok: true, text: 'Build a better prompt. Please answer in Korean.' });
  await settle();
});

test('successful replacement saves the original and immediate Ctrl+Z restores it exactly', async () => {
  const documentRef = new FakeDocument();
  const original = '엑셀 BOM 넣으면 비교하는 프로그램 만들어줘\n두 번째 줄';
  const optimized = 'Build an application that compares the BOM. Please answer in Korean.';
  const adapter = new FakeAdapter(original);
  const statuses = [];
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: async () => ({
      ok: true,
      text: optimized,
      meta: { effort: 'medium', codexTotalMs: 2900, nativeTotalMs: 2940 }
    }),
    showStatus: (message) => statuses.push(message)
  });

  controller.handleKeydown(keyEvent('Backquote'));
  await settle();
  assert.equal(adapter.text, optimized);
  assert.equal(controller.getState().undoState.original, original);

  const undo = keyEvent('KeyZ');
  controller.handleKeydown(undo);
  assert.equal(undo.prevented, true);
  assert.equal(adapter.text, original);
  assert.ok(statuses.includes('원문을 복구했습니다.'));
  assert.match(statuses[1], /Prompt Action 완료/);
  assert.match(statuses[1], /Codex 2.9초/);
  assert.match(statuses[1], /MEDIUM/);
});

test('stale optimization results are rejected after the composer changes', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('original prompt');
  let resolveOptimization;
  const statuses = [];
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: () => new Promise((resolve) => { resolveOptimization = resolve; }),
    showStatus: (message) => statuses.push(message)
  });

  controller.handleKeydown(keyEvent('Backquote'));
  adapter.text = 'manual edit while Codex is running';
  resolveOptimization({ ok: true, text: 'optimized prompt' });
  await settle();

  assert.equal(adapter.text, 'manual edit while Codex is running');
  assert.equal(controller.getState().undoState, null);
  assert.ok(statuses.some((message) => message.includes('원문이 변경')));
});

test('success toast formatting includes total, Codex, other, apply, effort, and recovery hint', () => {
  assert.equal(
    formatSuccessToast({
      totalMs: 3200,
      codexTotalMs: 2900,
      applyMs: 40,
      effort: 'low'
    }),
    'Prompt Action 완료 · 3.2초\nCodex 2.9초 · 기타 0.3초 · LOW\nCtrl+Z로 원문 복구'
  );
});

test('controller measures total and composer-apply latency when applying a successful result', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('rough prompt');
  const statuses = [];
  const timestamps = [1000, 3750, 3800, 3850];
  const controller = createController({
    document: documentRef,
    adapter,
    now: () => timestamps.shift() || 3850,
    sendOptimization: async () => ({
      ok: true,
      text: 'Build a precise prompt. Please answer in Korean.',
      meta: { effort: 'low', codexTotalMs: 2500 }
    }),
    showStatus: (message) => statuses.push(message)
  });

  controller.handleKeydown(keyEvent('Backquote'));
  await settle();

  assert.match(statuses[1], /Prompt Action 완료 · 2.8초/);
  assert.match(statuses[1], /Codex 2.5초 · 기타 0.3초 · LOW/);
});

test('success toast auto-hides after its configured duration', async () => {
  const toastElement = {
    isConnected: true,
    dataset: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); }
    },
    setAttribute() {},
    remove() { this.isConnected = false; }
  };
  const documentRef = {
    body: {
      appendChild() {}
    },
    createElement() { return toastElement; }
  };
  const toast = createToast(documentRef);

  toast.show('temporary', { duration: 15 });
  assert.equal(toastElement.classList.contains('prompt-action-toast-visible'), true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(toastElement.classList.contains('prompt-action-toast-visible'), false);
});

test('manual edits disarm Prompt Action undo and leave normal Ctrl+Z available', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('original');
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: async () => ({ ok: true, text: 'optimized' }),
    showStatus: () => {}
  });

  controller.handleKeydown(keyEvent('Backquote'));
  await settle();
  adapter.text = 'user edited optimized prompt';
  controller.handleInput({ target: adapter.composer });
  const undo = keyEvent('KeyZ');
  controller.handleKeydown(undo);

  assert.equal(undo.prevented, false);
  assert.equal(adapter.text, 'user edited optimized prompt');
  assert.equal(controller.getState().undoState, null);
});

test('failed optimization leaves the original prompt untouched and creates no undo state', async () => {
  const documentRef = new FakeDocument();
  const adapter = new FakeAdapter('keep this text');
  const statuses = [];
  const controller = createController({
    document: documentRef,
    adapter,
    sendOptimization: async () => ({ ok: false, error: { code: 'CODEX_TIMEOUT' } }),
    showStatus: (message) => statuses.push(message)
  });

  controller.handleKeydown(keyEvent('Backquote'));
  await settle();

  assert.equal(adapter.text, 'keep this text');
  assert.equal(controller.getState().undoState, null);
  assert.ok(statuses.some((message) => message.includes('시간이 초과')));
});
