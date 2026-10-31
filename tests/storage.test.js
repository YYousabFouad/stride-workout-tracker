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

test("creates collision-resistant workout identifiers", async () => {
  const { createWorkoutId } = await loadStorageModule();
  const ids = Array.from({ length: 20 }, createWorkoutId);

  assert.ok(ids.every((id) => id.startsWith("workout_")));
  assert.equal(new Set(ids).size, ids.length);
});

test("uses a stable ID for legacy workouts so save retries can deduplicate", async () => {
  const { getWorkoutId } = await loadStorageModule();
  const legacyWorkout = { startTime: 1700000000000 };

  assert.equal(getWorkoutId(legacyWorkout), "workout_legacy_1700000000000");
  assert.equal(
    getWorkoutId({ ...legacyWorkout, id: "workout_existing" }),
    "workout_existing",
  );
});

test("formats non-finite workout metrics as zero instead of Infinity or NaN", async () => {
  const { calculateEfficiencyMetric, formatDistance, formatTime } =
    await loadStorageModule();

  assert.equal(formatTime(Number.POSITIVE_INFINITY), "00:00");
  assert.equal(formatDistance(Number.POSITIVE_INFINITY), "0.0 km");
  assert.deepEqual(
    calculateEfficiencyMetric(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      "run",
    ),
    { value: "--:--", label: "Pace (/km)" },
  );
});

test("reports when a write is available only in the current page's memory", async () => {
  delete globalThis.localStorage;

  const { setStorageItem } = await loadStorageModule();

  assert.equal(
    setStorageItem("stride_active_workout", { status: "in_progress" }),
    false,
  );
});

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

test("persists the pruned history when quota recovery handles a history write", async () => {
  const persisted = new Map();
  const history = Array.from({ length: 13 }, (_, index) => ({
    id: `workout-${index}`,
    title: "Workout",
    sport: "run",
    startedAtMs: 1000 + index,
    distanceKm: 5,
    elapsedSeconds: 1800,
  }));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        const parsed = JSON.parse(value);
        if (key === "stride_history" && parsed.length > 10) {
          throw new Error("Storage quota exceeded");
        }
        persisted.set(key, value);
      },
    },
  });

  const { getStorageItem, setStorageItem, STORAGE_KEYS } =
    await loadStorageModule();
  assert.equal(setStorageItem(STORAGE_KEYS.HISTORY, history), true);

  const persistedHistory = JSON.parse(persisted.get(STORAGE_KEYS.HISTORY));
  const memoryHistory = getStorageItem(STORAGE_KEYS.HISTORY);
  assert.equal(persistedHistory.length, 10);
  assert.equal(memoryHistory.length, 10);
  assert.equal(persistedHistory[0].id, "workout-0");
  assert.equal(memoryHistory[0].id, "workout-0");
});

