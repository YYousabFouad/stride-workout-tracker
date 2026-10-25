import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

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
    [
      "stride_active_workout",
      JSON.stringify({ status: "in_progress", startTime: 1000 }),
    ],
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

  assert.equal(
    getStorageItem("stride_active_workout").status,
    updatedWorkout.status,
  );
});

test("uses persisted data again after a later write succeeds", async () => {
  let writesAllowed = false;
  const persisted = new Map([
    [
      "stride_active_workout",
      JSON.stringify({ status: "in_progress", startTime: 1000 }),
    ],
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
  setStorageItem("stride_active_workout", {
    status: "in_progress",
    startTime: 1000,
  });
  writesAllowed = true;
  setStorageItem("stride_active_workout", {
    status: "complete",
    startTime: 1000,
  });

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
    routeCoords: [
      [30, 31],
      [91, 31],
      [30, 181],
      ["30", 31],
      [30.5, 31.5],
    ],
  };
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify(workout)],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();
  const validatedWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  assert.equal(validatedWorkout.sport, "ride");
  assert.equal(validatedWorkout.sportLabel, "Riding");
  assert.deepEqual(validatedWorkout.routeCoords, [
    [30, 31],
    [30.5, 31.5],
  ]);
});

test("rejects malformed last-known GPS coordinates", async () => {
  const persisted = new Map([
    ["stride_last_location", JSON.stringify([91, 31])],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();

  assert.equal(getStorageItem(STORAGE_KEYS.LAST_LOCATION), null);
});

/** Install a writable localStorage stub and return its backing map. */
const useStorageStub = (seed = []) => {
  const persisted = new Map(seed);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => persisted.set(key, String(value)),
      removeItem: (key) => persisted.delete(key),
    },
  });
  return persisted;
};

const legacyHistory = [
  {
    id: "w1",
    title: "Morning Road Run",
    date: "Today · 08:30 AM",
    distance: "5.0 km",
    duration: "32:14",
    efficiencyValue: "6:27",
    efficiencyLabel: "Pace (/km)",
    sport: "run",
  },
  {
    title: "Evening Cycle Loop",
    date: "14 Oct · 06:15 PM",
    distance: "15.2 km",
    duration: "1:02:03",
    efficiencyValue: "20.2",
    efficiencyLabel: "Speed (km/h)",
    sport: "ride",
  },
  null,
  "junk",
  [],
];

test("decimateRoute leaves short routes untouched and caps long ones", async () => {
  const { decimateRoute } = await loadStorageModule();

  const short = [
    [0, 0],
    [1, 1],
  ];
  assert.equal(decimateRoute(short), short);
  assert.deepEqual(decimateRoute(null), []);

  const long = Array.from({ length: 1200 }, (_, i) => [i / 1000, i / 1000]);
  const decimated = decimateRoute(long, 500);

  assert.ok(
    decimated.length <= 500,
    `expected <= 500, got ${decimated.length}`,
  );
  assert.deepEqual(decimated[0], long[0]);
  assert.deepEqual(decimated[decimated.length - 1], long[long.length - 1]);
});

test("formatHistoryDate derives labels from a real timestamp", async () => {
  const { formatHistoryDate } = await loadStorageModule();

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    8,
    30,
  );
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const older = new Date(today);
  older.setDate(older.getDate() - 10);

  assert.ok(formatHistoryDate(today.getTime()).startsWith("Today · "));
  assert.ok(formatHistoryDate(yesterday.getTime()).startsWith("Yesterday · "));
  const olderLabel = formatHistoryDate(older.getTime());
  assert.ok(!olderLabel.startsWith("Today · "));
  assert.ok(!olderLabel.startsWith("Yesterday · "));
  assert.ok(olderLabel.includes("·"));

  assert.equal(formatHistoryDate(Number.NaN), "");
  assert.equal(formatHistoryDate("not-a-date"), "");
});

