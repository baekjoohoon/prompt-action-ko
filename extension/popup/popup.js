(function (root) {
  'use strict';

  const INSTALL_URL = 'https://developers.openai.com/codex/cli';

  function createStatusView(validated) {
    if (!validated || validated.ok !== true) {
      const code = validated && validated.error && validated.error.code;
      return {
        state: code === 'NATIVE_HOST_NOT_FOUND' ? 'native-missing' : 'error',
        native: code === 'NATIVE_HOST_NOT_FOUND' ? '❌ 연결 필요' : '❌ 확인 실패',
        codex: '— 확인 불가',
        auth: '— 확인 불가',
        overall: '',
        hint: code === 'NATIVE_HOST_NOT_FOUND'
          ? 'Native Host가 연결되지 않았습니다. README의 설치 안내를 완료한 뒤 다시 확인하세요.'
          : '확장 프로그램과 Native Host의 상태를 확인하지 못했습니다.',
        showInstall: false,
        showLogin: false
      };
    }

    if (!validated.codexAvailable) {
      return {
        state: 'codex-missing',
        native: '✅ 연결됨',
        codex: '❌ 설치 필요',
        auth: '— 확인 불가',
        overall: '',
        hint: 'Codex CLI를 설치한 뒤 이 팝업을 다시 열어 상태를 확인하세요.',
        showInstall: true,
        showLogin: false
      };
    }

    if (!validated.codexAuthenticated) {
      return {
        state: 'login-needed',
        native: '✅ 연결됨',
        codex: '✅ 설치됨',
        auth: '❌ 로그인 필요',
        overall: '',
        hint: '공식 Codex 로그인 창에서 인증을 완료하세요.',
        showInstall: false,
        showLogin: true
      };
    }

    return {
      state: 'ready',
      native: '✅ 연결됨',
      codex: '✅ 설치됨',
      auth: '✅ 로그인됨',
      overall: '모든 준비가 완료되었습니다.\nChatGPT에서 Ctrl + ` 를 눌러 사용하세요.',
      hint: '',
      showInstall: false,
      showLogin: false
    };
  }

  function setStatus(element, text, className) {
    element.textContent = text;
    element.className = className || '';
  }

  function renderStatus(elements, view) {
    setStatus(elements.nativeStatus, view.native, view.state === 'error' || view.state === 'native-missing' ? 'error' : 'ok');
    setStatus(elements.codexStatus, view.codex, view.state === 'codex-missing' ? 'error' : view.state === 'error' || view.state === 'native-missing' ? 'muted' : 'ok');
    setStatus(elements.authStatus, view.auth, view.state === 'login-needed' ? 'error' : view.state === 'ready' ? 'ok' : 'muted');
    elements.overallStatus.hidden = !view.overall;
    elements.overallStatus.textContent = view.overall;
    elements.setupHint.textContent = view.hint;
    elements.installLink.hidden = !view.showInstall;
    elements.loginButton.hidden = !view.showLogin;
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = 'Codex 로그인';
  }

  function initialize(documentRef, chromeRef) {
    const Contract = root.PromptActionContract;
    const elements = {
      extensionId: documentRef.getElementById('extension-id'),
      nativeStatus: documentRef.getElementById('native-status'),
      codexStatus: documentRef.getElementById('codex-status'),
      authStatus: documentRef.getElementById('codex-auth-status'),
      overallStatus: documentRef.getElementById('overall-status'),
      setupHint: documentRef.getElementById('setup-hint'),
      installLink: documentRef.getElementById('codex-install-link'),
      loginButton: documentRef.getElementById('codex-login-button'),
      refreshButton: documentRef.getElementById('refresh-status-button')
    };

    elements.extensionId.textContent = chromeRef.runtime.id || '확인할 수 없음';
    elements.installLink.href = INSTALL_URL;

    function showError(message) {
      renderStatus(elements, createStatusView({
        ok: false,
        error: { code: 'NATIVE_HOST_UNAVAILABLE', message }
      }));
    }

    function checkStatus() {
      elements.refreshButton.disabled = true;
      try {
        chromeRef.runtime.sendMessage({ action: 'ping' }, (response) => {
          const lastError = chromeRef.runtime.lastError;
          elements.refreshButton.disabled = false;
          if (lastError || !response || !Contract) {
            showError('확장 프로그램 서비스 워커와 통신할 수 없습니다.');
            return;
          }
          renderStatus(elements, createStatusView(Contract.validatePingResponse(response)));
        });
      } catch (_error) {
        elements.refreshButton.disabled = false;
        showError('확장 프로그램 상태를 확인하지 못했습니다.');
      }
    }

    function startLogin() {
      elements.loginButton.disabled = true;
      elements.loginButton.textContent = '로그인 시작 중...';
      try {
        chromeRef.runtime.sendMessage({ action: 'codex_login' }, (response) => {
          const lastError = chromeRef.runtime.lastError;
          if (lastError || !response || !Contract) {
            elements.loginButton.disabled = false;
            elements.loginButton.textContent = 'Codex 로그인';
            showError('Codex 로그인 흐름을 시작하지 못했습니다.');
            return;
          }

          const validated = Contract.validateCodexLoginResponse(response);
          if (!validated.ok) {
            elements.loginButton.disabled = false;
            elements.loginButton.textContent = 'Codex 로그인';
            if (validated.error && validated.error.code === 'CODEX_NOT_FOUND') {
              renderStatus(elements, createStatusView({
                ok: true,
                codexAvailable: false,
                codexAuthenticated: false
              }));
            } else {
              elements.setupHint.textContent = 'Codex 로그인 흐름을 시작하지 못했습니다. 다시 시도하세요.';
            }
            return;
          }

          elements.loginButton.textContent = '로그인 진행 중...';
          elements.setupHint.textContent = '브라우저에서 Codex 로그인을 완료하세요. 완료 후 상태를 새로고침하세요.';
          root.setTimeout(checkStatus, 2500);
        });
      } catch (_error) {
        elements.loginButton.disabled = false;
        elements.loginButton.textContent = 'Codex 로그인';
        showError('Codex 로그인 흐름을 시작하지 못했습니다.');
      }
    }

    elements.loginButton.addEventListener('click', startLogin);
    elements.refreshButton.addEventListener('click', checkStatus);
    checkStatus();
  }

  const api = Object.freeze({
    INSTALL_URL,
    createStatusView,
    renderStatus
  });
  root.PromptActionPopup = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root.document && root.chrome && root.chrome.runtime) {
    initialize(root.document, root.chrome);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
