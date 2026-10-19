/**
 * Stride Workout Tracker — Streak Manager
 * Manages daily streak counters and UI badges across screens.
 */

import { STORAGE_KEYS } from "./storage.js";

export const getStreakCount = function () {
  const stored = localStorage.getItem(STORAGE_KEYS.STREAK);
  return stored !== null ? parseInt(stored, 10) : 5; // 5 days default from Figma design
};

export const updateStreakDisplay = function () {
  const streak = getStreakCount();
  document.querySelectorAll(".streak-days-val").forEach((el) => {
    el.textContent = `${streak} days`;
  });
};

export const incrementStreak = function () {
  const current = getStreakCount();
  const next = current + 1;
  localStorage.setItem(STORAGE_KEYS.STREAK, String(next));
  updateStreakDisplay();
  return next;
};
