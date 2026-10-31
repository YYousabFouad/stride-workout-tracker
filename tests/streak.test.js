import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
} from "../js/core/storage.js";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

// `incrementStreak` refreshes the DOM badge; a minimal stub is enough to run it.
const documentStub = {
  querySelectorAll: () => [],
  querySelector: () => null,
};

beforeEach(() => {
  const store = new Map();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  });

  // `streak.js` imports the canonical `storage.js`, whose in-memory fallback
  // outlives individual tests. Clearing these keys through that same instance
  // is what makes every test start from an untouched profile.
  setStorageItem(STORAGE_KEYS.STREAK, null);
  setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, null);
  setStorageItem(STORAGE_KEYS.STREAK_STATE, null);
});

afterEach(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    delete globalThis.document;
  }
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
});

// Storage values are only readable after a JSON round trip, so tests seed
// through `setStorageItem` exactly like the application does.
const seedStreak = (count, lastActivity) => {
  setStorageItem(STORAGE_KEYS.STREAK, count);
  setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, lastActivity);
};

const loadStreakModule = async () =>
  import(`../js/core/streak.js?test=${Date.now()}-${Math.random()}`);

const dayKeyFromToday = (offsetDays) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

test("a profile with no recorded activity day reports a streak of 0", async () => {
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("does not invent a seeded streak when only the count was stored", async () => {
  seedStreak(5, null);
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("reports the stored streak while the last activity is today", async () => {
  seedStreak(6, dayKeyFromToday(0));
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 6);
});

test("keeps an unbroken chain when the last activity was yesterday", async () => {
  seedStreak(6, dayKeyFromToday(-1));
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 6);
});

test("does not treat a future activity date as an earned streak", async () => {
  seedStreak(6, dayKeyFromToday(1));
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("decays to 0 when the last activity is stale", async () => {
  seedStreak(6, dayKeyFromToday(-3));
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("treats an unusable activity key as no earned streak", async () => {
  seedStreak(6, "not-a-day-key");
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("treats a non-numeric stored streak as 0", async () => {
  seedStreak({ sneaky: true }, dayKeyFromToday(0));
  const { getStreakCount } = await loadStreakModule();
  assert.equal(getStreakCount(), 0);
});

test("daysBetweenDayKeys rejects invalid calendar dates and measures real spans", async () => {
  const { daysBetweenDayKeys, isDayKey } = await loadStreakModule();

  assert.equal(isDayKey("2026-10-25"), true);
  assert.equal(isDayKey("2024-02-29"), true);
  assert.equal(isDayKey("2023-02-29"), false);
  assert.equal(isDayKey("2026-02-30"), false);
  assert.equal(isDayKey("2026-13-01"), false);
  assert.equal(isDayKey("0000-01-01"), false);
  assert.equal(isDayKey("2026-1-5"), false);
  assert.equal(isDayKey("25-10-2026"), false);

  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-25"), 0);
  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-26"), 1);
  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-30"), 5);
  assert.equal(daysBetweenDayKeys("2026-10-30", "2026-10-25"), -5);
  assert.equal(daysBetweenDayKeys("0099-12-31", "0100-01-01"), 1);
  assert.equal(daysBetweenDayKeys("2026-02-30", "2026-03-02"), null);
  assert.equal(daysBetweenDayKeys("nope", "2026-10-25"), null);
  assert.equal(daysBetweenDayKeys("2026-10-25", "nope"), null);
});

test("the first saved workout starts a streak at 1", async () => {
  const { incrementStreak } = await loadStreakModule();
  assert.equal(incrementStreak(), 1);
  assert.equal(getStorageItem(STORAGE_KEYS.STREAK), 1);
  assert.equal(
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(0),
  );
});

test("saving twice on the same day does not double count", async () => {
  const { incrementStreak } = await loadStreakModule();
  assert.equal(incrementStreak(), 1);
  assert.equal(incrementStreak(), 1);
  assert.equal(getStorageItem(STORAGE_KEYS.STREAK), 1);
});

test("retrying an older workout does not credit it to a newer streak day", async () => {
  seedStreak(5, dayKeyFromToday(-1));
  const olderActivity = new Date();
  olderActivity.setDate(olderActivity.getDate() - 2);
  const { recordWorkoutStreak } = await loadStreakModule();

  const retry = recordWorkoutStreak(olderActivity.getTime());

  assert.equal(retry.count, 5);
  assert.equal(retry.persisted, true);
  assert.equal(getStorageItem(STORAGE_KEYS.STREAK), 5);
  assert.equal(
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(-1),
  );
});

test("failed streak persistence does not update legacy keys and can be retried", async () => {
  const persisted = new Map([
    [STORAGE_KEYS.STREAK, JSON.stringify(5)],
    [STORAGE_KEYS.STREAK_LAST_ACTIVITY, JSON.stringify(dayKeyFromToday(-1))],
  ]);
  let rejectAtomicWrite = true;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        if (key === STORAGE_KEYS.STREAK_STATE && rejectAtomicWrite) {
          throw new Error("Storage quota exceeded");
        }
        persisted.set(key, String(value));
      },
      removeItem: (key) => persisted.delete(key),
    },
  });

  const { recordWorkoutStreak } = await loadStreakModule();
  const firstAttempt = recordWorkoutStreak();
  assert.deepEqual(firstAttempt, { count: 6, persisted: false });
  assert.equal(persisted.has(STORAGE_KEYS.STREAK_STATE), false);
  assert.equal(persisted.get(STORAGE_KEYS.STREAK), JSON.stringify(5));
  assert.equal(
    persisted.get(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    JSON.stringify(dayKeyFromToday(-1)),
  );

  rejectAtomicWrite = false;
  const retry = recordWorkoutStreak();
  assert.deepEqual(retry, { count: 6, persisted: true });
  assert.deepEqual(JSON.parse(persisted.get(STORAGE_KEYS.STREAK_STATE)), {
    count: 6,
    lastActivity: dayKeyFromToday(0),
  });
});

test("projection matches increment: same-day second workout shows the earned streak", async () => {
  // Regression: the Complete card used to advertise streak + 1 even when
  // saving could not increment it again (last activity already today).
  const { getStreakCount, projectStreakAfterSave } = await loadStreakModule();
  seedStreak(5, dayKeyFromToday(0));
  const earned = getStreakCount();
  const projected = projectStreakAfterSave(
    earned,
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(0),
  );
  const { incrementStreak } = await loadStreakModule();
  const actual = incrementStreak();
  assert.equal(projected, actual, "projection must equal the real increment");
  assert.equal(projected, 5);
});

test("projection adds one when today has no activity yet", async () => {
  seedStreak(5, dayKeyFromToday(-1));
  const { getStreakCount, projectStreakAfterSave } = await loadStreakModule();
  const projected = projectStreakAfterSave(
    getStreakCount(),
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(0),
  );
  assert.equal(projected, 6);
});

test("projection restarts a broken chain at 1", async () => {
  seedStreak(5, dayKeyFromToday(-4));
  const { getStreakCount, projectStreakAfterSave } = await loadStreakModule();
  const projected = projectStreakAfterSave(
    getStreakCount(),
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(0),
  );
  assert.equal(projected, 1);
});

test("projection does not credit an older workout to today's streak", async () => {
  const { projectStreakAfterSave } = await loadStreakModule();
  const currentStreak = 5;
  const projected = projectStreakAfterSave(
    currentStreak,
    dayKeyFromToday(0),
    dayKeyFromToday(0),
    dayKeyFromToday(-1),
  );

  assert.equal(projected, currentStreak);
});

test("projection preserves the prior count for a workout completed yesterday", async () => {
  const { projectStreakAfterSave } = await loadStreakModule();
  const projected = projectStreakAfterSave(
    0,
    dayKeyFromToday(-2),
    dayKeyFromToday(0),
    dayKeyFromToday(-1),
    5,
  );

  assert.equal(projected, 6);
});

test("projection clamps a future completion date to today", async () => {
  const { projectStreakAfterSave } = await loadStreakModule();
  const projected = projectStreakAfterSave(
    5,
    dayKeyFromToday(-1),
    dayKeyFromToday(0),
    dayKeyFromToday(1),
    5,
  );

  assert.equal(projected, 6);
});

test("extends an unbroken chain from the previous day", async () => {
  seedStreak(5, dayKeyFromToday(-1));
  const { incrementStreak } = await loadStreakModule();
  assert.equal(incrementStreak(), 6);
  assert.equal(getStorageItem(STORAGE_KEYS.STREAK), 6);
  assert.equal(
    getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY),
    dayKeyFromToday(0),
  );
});

test("restarts at 1 after a broken chain instead of keeping the stale count", async () => {
  seedStreak(5, dayKeyFromToday(-4));
  const { incrementStreak } = await loadStreakModule();
  assert.equal(incrementStreak(), 1);
  assert.equal(getStorageItem(STORAGE_KEYS.STREAK), 1);
});

test("daysBetweenDayKeys correctly measures leap years and month transitions", async () => {
  const { daysBetweenDayKeys } = await loadStreakModule();
  // 2024 is a leap year (29 days in Feb)
  assert.equal(daysBetweenDayKeys("2024-02-28", "2024-03-01"), 2);
  // Non-leap year
  assert.equal(daysBetweenDayKeys("2025-02-28", "2025-03-01"), 1);
  // Month transition
  assert.equal(daysBetweenDayKeys("2026-10-31", "2026-11-01"), 1);
  // Year transition
  assert.equal(daysBetweenDayKeys("2026-12-31", "2027-01-01"), 1);
});
