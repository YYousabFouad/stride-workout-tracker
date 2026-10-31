import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Runner3D } from "../js/visualizers/runner-3d.js";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

const documentStub = {
  hidden: false,
  listeners: new Map(),
  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  },
};

afterEach(() => {
  documentStub.listeners.clear();
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    delete globalThis.document;
  }
});

test("page visibility does not restart a hidden or manually paused renderer", () => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });

  const runner = Object.create(Runner3D.prototype);
  runner.isIntersecting = false;
  runner.manuallyPaused = false;
  let starts = 0;
  runner.start = () => {
    starts++;
  };
  runner.pause = () => {};

  runner.setupPageVisibility();
  documentStub.listeners.get("visibilitychange")();
  assert.equal(starts, 0, "off-screen panel should remain paused");

  runner.isIntersecting = true;
  documentStub.listeners.get("visibilitychange")();
  assert.equal(starts, 1, "visible panel should resume");

  runner.manuallyPaused = true;
  documentStub.listeners.get("visibilitychange")();
  assert.equal(starts, 1, "manual pause should remain respected");
});
