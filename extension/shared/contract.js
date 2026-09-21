(function (root) {
  'use strict';

  const MAX_PROMPT_LENGTH = 20000;
  const MAX_OPTIMIZED_LENGTH = 30000;
  const HOST_NAME = 'com.promptaction.nativehost';
  const SUPPORTED_EFFORTS = Object.freeze(['low', 'medium']);

  const ERROR_CODES = Object.freeze([
    'INVALID_REQUEST',
    'UNKNOWN_ACTION',
    'INPUT_TOO_LARGE',
    'EMPTY_PROMPT',
    'NATIVE_HOST_NOT_FOUND',
    'NATIVE_HOST_UNAVAILABLE',
    'CODEX_NOT_FOUND',
    'CODEX_NOT_AUTHENTICATED',
    'CODEX_TIMEOUT',
    'CODEX_FAILED',
    'CODEX_EMPTY_RESPONSE',
    'PROMPT_INSTRUCTION_MISSING',
    'CONFIGURATION_ERROR',
    'INVALID_NATIVE_RESPONSE',
    'EXTENSION_MESSAGE_FAILED',
    'BUSY'
  ]);

  const knownErrorCodes = new Set(ERROR_CODES);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
  }

  function failure(code, message) {
    return {
      ok: false,
      error: {
        code,
        message: message || code
      }
    };
  }

  function validateOptimizeRequest(message) {
    if (!isRecord(message) || !hasOnlyKeys(message, ['action', 'text'])) {
      return failure('INVALID_REQUEST', 'The request must contain only action and text.');
    }
    if (message.action !== 'optimize_prompt') {
      return failure('UNKNOWN_ACTION', 'The action is not supported.');
    }
    if (typeof message.text !== 'string') {
      return failure('INVALID_REQUEST', 'text must be a string.');
    }
    if (message.text.length > MAX_PROMPT_LENGTH) {
      return failure('INPUT_TOO_LARGE', 'The prompt is too large.');
    }
    if (message.text.trim().length === 0) {
      return failure('EMPTY_PROMPT', 'The prompt is empty.');
    }
    return { ok: true, text: message.text };
  }

  function validatePingRequest(message) {
    if (!isRecord(message) || !hasOnlyKeys(message, ['action']) || message.action !== 'ping') {
      return failure('INVALID_REQUEST', 'The ping request is invalid.');
    }
    return { ok: true };
  }

  function validateNativeError(error) {
    return isRecord(error) &&
      typeof error.code === 'string' &&
      knownErrorCodes.has(error.code) &&
      typeof error.message === 'string' &&
      error.message.length <= 500;
  }

  function validateTimingMetadata(meta) {
    if (!isRecord(meta) || typeof meta.effort !== 'string' ||
        !SUPPORTED_EFFORTS.includes(meta.effort)) {
      return false;
    }

    const durationKeys = [
      'totalMs',
      'codexTotalMs',
      'hostTotalMs',
      'hostOverheadMs',
      'codexProcessStartMs',
      'nativeTotalMs',
      'applyMs'
    ];
    const allowedKeys = new Set(['effort', ...durationKeys]);
    if (Object.keys(meta).some((key) => !allowedKeys.has(key))) {
      return false;
    }

    return durationKeys.every((key) => meta[key] === undefined || (
      typeof meta[key] === 'number' &&
      Number.isFinite(meta[key]) &&
      meta[key] >= 0 &&
      meta[key] <= 600000
    ));
  }

  function validateOptimizeResponse(response) {
    if (!isRecord(response)) {
      return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
    }
    if (response.ok === true && typeof response.text === 'string' &&
        response.text.trim().length > 0 && response.text.length <= MAX_OPTIMIZED_LENGTH) {
      if (!hasOnlyKeys(response, ['ok', 'text', 'meta'])) {
        return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
      }
      if (response.meta !== undefined && !validateTimingMetadata(response.meta)) {
        return failure('INVALID_NATIVE_RESPONSE', 'The native host returned invalid timing metadata.');
      }
      return response.meta === undefined
        ? { ok: true, text: response.text }
        : { ok: true, text: response.text, meta: response.meta };
    }
    if (response.ok === false && hasOnlyKeys(response, ['ok', 'error']) &&
        validateNativeError(response.error)) {
      return { ok: false, error: response.error };
    }
    return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
  }

  function validatePingResponse(response) {
    if (!isRecord(response)) {
      return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
    }
    if (response.ok === true && response.host === 'Prompt Action' &&
        typeof response.codexAvailable === 'boolean' &&
        typeof response.codexAuthenticated === 'boolean' &&
        hasOnlyKeys(response, ['ok', 'host', 'codexAvailable', 'codexAuthenticated'])) {
      return {
        ok: true,
        host: response.host,
        codexAvailable: response.codexAvailable,
        codexAuthenticated: response.codexAuthenticated
      };
    }
    if (response.ok === false && hasOnlyKeys(response, ['ok', 'error']) &&
        validateNativeError(response.error)) {
      return { ok: false, error: response.error };
    }
    return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
  }

  function validateCodexLoginRequest(message) {
    if (!isRecord(message) || !hasOnlyKeys(message, ['action']) ||
        message.action !== 'codex_login') {
      return failure('INVALID_REQUEST', 'The Codex login request is invalid.');
    }
    return { ok: true };
  }

  function validateCodexLoginResponse(response) {
    if (!isRecord(response)) {
      return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
    }
    if (response.ok === true && response.loginStarted === true &&
        hasOnlyKeys(response, ['ok', 'loginStarted'])) {
      return { ok: true, loginStarted: true };
    }
    if (response.ok === false && hasOnlyKeys(response, ['ok', 'error']) &&
        validateNativeError(response.error)) {
      return { ok: false, error: response.error };
    }
    return failure('INVALID_NATIVE_RESPONSE', 'The native host returned an invalid response.');
  }

  function isSupportedChatGPTUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      return false;
    }
    try {
      const url = new URL(rawUrl);
      return url.protocol === 'https:' &&
        (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com');
    } catch (_error) {
      return false;
    }
  }

  const api = Object.freeze({
    ERROR_CODES,
    HOST_NAME,
    MAX_PROMPT_LENGTH,
    MAX_OPTIMIZED_LENGTH,
    SUPPORTED_EFFORTS,
    failure,
    isRecord,
    isSupportedChatGPTUrl,
    validateCodexLoginRequest,
    validateCodexLoginResponse,
    validateOptimizeRequest,
    validatePingRequest,
    validateOptimizeResponse,
    validatePingResponse,
    validateTimingMetadata
  });

  root.PromptActionContract = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
