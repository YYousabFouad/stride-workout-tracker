import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

afterEach(() => {
  const descriptors = /** @type {[string, PropertyDescriptor|undefined][]} */ ([
    ["document", originalDocument],
    ["window", originalWindow],
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

const setupPlan = async (confirmDiscard) => {
  const persisted = new Map([
    [
      "stride_user",
      JSON.stringify({
        username: "Runner",
        email: "runner@example.com",
        createdAt: 1000,
        updatedAt: 1000,
      }),
    ],
    [
      "stride_active_workout",
      JSON.stringify({
        id: "workout_old",
        sport: "run",
        goal: "distance",
        targetValue: 5,
        startTime: 1000,
        status: "in_progress",
        routeCoords: [[30, 31]],
      }),
    ],
    ["stride_last_location", JSON.stringify([30, 31])],
  ]);
  const targetInput = { value: "5.0" };
  const sportButton = { dataset: { value: "run" } };
  const goalButton = { dataset: { group: "goal", value: "distance" } };
  const handlers = new Map();
  const form = {
    addEventListener: (type, handler) => handlers.set(type, handler),
    querySelector: (selector) =>
      selector.includes('data-group="sport"') ? sportButton : goalButton,
  };
  const location = { href: "" };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => persisted.set(key, String(value)),
      removeItem: (key) => persisted.delete(key),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { confirm: confirmDiscard, location },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: () => form,
      getElementById: (id) =>
        id === "target-input"
          ? targetInput
          : id === "target-unit-label"
            ? { textContent: "" }
            : null,
      addEventListener: () => {},
    },
  });

  const { initPlanWorkoutScreen } = await import(
    `../js/screens/plan.js?test=${Date.now()}-${Math.random()}`
  );
  initPlanWorkoutScreen();
  handlers.get("submit")({ preventDefault() {} });

  return { location, persisted };
};

test("discarding a workout clears its persisted GPS fix before starting another", async () => {
  const { location, persisted } = await setupPlan(() => true);

  assert.equal(location.href, "progress.html");
  assert.equal(persisted.has("stride_last_location"), false);
  assert.notEqual(
    JSON.parse(persisted.get("stride_active_workout")).id,
    "workout_old",
  );
});

test("canceling workout replacement preserves the active route and GPS fix", async () => {
  const { location, persisted } = await setupPlan(() => false);

  assert.equal(location.href, "");
  assert.equal(
    JSON.parse(persisted.get("stride_active_workout")).id,
    "workout_old",
  );
  assert.deepEqual(JSON.parse(persisted.get("stride_last_location")), [30, 31]);
});
