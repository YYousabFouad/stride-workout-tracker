/**
 * Stride Workout Tracker — Streak Manager
 * Manages daily streak counters and UI badges across screens.
 */

import { STORAGE_KEYS, getStorageItem, setStorageItem } from "./storage.js";

export const getStreakCount = function () {
  const stored = getStorageItem(STORAGE_KEYS.STREAK);
  const parsed = stored === null ? NaN : Number(stored);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5; // 5 days default from Figma design
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
    const activeWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    const completedWorkout = getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT);
    const workout =
      activeWorkout?.status === "complete"
        ? activeWorkout
        : activeWorkout?.status === "in_progress"
          ? null
          : completedWorkout?.status === "complete"
            ? completedWorkout
            : null;
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
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const lastActivity = getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY);
  let next = current;

  if (lastActivity !== todayKey) {
    if (typeof lastActivity === "string" && /^\d{4}-\d{2}-\d{2}$/.test(lastActivity)) {
      const [year, month, day] = lastActivity.split("-").map(Number);
      const previousDay = new Date(year, month - 1, day);
      previousDay.setDate(previousDay.getDate() + 1);
      const isConsecutive =
        previousDay.getFullYear() === today.getFullYear() &&
        previousDay.getMonth() === today.getMonth() &&
        previousDay.getDate() === today.getDate();
      next = isConsecutive ? current + 1 : 1;
    } else {
      // Preserve the seeded streak on its first recorded activity.
      next = current + 1;
    }
    setStorageItem(STORAGE_KEYS.STREAK, next);
    setStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY, todayKey);
  }

  updateStreakDisplay();
  return next;
};
