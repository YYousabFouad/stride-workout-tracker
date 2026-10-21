/**
 * Stride Workout Tracker — Streak Manager
 * Manages daily streak counters and UI badges across screens.
 */

import { STORAGE_KEYS, getStorageItem } from "./storage.js";

export const getStreakCount = function () {
  const stored = localStorage.getItem(STORAGE_KEYS.STREAK);
  const parsed = stored !== null ? parseInt(stored, 10) : NaN;
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
    const completedWorkout = getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT);
    const alreadySaved = Boolean(completedWorkout && completedWorkout.saved);
    const targetStreak = alreadySaved ? streak : streak + 1;
    completeStreakEl.textContent = `${targetStreak} days`;
    if (completeDescEl) {
      completeDescEl.textContent = alreadySaved
        ? `Workout saved! Your active streak is now ${streak} consecutive days.`
        : `Saving this workout will increase your streak to ${targetStreak} consecutive days! Accounts are stored right in your browser's local storage.`;
    }
  }
};

export const incrementStreak = function () {
  const current = getStreakCount();
  const next = current + 1;
  localStorage.setItem(STORAGE_KEYS.STREAK, String(next));
  updateStreakDisplay();
  return next;
};
