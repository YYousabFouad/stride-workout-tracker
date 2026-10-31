import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { acceptGpsStep } from "../js/core/route-math.js";

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

// `route-math.js` imports `storage.js`, whose helpers guard on `localStorage`.
beforeEach(() => {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  });
});

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
});

/**
 * Accumulate a synthetic straight-line walk at ~3 m per fix — the regression
 * scenario that previously measured 2.21× the true distance because each step
 * was measured from the smoothed display point.
 * @param {number} fixes @param {number} stepMeters @returns {number} total km
 */
const walk = (fixes, stepMeters) => {
  const stepDeg = stepMeters / 111320;
  let prevRaw = null;
  let prevDisplay = null;
  let totalKm = 0;
  for (let i = 0; i < fixes; i++) {
    const coords = [40 + i * stepDeg, -74];
    const step = acceptGpsStep(prevRaw, prevDisplay, coords);
    if (step) {
      totalKm += step.stepKm;
      prevRaw = coords;
      prevDisplay = step.displayPoint;
    }
  }
  return totalKm;
};

test("raw-to-raw measurement stays within a few deadbands of the true path", () => {
  const trueKm = (400 * 3) / 1000;
  const totalKm = walk(400, 3);
  // 2.21× inflation would measure ~2.65 km.
  assert.ok(
    totalKm >= trueKm - 0.02 && totalKm <= trueKm + 0.02,
    `expected ~${trueKm} km, got ${totalKm}`,
  );
});

test("anchor fix produces a zero step and identical display point", () => {
  const step = acceptGpsStep(null, null, [40.7128, -74.006]);
  assert.ok(step);
  assert.equal(step.stepKm, 0);
  assert.deepEqual(step.displayPoint, [40.7128, -74.006]);
});

test("steps inside the deadband are rejected without advancing the anchor", () => {
  // 1 m of jitter below the 7 m deadband must be ignored.
  const step = acceptGpsStep([10, 0], [10, 0], [10 + 1 / 111320, 0]);
  assert.equal(step, null);
});

test("malformed coordinates are rejected", () => {
  assert.equal(acceptGpsStep(null, null, [NaN, 0]), null);
  assert.equal(acceptGpsStep(null, null, [40]), null);
});

test("display point is smoothed towards the fix but never reverses direction", () => {
  // A 100 m step smoothed with weight 0.45 lands between the raw points.
  const step = acceptGpsStep([10, 0], [10, 0], [10 + 100 / 111320, 0]);
  assert.ok(step);
  assert.ok(
    step.displayPoint[0] > 10 && step.displayPoint[0] < 10 + 100 / 111320,
    `display ${step.displayPoint[0]} not between raw points`,
  );
});
