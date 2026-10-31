import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

afterEach(() => {
  const descriptors = /** @type {[string, PropertyDescriptor|undefined][]} */ ([
    ["document", originalDocument],
    ["localStorage", originalLocalStorage],
  ]);
  for (const [key, descriptor] of descriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  }
});

test("does not report profile creation when browser storage rejects the write", async () => {
  let submitHandler;
  const dispatchedEvents = [];
  const storageError = {
    classList: {
      add() {},
      remove() {},
    },
    textContent: "",
  };
  const usernameInput = { value: "Runner" };
  const emailInput = { value: "runner@example.test" };
  const form = {
    addEventListener: (type, handler) => {
      if (type === "submit") submitHandler = handler;
    },
  };
  const modal = {
    addEventListener() {},
    classList: { contains: () => false, add() {}, remove() {} },
    contains: () => false,
    querySelector: (selector) => {
      if (selector === "#account-storage-error") return storageError;
      if (selector === ".modal-title") return { textContent: "" };
      if (selector === ".modal-subtitle") return { textContent: "" };
      return null;
    },
    querySelectorAll: () => [],
    setAttribute() {},
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener() {},
      dispatchEvent: (event) => dispatchedEvents.push(event.type),
      getElementById: (id) => {
        if (id === "modal-account") return modal;
        if (id === "input-username") return usernameInput;
        if (id === "input-email") return emailInput;
        if (id === "form-create-account") return form;
        return null;
      },
    },
  });

  const { initAccountModal } = await import(
    `../js/ui/modal.js?test=${Date.now()}-${Math.random()}`
  );
  initAccountModal();
  submitHandler({ preventDefault() {} });

  assert.match(storageError.textContent, /couldn't save your profile/i);
  assert.deepEqual(dispatchedEvents, []);
});
