(function () {
  'use strict';

  const Contract = globalThis.PromptActionContract;
  const extensionId = document.getElementById('extension-id');
  const nativeStatus = document.getElementById('native-status');
  const codexStatus = document.getElementById('codex-status');
  const setupHint = document.getElementById('setup-hint');

  extensionId.textContent = chrome.runtime.id || '확인할 수 없음';

  function setStatus(element, text, className) {
    element.textContent = text;
    element.className = className || '';
  }

  function showSetupHint(code) {
    if (code === 'NATIVE_HOST_NOT_FOUND') {
      setupHint.textContent = '설치 후 scripts\\install-native-host.ps1 -ExtensionId <ID> -Browser Chrome 또는 Edge를 실행하세요.';
    } else if (code === 'CODEX_NOT_FOUND') {
      setupHint.textContent = 'Codex CLI를 설치하고 터미널에서 codex가 실행되는지 확인하세요.';
    } else if (code === 'CODEX_NOT_AUTHENTICATED') {
      setupHint.textContent = '터미널에서 codex를 실행해 기존 ChatGPT/Codex 계정으로 로그인하세요.';
    } else {
      setupHint.textContent = '';
    }
  }

  try {
    chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError || !response) {
        setStatus(nativeStatus, '확인 실패', 'error');
        setStatus(codexStatus, '확인 실패', 'error');
        setupHint.textContent = '확장 프로그램 서비스 워커와 통신할 수 없습니다.';
        return;
      }

      const validated = Contract.validatePingResponse(response);
      if (!validated.ok) {
        const code = validated.error && validated.error.code;
        setStatus(nativeStatus, '연결 실패', 'error');
        setStatus(codexStatus, '확인 불가', 'error');
        showSetupHint(code);
        return;
      }

      setStatus(nativeStatus, '연결됨', 'ok');
      if (validated.codexAvailable) {
        setStatus(codexStatus, '사용 가능', 'ok');
      } else {
        setStatus(codexStatus, '찾을 수 없음', 'error');
        showSetupHint('CODEX_NOT_FOUND');
      }
    });
  } catch (_error) {
    setStatus(nativeStatus, '확인 실패', 'error');
    setStatus(codexStatus, '확인 실패', 'error');
    setupHint.textContent = '확장 프로그램 상태를 확인하지 못했습니다.';
  }
})();
