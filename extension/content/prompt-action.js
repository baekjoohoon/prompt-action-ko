(function (root) {
  'use strict';

  const Contract = root.PromptActionContract || {
    MAX_PROMPT_LENGTH: 20000
  };
  const Adapter = root.PromptActionChatGPTAdapter && root.PromptActionChatGPTAdapter.ChatGPTComposerAdapter;

  const USER_MESSAGES = Object.freeze({
    COMPOSER_NOT_FOUND: 'ChatGPT 입력창을 찾을 수 없습니다.',
    NATIVE_HOST_NOT_FOUND: 'Native Messaging 호스트가 등록되지 않았습니다.',
    NATIVE_HOST_UNAVAILABLE: 'Prompt Action 네이티브 호스트에 연결할 수 없습니다.',
    CODEX_NOT_FOUND: 'Codex CLI를 찾을 수 없습니다.',
    CODEX_NOT_AUTHENTICATED: 'Codex 로그인이 필요합니다. 터미널에서 codex를 실행해 로그인해주세요.',
    CODEX_TIMEOUT: '프롬프트 최적화 시간이 초과되었습니다.',
    CODEX_FAILED: '프롬프트 최적화에 실패했습니다.',
    CODEX_EMPTY_RESPONSE: 'Codex가 빈 결과를 반환했습니다.',
    PROMPT_INSTRUCTION_MISSING: 'Prompt Action 설정 파일을 찾을 수 없습니다.',
    CONFIGURATION_ERROR: 'Prompt Action 설정을 확인해주세요.',
    INVALID_NATIVE_RESPONSE: '네이티브 호스트 응답이 올바르지 않습니다.',
    INPUT_TOO_LARGE: '프롬프트가 너무 깁니다.',
    EXTENSION_MESSAGE_FAILED: '확장 프로그램 통신에 실패했습니다.',
    BUSY: '이미 프롬프트 최적화가 실행 중입니다.',
    SOURCE_CHANGED: '작성 중인 원문이 변경되어 최적화 결과를 적용하지 않았습니다.'
  });

  function isOptimizationShortcut(event) {
    return Boolean(event) && event.ctrlKey === true && event.code === 'Backquote';
  }

  function isUndoShortcut(event) {
    return Boolean(event) && event.ctrlKey === true && event.code === 'KeyZ';
  }

  function messageForError(response) {
    const code = response && response.error && response.error.code;
    return USER_MESSAGES[code] || '프롬프트 최적화에 실패했습니다.';
  }

  function defaultNow() {
    return root.performance && typeof root.performance.now === 'function'
      ? root.performance.now()
      : Date.now();
  }

  function durationMs(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  }

  function formatSeconds(value) {
    return `${(durationMs(value) / 1000).toFixed(1)}초`;
  }

  function formatSuccessToast(meta) {
    const timing = meta || {};
    const totalMs = durationMs(timing.totalMs);
    const codexTotalMs = durationMs(timing.codexTotalMs);
    const otherMs = Math.max(0, totalMs - codexTotalMs);
    const effort = timing.effort === 'medium' ? 'MEDIUM' : 'LOW';
    const lines = [
      `Prompt Action 완료 · ${formatSeconds(totalMs)}`,
      `Codex ${formatSeconds(codexTotalMs)} · 기타 ${formatSeconds(otherMs)} · ${effort}`,
    ];
    lines.push('Ctrl+Z로 원문 복구');
    return lines.join('\n');
  }

  function createToast(documentRef) {
    let hideTimer = null;
    let element = null;

    function ensureElement() {
      if (!documentRef || !documentRef.body) {
        return null;
      }
      if (element && element.isConnected) {
        return element;
      }
      element = documentRef.createElement('div');
      element.id = 'prompt-action-toast';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      documentRef.body.appendChild(element);
      return element;
    }

    function show(message, options) {
      const toast = ensureElement();
      if (!toast) {
        return;
      }
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      const settings = options || {};
      toast.textContent = message;
      toast.dataset.kind = settings.kind || 'info';
      toast.classList.add('prompt-action-toast-visible');
      if (settings.duration !== 0) {
        hideTimer = setTimeout(() => {
          toast.classList.remove('prompt-action-toast-visible');
          hideTimer = null;
        }, settings.duration || 3500);
      }
    }

    function remove() {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
      }
      if (element && element.remove) {
        element.remove();
      }
      element = null;
      hideTimer = null;
    }

    return { show, remove };
  }

  function defaultSendOptimization(text) {
    if (!root.chrome || !root.chrome.runtime || typeof root.chrome.runtime.sendMessage !== 'function') {
      return Promise.resolve({
        ok: false,
        error: { code: 'EXTENSION_MESSAGE_FAILED', message: 'Runtime messaging is unavailable.' }
      });
    }
    return new Promise((resolve) => {
      try {
        root.chrome.runtime.sendMessage({ action: 'optimize_prompt', text }, (response) => {
          const lastError = root.chrome.runtime.lastError;
          if (lastError || !response) {
            resolve({
              ok: false,
              error: { code: 'EXTENSION_MESSAGE_FAILED', message: 'The extension message failed.' }
            });
            return;
          }
          resolve(response);
        });
      } catch (_error) {
        resolve({
          ok: false,
          error: { code: 'EXTENSION_MESSAGE_FAILED', message: 'The extension message failed.' }
        });
      }
    });
  }

  function createController(options) {
    const settings = options || {};
    const documentRef = settings.document || root.document;
    const adapter = settings.adapter || (Adapter ? new Adapter(documentRef) : null);
    const sendOptimization = settings.sendOptimization || defaultSendOptimization;
    const showStatus = settings.showStatus || createToast(documentRef).show;
    const now = typeof settings.now === 'function' ? settings.now : defaultNow;
    let busy = false;
    let undoState = null;
    let started = false;

    function clearUndo() {
      undoState = null;
    }

    function handleInput(event) {
      if (!undoState || event.target !== undoState.composer || !adapter) {
        return;
      }
      if (adapter.getText(undoState.composer) !== undoState.optimized) {
        clearUndo();
      }
    }

    function handleUndo(event) {
      if (!isUndoShortcut(event) || event.isComposing || !undoState || !adapter) {
        return false;
      }
      const currentComposer = adapter.findComposer();
      const currentText = currentComposer ? adapter.getText(currentComposer) : null;
      if (!currentComposer || currentText !== undoState.optimized) {
        clearUndo();
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      const restoreState = undoState;
      clearUndo();
      adapter.setText(restoreState.original, currentComposer);
      adapter.focus(currentComposer);
      showStatus('원문을 복구했습니다.', { kind: 'success', duration: 2200 });
      return true;
    }

    async function optimizeFromEvent(event) {
      const totalStartedAt = now();
      if (busy || !adapter) {
        return;
      }
      const composer = adapter.findComposer();
      if (!composer) {
        showStatus(USER_MESSAGES.COMPOSER_NOT_FOUND, { kind: 'error' });
        return;
      }
      const original = adapter.getText(composer);
      if (typeof original !== 'string' || original.trim().length === 0) {
        return;
      }
      if (original.length > (Contract.MAX_PROMPT_LENGTH || 20000)) {
        showStatus(USER_MESSAGES.INPUT_TOO_LARGE, { kind: 'error' });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      busy = true;
      clearUndo();
      showStatus('Prompt Action 실행 중...', { kind: 'working', duration: 0 });

      try {
        const response = await sendOptimization(original);
        if (!response || response.ok !== true || typeof response.text !== 'string' ||
            response.text.trim().length === 0) {
          showStatus(messageForError(response), { kind: 'error' });
          return;
        }

        const currentComposer = adapter.findComposer();
        const currentText = currentComposer ? adapter.getText(currentComposer) : null;
        if (currentComposer !== composer || currentText !== original) {
          showStatus(USER_MESSAGES.SOURCE_CHANGED, { kind: 'error' });
          return;
        }

        const applyStartedAt = now();
        if (!adapter.setText(response.text, composer)) {
          showStatus(USER_MESSAGES.COMPOSER_NOT_FOUND, { kind: 'error' });
          return;
        }
        adapter.focus(composer);
        const timing = {
          ...(response.meta || {}),
          totalMs: Math.max(0, Math.round(now() - totalStartedAt)),
          applyMs: Math.max(0, Math.round(now() - applyStartedAt))
        };
        undoState = {
          composer,
          original,
          optimized: response.text
        };
        showStatus(formatSuccessToast(timing), {
          kind: 'success',
          duration: 5000
        });
      } catch (_error) {
        showStatus(USER_MESSAGES.EXTENSION_MESSAGE_FAILED, { kind: 'error' });
      } finally {
        busy = false;
      }
    }

    function handleKeydown(event) {
      if (handleUndo(event)) {
        return;
      }
      if (!isOptimizationShortcut(event) || event.isComposing) {
        return;
      }
      if (busy) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      optimizeFromEvent(event);
    }

    function start() {
      if (started || !documentRef || typeof documentRef.addEventListener !== 'function') {
        return;
      }
      documentRef.addEventListener('keydown', handleKeydown, true);
      documentRef.addEventListener('input', handleInput, true);
      started = true;
    }

    function stop() {
      if (!started || !documentRef || typeof documentRef.removeEventListener !== 'function') {
        return;
      }
      documentRef.removeEventListener('keydown', handleKeydown, true);
      documentRef.removeEventListener('input', handleInput, true);
      started = false;
      clearUndo();
    }

    return {
      start,
      stop,
      handleKeydown,
      handleInput,
      getState: () => ({ busy, undoState })
    };
  }

  const api = Object.freeze({
    USER_MESSAGES,
    createController,
    createToast,
    formatSuccessToast,
    isOptimizationShortcut,
    isUndoShortcut,
    messageForError
  });
  root.PromptAction = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root.document && Adapter) {
    const controller = createController();
    controller.start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
