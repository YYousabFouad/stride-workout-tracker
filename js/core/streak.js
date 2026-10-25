/**
 * Stride Workout Tracker — Streak Manager
 * Manages daily streak counters and UI badges across screens.
 *
 * The stored streak is only meaningful together with the last recorded activity
 * day, so every read derives the displayed value instead of trusting the number:
 * a streak that was not written is 0, and one whose last activity is more than a
 * day old is broken.
 */

import {
  STORAGE_KEYS,
  getCurrentWorkout,
  getStorageItem,
  setStorageItem,
} from "./storage.js";

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = function (value) {
  return String(value).padStart(2, "0");
};

/** @param {Date} date @returns {string} local day key, e.g. "2026-10-25" */
export const toDayKey = function (date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

/** @param {unknown} value @returns {boolean} */
export const isDayKey = function (value) {
  return typeof value === "string" && DAY_KEY_PATTERN.test(value);
};

/**
 * Whole local days between two day keys (positive when `to` is later).
 * Day boundaries are built from Y/M/D rather than ms offsets so daylight
 * saving transitions cannot push a consecutive day into the wrong bucket.
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number|null} null when either key is unusable
 */
export const daysBetweenDayKeys = function (fromKey, toKey) {
  if (!isDayKey(fromKey) || !isDayKey(toKey)) return null;
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
  const fromMs = new Date(fromYear, fromMonth - 1, fromDay).getTime();
  const toMs = new Date(toYear, toMonth - 1, toDay).getTime();
  return Math.round((toMs - fromMs) / 86400000);
};

/**
 * @returns {number} earned, unbroken streak days (0 when none exists yet)
 */
export const getStreakCount = function () {
  const lastActivity = getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY);
  const todayKey = toDayKey(new Date());

  // No recorded activity day means no earned streak — never a default value.
  if (!isDayKey(lastActivity)) return 0;

  const gap = daysBetweenDayKeys(lastActivity, todayKey);
  // A gap of 2+ days means the chain was broken and must display as 0 until
  // the next workout restarts it.
  if (gap === null || gap > 1) return 0;

  const stored = Number(getStorageItem(STORAGE_KEYS.STREAK));
  if (!Number.isFinite(stored) || stored < 0) return 0;
  return Math.floor(stored);
};

export const updateStreakDisplay = function () {
  const streak = getStreakCount();
  document.querySelectorAll(".streak-days-val").forEach((el) => {
    el.textContent = `${streak} days`;
  });

  // Sync current streak card on Plan screen
  const planStreakEl = document.querySelector(
    "#view-plan .streak-number-display"
  );
  if (planStreakEl) {
    planStreakEl.textContent = `${streak} days`;
  }

  // Sync potential streak card on Complete screen
  const completeStreakEl = document.querySelector(
    "#view-complete .streak-number-display"
  );
  const completeDescEl = document.querySelector(
    "#view-complete .streak-description"
  );
  if (completeStreakEl) {
    const workout = getCurrentWorkout();
    const alreadySaved = Boolean(workout?.saved);
    const targetStreak = workout ? (alreadySaved ? streak : streak + 1) : streak;
    completeStreakEl.textContent = `${targetStreak} days`;
    if (completeDescEl) {
      completeDescEl.textContent = !workout
        ? "Complete a workout to add it to your activity streak."
        : alreadySaved
          ? `Workout saved! Your active streak is now ${streak} consecutive days.`
          : `Saving this workout will increase your streak to ${targetStreak} consecutive days! Accounts are stored right in your browser's local storage.`;
    }
  }
};

export const incrementStreak = function () {
  const current = getStreakCount();
  const todayKey = toDayKey(new Date());
  const lastActivity = getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY);
  let next = current;

  if (lastActivity !== todayKey) {
    // `current` is already 0 whenever the recorded day is missing or stale, so
    // both a fresh start and a broken chain restart at 1.
    next = current + 1;
    setStorageItem(STORAGE_KEYS.STREAK, next);
    setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, todayKey);
  }

  updateStreakDisplay();
  return next;
};
