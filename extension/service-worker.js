if (typeof importScripts === 'function') {
  importScripts('shared/contract.js', 'shared/complexity.js');
}

(function (root) {
  'use strict';

  const DEFAULT_NATIVE_TIMEOUT_MS = 130000;
  const MAX_REQUEST_ID_LENGTH = 100;

  function defaultNow() {
    return root.performance && typeof root.performance.now === 'function'
      ? root.performance.now()
      : Date.now();
  }

  function elapsedMilliseconds(startedAt, now) {
    return Math.max(0, Math.round(now() - startedAt));
  }

  function disconnectQuietly(port) {
    if (!port || typeof port.disconnect !== 'function') {
      return;
    }
    try {
      port.disconnect();
    } catch (_error) {
      // The port may already be disconnected.
    }
  }

  function nativeDisconnectFailure(chromeRef, contract) {
    const lastError = chromeRef.runtime && chromeRef.runtime.lastError;
    const diagnostic = lastError && typeof lastError.message === 'string'
      ? lastError.message.toLowerCase()
      : '';
    if (diagnostic.includes('not found') || diagnostic.includes('could not establish')) {
      return contract.failure('NATIVE_HOST_NOT_FOUND', 'The native host is not registered.');
    }
    return contract.failure('NATIVE_HOST_UNAVAILABLE', 'The native host is unavailable.');
  }

  function createRequestId(now, sequence) {
    return `pa-${Math.floor(now()).toString(36)}-${sequence.toString(36)}`
      .slice(0, MAX_REQUEST_ID_LENGTH);
  }

  function createNativeClient(chromeRef, contract, options) {
    const settings = options || {};
    const timeoutMs = settings.timeoutMs || DEFAULT_NATIVE_TIMEOUT_MS;
    const now = typeof settings.now === 'function' ? settings.now : defaultNow;
    let nativePort = null;
    let sequence = 0;
    const pending = new Map();

    function settle(entry, response) {
      if (entry.settled) {
        return;
      }
      entry.settled = true;
      pending.delete(entry.requestId);
      if (entry.timeoutId !== null) {
        clearTimeout(entry.timeoutId);
      }
      entry.resolve(response);
    }

    function handleDisconnect(port) {
      if (nativePort !== port) {
        return;
      }
      nativePort = null;
      const failure = nativeDisconnectFailure(chromeRef, contract);
      for (const entry of [...pending.values()]) {
        settle(entry, failure);
      }
    }

    function handleMessage(response) {
      if (!contract.isRecord(response) || typeof response.requestId !== 'string') {
        return;
      }
      const entry = pending.get(response.requestId);
      if (!entry) {
        return;
      }

      const { requestId: _requestId, ...responseWithoutRequestId } = response;
      let validated;
      try {
        validated = entry.validateResponse(responseWithoutRequestId);
      } catch (_error) {
        validated = contract.failure(
          'INVALID_NATIVE_RESPONSE',
          'The native host returned an invalid response.'
        );
      }

      if (validated.ok && entry.request.action === 'optimize_prompt') {
        validated = {
          ...validated,
          meta: {
            ...(validated.meta || {}),
            nativeTotalMs: elapsedMilliseconds(entry.startedAt, now)
          }
        };
      }
      settle(entry, validated);
    }

    function connectPort() {
      if (nativePort) {
        return nativePort;
      }

      const port = chromeRef.runtime.connectNative(contract.HOST_NAME);
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(() => handleDisconnect(port));
      nativePort = port;
      return port;
    }

    function invalidatePort(port) {
      if (nativePort === port) {
        nativePort = null;
      }
      disconnectQuietly(port);
    }

    function callNative(request, validateResponse) {
      return new Promise((resolve) => {
        const requestId = createRequestId(now, sequence++);
        const entry = {
          request,
          requestId,
          validateResponse,
          resolve,
          startedAt: now(),
          timeoutId: null,
          settled: false
        };
        pending.set(requestId, entry);
        entry.timeoutId = setTimeout(() => {
          settle(entry, contract.failure(
            request.action === 'optimize_prompt' ? 'CODEX_TIMEOUT' : 'NATIVE_HOST_UNAVAILABLE',
            'The native host request timed out.'
          ));
        }, timeoutMs);

        let port;
        try {
          port = connectPort();
          port.postMessage({ ...request, requestId });
        } catch (_error) {
          settle(entry, contract.failure(
            'NATIVE_HOST_UNAVAILABLE',
            'The native host rejected the request.'
          ));
          invalidatePort(port || nativePort);
        }
      });
    }

    return Object.freeze({
      callNative,
      hasPort: () => nativePort !== null,
      pendingCount: () => pending.size
    });
  }

  function createServiceWorkerApi(chromeRef, contract, complexity, options) {
    const nativeClient = createNativeClient(chromeRef, contract, options);
    let optimizationInProgress = false;

    async function optimizePrompt(text) {
      if (optimizationInProgress) {
        return contract.failure('BUSY', 'Another optimization is already running.');
      }
      optimizationInProgress = true;
      try {
        const effort = complexity.classifyPromptComplexity(text);
        return await nativeClient.callNative(
          { action: 'optimize_prompt', text, effort },
          contract.validateOptimizeResponse
        );
      } finally {
        optimizationInProgress = false;
      }
    }

    function checkNativeHost() {
      return nativeClient.callNative({ action: 'ping' }, contract.validatePingResponse);
    }

    return Object.freeze({
      checkNativeHost,
      hasNativePort: nativeClient.hasPort,
      optimizePrompt,
      pendingNativeRequests: nativeClient.pendingCount
    });
  }

  function installServiceWorker(chromeRef, contract, complexity, options) {
    const api = createServiceWorkerApi(chromeRef, contract, complexity, options);

    function isExtensionSender(sender) {
      return Boolean(sender) && sender.id === chromeRef.runtime.id;
    }

    function isChatGPTSender(sender) {
      return isExtensionSender(sender) &&
        Boolean(sender.tab) &&
        contract.isSupportedChatGPTUrl(sender.tab.url);
    }

    function isPopupSender(sender) {
      return isExtensionSender(sender) &&
        typeof sender.url === 'string' &&
        sender.url === chromeRef.runtime.getURL('popup/popup.html');
    }

    chromeRef.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!contract.isRecord(message) || typeof message.action !== 'string') {
        sendResponse(contract.failure('INVALID_REQUEST', 'The request is invalid.'));
        return false;
      }

      if (message.action === 'optimize_prompt') {
        if (!isChatGPTSender(sender)) {
          sendResponse(contract.failure('INVALID_REQUEST', 'Optimization is allowed only from ChatGPT.'));
          return false;
        }
        const request = contract.validateOptimizeRequest(message);
        if (!request.ok) {
          sendResponse(request);
          return false;
        }
        api.optimizePrompt(request.text).then(sendResponse).catch(() => {
          sendResponse(contract.failure('NATIVE_HOST_UNAVAILABLE', 'The native host is unavailable.'));
        });
        return true;
      }

      if (message.action === 'ping') {
        if (!isPopupSender(sender)) {
          sendResponse(contract.failure('INVALID_REQUEST', 'Status checks are allowed only from the popup.'));
          return false;
        }
        const request = contract.validatePingRequest(message);
        if (!request.ok) {
          sendResponse(request);
          return false;
        }
        api.checkNativeHost().then(sendResponse).catch(() => {
          sendResponse(contract.failure('NATIVE_HOST_UNAVAILABLE', 'The native host is unavailable.'));
        });
        return true;
      }

      sendResponse(contract.failure('UNKNOWN_ACTION', 'The action is not supported.'));
      return false;
    });

    return api;
  }

  const api = Object.freeze({
    createNativeClient,
    createServiceWorkerApi,
    installServiceWorker
  });
  root.PromptActionServiceWorker = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  const contract = root.PromptActionContract;
  const complexity = root.PromptActionComplexity;
  if (root.chrome && root.chrome.runtime && contract && complexity) {
    installServiceWorker(root.chrome, contract, complexity);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
