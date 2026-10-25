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

test("daysBetweenDayKeys rejects malformed keys and measures real spans", async () => {
  const { daysBetweenDayKeys, isDayKey } = await loadStreakModule();

  assert.equal(isDayKey("2026-10-25"), true);
  assert.equal(isDayKey("2026-1-5"), false);
  assert.equal(isDayKey("25-10-2026"), false);

  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-25"), 0);
  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-26"), 1);
  assert.equal(daysBetweenDayKeys("2026-10-25", "2026-10-30"), 5);
  assert.equal(daysBetweenDayKeys("2026-10-30", "2026-10-25"), -5);
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
