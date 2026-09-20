(function (root) {
  'use strict';

  const COMPOSER_SELECTORS = Object.freeze([
    'textarea[data-testid="prompt-textarea"]',
    '[contenteditable="true"][data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="메시지"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
    'textarea'
  ]);

  function isVisible(element, documentRef) {
    if (!element || element.disabled || element.readOnly) {
      return false;
    }
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false;
    }
    const windowRef = documentRef && documentRef.defaultView;
    if (windowRef && typeof windowRef.getComputedStyle === 'function') {
      const style = windowRef.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    return true;
  }

  function isContentEditable(element) {
    return Boolean(element) && (
      element.isContentEditable === true ||
      element.getAttribute && element.getAttribute('contenteditable') === 'true'
    );
  }

  class ChatGPTComposerAdapter {
    constructor(documentRef) {
      this.document = documentRef || root.document;
    }

    findComposer() {
      if (!this.document || typeof this.document.querySelectorAll !== 'function') {
        return null;
      }
      for (const selector of COMPOSER_SELECTORS) {
        const candidates = this.document.querySelectorAll(selector);
        for (const candidate of candidates) {
          if (isVisible(candidate, this.document)) {
            return candidate;
          }
        }
      }
      return null;
    }

    getText(composer) {
      const element = composer || this.findComposer();
      if (!element) {
        return null;
      }
      if (isContentEditable(element)) {
        return typeof element.innerText === 'string' ? element.innerText : (element.textContent || '');
      }
      return typeof element.value === 'string' ? element.value : null;
    }

    setText(text, composer) {
      const element = composer || this.findComposer();
      if (!element || typeof text !== 'string') {
        return false;
      }

      if (isContentEditable(element)) {
        element.textContent = text;
      } else {
        const prototype = Object.getPrototypeOf(element);
        const valueSetter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(element, text);
        } else {
          element.value = text;
        }
      }

      const documentRef = element.ownerDocument || this.document;
      const windowRef = documentRef && documentRef.defaultView;
      const InputEventCtor = windowRef && windowRef.InputEvent;
      const EventCtor = windowRef && windowRef.Event;
      const inputEvent = InputEventCtor
        ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: text })
        : (EventCtor ? new EventCtor('input', { bubbles: true }) : null);
      const changeEvent = EventCtor ? new EventCtor('change', { bubbles: true }) : null;
      if (inputEvent && typeof element.dispatchEvent === 'function') {
        element.dispatchEvent(inputEvent);
      }
      if (changeEvent && typeof element.dispatchEvent === 'function') {
        element.dispatchEvent(changeEvent);
      }
      this.focus(element);
      return true;
    }

    focus(composer) {
      const element = composer || this.findComposer();
      if (element && typeof element.focus === 'function') {
        element.focus({ preventScroll: true });
        return true;
      }
      return false;
    }
  }

  const api = Object.freeze({ ChatGPTComposerAdapter, COMPOSER_SELECTORS });
  root.PromptActionChatGPTAdapter = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
