import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
});

const loadStorageModule = async () =>
  import(`../js/core/storage.js?test=${Date.now()}-${Math.random()}`);

test("reads the in-memory value after a failed write leaves stale persisted data", async () => {
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify({ status: "in_progress", startTime: 1000 })],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: () => {
        throw new Error("Storage quota exceeded");
      },
    },
  });

  const { getStorageItem, setStorageItem } = await loadStorageModule();
  const updatedWorkout = { status: "complete", startTime: 1000 };

  setStorageItem("stride_active_workout", updatedWorkout);

  assert.equal(getStorageItem("stride_active_workout").status, updatedWorkout.status);
});

test("uses persisted data again after a later write succeeds", async () => {
  let writesAllowed = false;
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify({ status: "in_progress", startTime: 1000 })],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        if (!writesAllowed) throw new Error("Storage quota exceeded");
        persisted.set(key, value);
      },
    },
  });

  const { getStorageItem, setStorageItem } = await loadStorageModule();
  setStorageItem("stride_active_workout", { status: "in_progress", startTime: 1000 });
  writesAllowed = true;
  setStorageItem("stride_active_workout", { status: "complete", startTime: 1000 });

  assert.deepEqual(getStorageItem("stride_active_workout"), {
    status: "complete",
    startTime: 1000,
    sport: "run",
    sportLabel: "Running",
    goal: "distance",
    targetValue: 5,
    targetUnit: "km",
    saved: false,
    routeCoords: [],
    gpsDistanceKm: 0,
  });
});

test("rejects malformed workout records and sanitizes route coordinates", async () => {
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify({ status: "in_progress" })],
    [
      "stride_completed_workout",
      JSON.stringify({ status: "in_progress", startTime: 1000 }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();

  assert.equal(getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT), null);
  assert.equal(getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT), null);
});

test("returns valid workout data with bounded, valid GPS coordinates", async () => {
  const workout = {
    status: "in_progress",
    startTime: 1000,
    sport: "ride",
    goal: "distance",
    targetValue: 10,
    routeCoords: [[30, 31], [91, 31], [30, 181], ["30", 31], [30.5, 31.5]],
  };
  const persisted = new Map([["stride_active_workout", JSON.stringify(workout)]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();
  const validatedWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  assert.equal(validatedWorkout.sport, "ride");
  assert.equal(validatedWorkout.sportLabel, "Riding");
  assert.deepEqual(validatedWorkout.routeCoords, [[30, 31], [30.5, 31.5]]);
});

test("rejects malformed last-known GPS coordinates", async () => {
  const persisted = new Map([["stride_last_location", JSON.stringify([91, 31])]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();

  assert.equal(getStorageItem(STORAGE_KEYS.LAST_LOCATION), null);
});