test("normalizes legacy display-string history into numeric records", async () => {
  useStorageStub([["stride_history", JSON.stringify(legacyHistory)]]);
  const { getStorageItem, STORAGE_KEYS, setStorageItem } =
    await loadStorageModule();

  const items = getStorageItem(STORAGE_KEYS.HISTORY);
  assert.equal(items.length, 2, "unusable entries are dropped");

  assert.equal(items[0].distanceKm, 5);
  assert.equal(items[0].elapsedSeconds, 32 * 60 + 14);
  assert.equal(items[0].dateLabel, "Today · 08:30 AM");
  assert.equal(
    items[0].startedAtMs,
    null,
    "a yearless label is never invented",
  );

  assert.equal(items[1].distanceKm, 15.2);
  assert.equal(items[1].elapsedSeconds, 60 * 60 + 2 * 60 + 3);
  assert.equal(items[1].sport, "ride");

  // Normalization must be idempotent, otherwise a read/write cycle drifts.
  setStorageItem(STORAGE_KEYS.HISTORY, items);
  assert.deepEqual(getStorageItem(STORAGE_KEYS.HISTORY), items);
});

test("bounds history to HISTORY_LIMIT on read and rejects malformed shapes", async () => {
  const oversized = Array.from({ length: 80 }, (_, i) => ({
    title: `Workout ${i}`,
    date: `Day ${i}`,
    distance: "1.0 km",
    duration: "01:00",
    sport: "run",
  }));
  useStorageStub([
    ["stride_history", JSON.stringify([...oversized, null, "junk"])],
    ["stride_corrupt", JSON.stringify({ not: "an array" })],
  ]);
  const { getStorageItem, HISTORY_LIMIT, STORAGE_KEYS } =
    await loadStorageModule();

  const items = getStorageItem(STORAGE_KEYS.HISTORY);
  assert.equal(items.length, HISTORY_LIMIT);
  assert.equal(items[0].title, "Workout 0");
  assert.equal(items[items.length - 1].title, `Workout ${HISTORY_LIMIT - 1}`);
});

test("migrateStoredSchema persists normalized history and the version marker once", async () => {
  const persisted = useStorageStub([
    ["stride_history", JSON.stringify(legacyHistory)],
  ]);
  const { getStorageItem, migrateStoredSchema, SCHEMA_VERSION, STORAGE_KEYS } =
    await loadStorageModule();

  assert.equal(migrateStoredSchema(), true, "first run performs the migration");
  assert.equal(getStorageItem(STORAGE_KEYS.SCHEMA_VERSION), SCHEMA_VERSION);

  const onDisk = JSON.parse(persisted.get(STORAGE_KEYS.HISTORY));
  assert.equal(onDisk.length, 2);
  assert.equal(onDisk[0].distanceKm, 5);
  assert.equal(onDisk[0].dateLabel, "Today · 08:30 AM");

  assert.equal(migrateStoredSchema(), false, "subsequent runs are a no-op");
});

test("migrateStoredSchema leaves an untouched profile untouched", async () => {
  const persisted = useStorageStub();
  const { migrateStoredSchema, STORAGE_KEYS } = await loadStorageModule();

  assert.equal(migrateStoredSchema(), true);
  assert.equal(persisted.has(STORAGE_KEYS.HISTORY), false);
  assert.equal(persisted.get(STORAGE_KEYS.SCHEMA_VERSION), "1");
});

test("getCurrentWorkout resolves the record the summary screens should show", async () => {
  useStorageStub();
  const { getCurrentWorkout, setStorageItem, STORAGE_KEYS } =
    await loadStorageModule();

  assert.equal(getCurrentWorkout(), null, "no session at all");

  setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, {
    status: "in_progress",
    startTime: 1000,
  });
  assert.equal(
    getCurrentWorkout(),
    null,
    "a running session is not summarizable",
  );

  setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, {
    status: "complete",
    startTime: 1000,
    saved: false,
  });
  assert.equal(
    getCurrentWorkout()?.status,
    "complete",
    "active beats completed",
  );

  setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, null);
  assert.equal(
    getCurrentWorkout(),
    null,
    "active cleared, nothing completed yet",
  );

  setStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT, {
    status: "complete",
    startTime: 1000,
    saved: false,
  });
  assert.equal(
    getCurrentWorkout()?.status,
    "complete",
    "falls back to the last completed session",
  );
});