test("keeps a tombstone when removing a persisted value fails", async () => {
  const persisted = new Map([
    ["stride_last_location", JSON.stringify([30, 31])],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      removeItem: () => {
        throw new Error("Storage removal restricted");
      },
    },
  });

  const { getStorageItem, removeStorageItem, STORAGE_KEYS } =
    await loadStorageModule();
  assert.deepEqual(getStorageItem(STORAGE_KEYS.LAST_LOCATION), [30, 31]);

  removeStorageItem(STORAGE_KEYS.LAST_LOCATION);

  assert.equal(getStorageItem(STORAGE_KEYS.LAST_LOCATION), null);
  assert.equal(persisted.has(STORAGE_KEYS.LAST_LOCATION), true);
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

test("drops negative or inconsistent optional workout metrics", async () => {
  const persisted = new Map([
    [
      "stride_active_workout",
      JSON.stringify({
        status: "in_progress",
        startTime: 1000,
        endTime: 999,
        elapsedSeconds: -1,
        distanceKm: -2,
        gpsDistanceKm: -3,
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });

  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();
  const workout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  assert.equal("endTime" in workout, false);
  assert.equal("elapsedSeconds" in workout, false);
  assert.equal("distanceKm" in workout, false);
  assert.equal(workout.gpsDistanceKm, 0);
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

test("sanitizes stored athlete profiles before returning a typed shape", async () => {
  const persisted = useStorageStub([
    [
      "stride_user",
      JSON.stringify({
        username: "  Run\nner  ",
        email: "runner@example.com",
        createdAt: 1000,
        updatedAt: 2000,
      }),
    ],
  ]);
  const { getStorageItem, STORAGE_KEYS } = await loadStorageModule();

  assert.deepEqual(getStorageItem(STORAGE_KEYS.USER), {
    username: "Runner",
    email: "runner@example.com",
    createdAt: 1000,
    updatedAt: 2000,
  });

  persisted.set(STORAGE_KEYS.USER, JSON.stringify({ username: "Runner" }));
  assert.equal(getStorageItem(STORAGE_KEYS.USER), null);
});

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

test("uniform decimation emits exactly the requested point count", async () => {
  // Regression: the previous modulo filter returned ~half the requested
  // points for arrays just over the limit (501 -> 251, 600 -> 301).
  const { decimateRoute } = await loadStorageModule();
  for (const [length, limit] of [
    [501, 500],
    [600, 500],
    [501, 500],
    [1000, 500],
    [10000, 500],
  ]) {
    const route = Array.from({ length }, (_, i) => [i / 1000, i / 1000]);
    const decimated = decimateRoute(route, limit);
    assert.ok(
      decimated.length <= limit,
      `length ${length}: expected <= ${limit}, got ${decimated.length}`,
    );
    assert.ok(
      // Uniform sampling falls just short only by duplicate collapsed points;
      // it must never under-sample by more than a rounding artifact.
      decimated.length >= limit - 2,
      `length ${length}: expected ~${limit}, got ${decimated.length}`,
    );
    assert.deepEqual(decimated[0], route[0]);
    assert.deepEqual(decimated[decimated.length - 1], route[route.length - 1]);
  }
});

test("sanitizeHistory stops scanning after collecting the limit", async () => {
  const { HISTORY_LIMIT, STORAGE_KEYS, getStorageItem } =
    await loadStorageModule();
  // 20k bloated entries (> the pre-optimization full scan path) still bound
  // quickly to HISTORY_LIMIT instead of mapping the entire array.
  const bloated = Array.from({ length: 20000 }, (_, i) => ({
    id: `w-${i}`,
    title: "Workout",
    sport: "run",
    distanceKm: 5,
    elapsedSeconds: 1800,
    extra: "x".repeat(60),
  }));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) =>
        key === STORAGE_KEYS.HISTORY ? JSON.stringify(bloated) : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });

  const history = getStorageItem(STORAGE_KEYS.HISTORY);
  assert.equal(history.length, HISTORY_LIMIT);
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
  assert.equal(persisted.get(STORAGE_KEYS.SCHEMA_VERSION), "2");
});

test("migrateStoredSchema copies the legacy streak pair into one state record", async () => {
  const persisted = useStorageStub([
    ["stride_schema_version", "1"],
    ["stride_streak", "6"],
    ["stride_streak_last_activity", JSON.stringify("2026-10-31")],
  ]);
  const { migrateStoredSchema, STORAGE_KEYS } = await loadStorageModule();

  assert.equal(migrateStoredSchema(), true);
  assert.deepEqual(JSON.parse(persisted.get(STORAGE_KEYS.STREAK_STATE)), {
    count: 6,
    lastActivity: "2026-10-31",
  });
  assert.equal(persisted.get(STORAGE_KEYS.SCHEMA_VERSION), "2");
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

  setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, {
    status: "in_progress",
    startTime: 1000,
  });
  assert.equal(
    getCurrentWorkout()?.status,
    "complete",
    "recovers a completion when only the completed slot was persisted",
  );

  setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, {
    id: "new-id",
    sport: "run",
    goal: "distance",
    targetValue: 5,
    status: "in_progress",
    startTime: 1000,
  });
  assert.equal(
    getCurrentWorkout(),
    null,
    "does not match a new id to a legacy completed record by timestamp alone",
  );
});

test("persistCompletedWorkout reports failure when neither durable slot can be written", async () => {
  useStorageStub([
    [
      "stride_active_workout",
      JSON.stringify({
        id: "workout-1",
        sport: "run",
        goal: "distance",
        targetValue: 5,
        startTime: 1000,
        status: "in_progress",
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) =>
        key === "stride_active_workout"
          ? JSON.stringify({
              id: "workout-1",
              sport: "run",
              goal: "distance",
              targetValue: 5,
              startTime: 1000,
              status: "in_progress",
            })
          : null,
      setItem: () => {
        throw new Error("Storage quota exceeded");
      },
      removeItem: () => {},
    },
  });

  const { persistCompletedWorkout } = await loadStorageModule();
  assert.equal(
    persistCompletedWorkout({
      id: "workout-1",
      sport: "run",
      sportLabel: "Running",
      goal: "distance",
      targetValue: 5,
      targetUnit: "km",
      startTime: 1000,
      status: "complete",
      saved: false,
      routeCoords: [],
      gpsDistanceKm: 0,
    }),
    false,
  );
});

test("persistCompletedWorkout accepts one durable copy and a fresh page can recover it", async () => {
  const activeWorkout = {
    id: "workout-2",
    sport: "run",
    goal: "distance",
    targetValue: 5,
    startTime: 2000,
    status: "in_progress",
  };
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify(activeWorkout)],
  ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        if (key === "stride_active_workout") {
          throw new Error("Storage quota exceeded");
        }
        persisted.set(key, String(value));
      },
      removeItem: (key) => persisted.delete(key),
    },
  });

  const completedWorkout = {
    id: "workout-2",
    sport: "run",
    sportLabel: "Running",
    goal: "distance",
    targetValue: 5,
    targetUnit: "km",
    startTime: 2000,
    status: "complete",
    saved: false,
    routeCoords: [],
    gpsDistanceKm: 0,
  };
  const { persistCompletedWorkout } = await loadStorageModule();
  assert.equal(persistCompletedWorkout(completedWorkout), true);

  const freshPageStorage = await import(
    `../js/core/storage.js?fresh-page=${Date.now()}-${Math.random()}`
  );
  assert.equal(freshPageStorage.getCurrentWorkout()?.status, "complete");
  assert.equal(freshPageStorage.getCurrentWorkout()?.id, "workout-2");
});

test("calculateHaversineKm is robust to antipodal clamping, identical coords, and malformed inputs", async () => {
  const { calculateHaversineKm } = await loadStorageModule();

  assert.equal(calculateHaversineKm(null, null), 0);
  assert.equal(calculateHaversineKm([10], [10, 20]), 0);
  assert.equal(calculateHaversineKm([10, "bad"], [10, 20]), 0);
  assert.equal(calculateHaversineKm([10, Number.NaN], [10, 20]), 0);

  // Identical points should have 0 distance
  assert.equal(calculateHaversineKm([40.7128, -74.006], [40.7128, -74.006]), 0);

  // Antipodal points (or near-antipodal) must not produce NaN from Math.sqrt(1 - a)
  const antipodalDist = calculateHaversineKm([90, 0], [-90, 0]);
  assert.ok(Number.isFinite(antipodalDist));
  assert.ok(antipodalDist > 20000 && antipodalDist < 20100);

  // Normal distance between two points (e.g. NYC to London ~ 5570 km)
  const nycToLondon = calculateHaversineKm(
    [40.7128, -74.006],
    [51.5074, -0.1278],
  );
  assert.ok(nycToLondon > 5500 && nycToLondon < 5650);
});
