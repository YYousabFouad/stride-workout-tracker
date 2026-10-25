import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createDialog } from "../js/ui/dialog.js";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalHTMLElement = Object.getOwnPropertyDescriptor(
  globalThis,
  "HTMLElement"
);

class FakeClassList {
  constructor() {
    this.names = new Set();
  }
  add(...names) {
    names.forEach((name) => this.names.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }
  contains(name) {
    return this.names.has(name);
  }
  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
}

/** Minimal element surface used by `createDialog`. */
class FakeElement {
  constructor(children = []) {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.children = children;
    this.isConnected = true;
    this.listeners = new Map();
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  querySelectorAll() {
    return this.children;
  }
  querySelector() {
    return this.children[0] ?? null;
  }
  getClientRects() {
    return [{}];
  }
  contains(element) {
    return this.children.includes(element);
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  blur() {
    globalThis.document.activeElement = null;
  }
}

const documentStub = {
  activeElement: null,
  listeners: new Map(),
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  },
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  },
};

const keyEvent = (key, extra = {}) => {
  let defaultPrevented = false;
  return {
    key,
    preventDefault: () => {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
    ...extra,
  };
};

beforeEach(() => {
  documentStub.activeElement = null;
  documentStub.listeners.clear();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement,
  });
});

afterEach(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    delete globalThis.document;
  }
  if (originalHTMLElement) {
    Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
  } else {
    delete globalThis.HTMLElement;
  }
});

test("focuses the requested control, traps Tab, and restores focus on close", () => {
  const opener = new FakeElement();
  const first = new FakeElement();
  const last = new FakeElement();
  const modal = new FakeElement([first, last]);
  const dialog = createDialog(modal, { initialFocus: () => last });

  documentStub.activeElement = opener;
  dialog.open();

  assert.equal(documentStub.activeElement, last);
  assert.equal(modal.getAttribute("aria-hidden"), "false");

  // Tab from the last control wraps around to the first.
  modal.dispatch("keydown", keyEvent("Tab"));
  assert.equal(documentStub.activeElement, first);

  // Shift+Tab from the first control wraps around to the last.
  modal.dispatch("keydown", keyEvent("Tab", { shiftKey: true }));
  assert.equal(documentStub.activeElement, last);

  dialog.close();
  assert.equal(documentStub.activeElement, opener);
  assert.equal(modal.getAttribute("aria-hidden"), "true");
  assert.equal(modal.classList.contains("active"), false);
});

test("Escape closes an open dialog once and notifies the caller", () => {
  const modal = new FakeElement([new FakeElement()]);
  let escapes = 0;
  const dialog = createDialog(modal, { onEscape: () => escapes++ });

  documentStub.dispatch("keydown", keyEvent("Escape"));
  assert.equal(escapes, 0, "a closed dialog ignores Escape");

  dialog.open();
  const event = keyEvent("Escape");
  documentStub.dispatch("keydown", event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(escapes, 1);
  assert.equal(modal.classList.contains("active"), false);

  documentStub.dispatch("keydown", keyEvent("Escape"));
  assert.equal(escapes, 1, "the now-closed dialog does not fire again");
});

test("re-opening a visible dialog restores focus to the original opener", () => {
  const opener = new FakeElement();
  const first = new FakeElement();
  const modal = new FakeElement([first]);
  const dialog = createDialog(modal);

  documentStub.activeElement = opener;
  dialog.open();
  assert.equal(documentStub.activeElement, first);

  dialog.open();
  dialog.close();
  assert.equal(documentStub.activeElement, opener);
});
