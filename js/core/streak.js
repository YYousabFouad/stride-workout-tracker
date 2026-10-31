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

/** @typedef {{ count: number, lastActivity: string|null }} StreakState */

/** @param {number} value @returns {string} */
const pad2 = function (value) {
  return String(value).padStart(2, "0");
};

/** @param {number} days @returns {string} */
const formatDays = function (days) {
  const safeDays = Math.max(0, Math.floor(Number(days) || 0));
  return `${safeDays} ${safeDays === 1 ? "day" : "days"}`;
};

/** @param {Date} date @returns {string} local day key, e.g. "2026-10-25" */
export const toDayKey = function (date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

/** @param {unknown} value @returns {boolean} */
export const isDayKey = function (value) {
  if (typeof value !== "string" || !DAY_KEY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

  return day <= daysInMonth;
};

/** @param {number} year @param {number} month @param {number} day @returns {number} */
const dayKeyToUtcMs = function (year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
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
  const fromMs = dayKeyToUtcMs(fromYear, fromMonth, fromDay);
  const toMs = dayKeyToUtcMs(toYear, toMonth, toDay);
  return Math.round((toMs - fromMs) / 86400000);
};

/**
 * Read the atomic streak record, falling back to the legacy two-key shape.
 * @returns {StreakState}
 */
const readStreakState = function () {
  const saved = getStorageItem(STORAGE_KEYS.STREAK_STATE);
  if (
    saved &&
    typeof saved === "object" &&
    !Array.isArray(saved) &&
    Number.isFinite(saved.count) &&
    saved.count >= 0 &&
    isDayKey(saved.lastActivity)
  ) {
    return {
      count: Math.floor(saved.count),
      lastActivity: saved.lastActivity,
    };
  }

  const legacyCount = Number(getStorageItem(STORAGE_KEYS.STREAK));
  const legacyLastActivity = getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY);
  return {
    count:
      Number.isFinite(legacyCount) && legacyCount >= 0
        ? Math.floor(legacyCount)
        : 0,
    lastActivity: isDayKey(legacyLastActivity) ? legacyLastActivity : null,
  };
};

/**
 * @param {StreakState} state
 * @param {string} todayKey
 * @returns {number}
 */
const earnedStreakFromState = function (state, todayKey) {
  if (typeof state.lastActivity !== "string" || !isDayKey(state.lastActivity)) {
    return 0;
  }
  const gap = daysBetweenDayKeys(state.lastActivity, todayKey);
  return gap !== null && gap >= 0 && gap <= 1 ? state.count : 0;
};

/**
 * @returns {number} earned, unbroken streak days (0 when none exists yet)
 */
export const getStreakCount = function () {
  const todayKey = toDayKey(new Date());
  return earnedStreakFromState(readStreakState(), todayKey);
};

/**
 * Streak value that saving a workout would produce on its completion day.
 * @param {number} streak Earned streak from `getStreakCount()`.
 * @param {string|unknown} lastActivity Raw stored STREAK_LAST_ACTIVITY value.
 * @param {string} todayKey Local day key for today.
 * @param {string} [activityKey=todayKey] Local day key when the workout ended.
 * @param {number} [storedCount=streak] Last persisted streak count.
 * @returns {number}
 */
export const projectStreakAfterSave = function (
  streak,
  lastActivity,
  todayKey,
  activityKey = todayKey,
  storedCount = streak,
) {
  const activityAge = daysBetweenDayKeys(activityKey, todayKey);
  if (activityAge === null || activityAge > 1) return streak;
  const normalizedActivityKey = activityAge < 0 ? todayKey : activityKey;

  const gap =
    typeof lastActivity === "string" && isDayKey(lastActivity)
      ? daysBetweenDayKeys(lastActivity, normalizedActivityKey)
      : null;
  if (gap !== null && gap <= 0) return streak;

  const previousCount =
    gap === 1 ? Math.floor(Math.max(0, Number(storedCount) || 0)) : 0;
  return previousCount + 1;
};

export const updateStreakDisplay = function () {
  const todayKey = toDayKey(new Date());
  const streakState = readStreakState();
  const streak = earnedStreakFromState(streakState, todayKey);
  document.querySelectorAll(".streak-days-val").forEach((el) => {
    el.textContent = formatDays(streak);
  });

  // Sync current streak card on Plan screen
  const planStreakEl = document.querySelector(
    "#view-plan .streak-number-display",
  );
  if (planStreakEl) {
    planStreakEl.textContent = formatDays(streak);
  }

  // Update dynamic milestone pill on Plan screen
  const milestoneEl = document.querySelector(".streak-milestone-pill span");
  if (milestoneEl) {
    const milestones = [3, 7, 14, 30, 50, 100];
    const nextMilestone = milestones.find((m) => m > streak);
    milestoneEl.textContent = nextMilestone
      ? `Next Milestone: ${nextMilestone} Days Badge`
      : `Master Athlete: ${streak} Days Streak! 🏆`;
  }

  // Sync potential streak card on Complete screen
  const completeStreakEl = document.querySelector(
    "#view-complete .streak-number-display",
  );
  const completeDescEl = document.querySelector(
    "#view-complete .streak-description",
  );
  if (completeStreakEl) {
    const workout = getCurrentWorkout();
    const alreadySaved = Boolean(workout?.saved);
    const activityTimestamp = workout?.endTime || workout?.startTime;
    const activityKey = activityTimestamp
      ? toDayKey(new Date(activityTimestamp))
      : todayKey;
    const targetStreak =
      workout && !alreadySaved
        ? projectStreakAfterSave(
            streak,
            streakState.lastActivity,
            todayKey,
            activityKey,
            streakState.count,
          )
        : streak;
    completeStreakEl.textContent = formatDays(targetStreak);
    if (completeDescEl) {
      completeDescEl.textContent = !workout
        ? "Complete a workout to add it to your activity streak."
        : alreadySaved
          ? `Workout saved! Your active streak is now ${streak} consecutive ${streak === 1 ? "day" : "days"}.`
          : targetStreak > streak
            ? `Saving this workout will increase your streak to ${targetStreak} consecutive ${targetStreak === 1 ? "day" : "days"}! Accounts are stored right in your browser's local storage.`
            : `Saving this workout won't change your active streak of ${streak} consecutive ${streak === 1 ? "day" : "days"}.`;
    }
  }
};

/**
 * Persist a completed workout's activity day as one atomic streak record.
 * Legacy keys are mirrored after the primary write for backward compatibility.
 * @param {number} [activityTimestamp] Workout completion time; defaults to now.
 * @returns {{ count: number, persisted: boolean }}
 */
export const recordWorkoutStreak = function (activityTimestamp = Date.now()) {
  const now = Date.now();
  const todayKey = toDayKey(new Date(now));
  const parsedActivityTimestamp = Number(activityTimestamp);
  const safeActivityTimestamp = Number.isFinite(parsedActivityTimestamp)
    ? Math.min(Math.max(0, parsedActivityTimestamp), now)
    : now;
  const activityKey = toDayKey(new Date(safeActivityTimestamp));
  const state = readStreakState();
  const current = earnedStreakFromState(state, todayKey);
  const gap = state.lastActivity
    ? daysBetweenDayKeys(state.lastActivity, activityKey)
    : null;
  const activityAge = daysBetweenDayKeys(activityKey, todayKey);

  // A retry can happen after the completion page failed to persist the
  // workout's `saved` flag. Do not award that older activity on a later day.
  if (activityAge === null || activityAge > 1) {
    updateStreakDisplay();
    return { count: current, persisted: true };
  }

  if (gap !== null && gap <= 0) {
    // Retry the atomic write too: the in-memory fallback may contain a value
    // from an earlier failed attempt even though localStorage still does not.
    const persisted = setStorageItem(STORAGE_KEYS.STREAK_STATE, state);
    if (persisted) {
      setStorageItem(STORAGE_KEYS.STREAK, state.count);
      if (state.lastActivity) {
        setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, state.lastActivity);
      }
    }
    updateStreakDisplay();
    return { count: current, persisted };
  }

  // A streak advances only when the activity date advances. A broken chain or
  // fresh start has no earned prior count and therefore begins at one.
  const previousCount = gap === 1 ? state.count : 0;
  const next = previousCount + 1;
  const nextState = { count: next, lastActivity: activityKey };
  const persisted = setStorageItem(STORAGE_KEYS.STREAK_STATE, {
    ...nextState,
  });

  if (persisted) {
    setStorageItem(STORAGE_KEYS.STREAK, next);
    setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, activityKey);
  }

  updateStreakDisplay();
  return {
    count: earnedStreakFromState(nextState, todayKey),
    persisted,
  };
};

/**
 * Backward-compatible numeric streak increment API.
 * @returns {number} displayed streak count
 */
export const incrementStreak = function () {
  return recordWorkoutStreak().count;
};
