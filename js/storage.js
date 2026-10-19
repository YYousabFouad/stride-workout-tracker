/**
 * Stride Workout Tracker — Storage & Utility Helpers
 * Single source of truth for localStorage keys and data transformations.
 */

export const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "stride_active_workout",
  COMPLETED_WORKOUT: "stride_completed_workout",
  HISTORY: "stride_history",
  STREAK: "stride_streak",
  USER: "stride_user",
};

/**
 * Format total seconds into MM:SS or HH:MM:SS
 * @param {number} totalSeconds
 * @returns {string}
 */
export const formatTime = function (totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  if (hours > 0) {
    const hh = String(hours).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

/**
 * Sanitize and enforce domain boundaries for workout target input
 * @param {string|number} rawValue
 * @param {'distance'|'time'} goal
 * @returns {number}
 */
export const sanitizeTarget = function (rawValue, goal) {
  const parsed = parseFloat(rawValue);
  if (isNaN(parsed) || parsed <= 0) {
    return goal === "distance" ? 5.0 : 30;
  }
  // Bounds checking: 0.5km - 100km or 1min - 720min (12 hrs)
  const min = goal === "distance" ? 0.5 : 1;
  const max = goal === "distance" ? 100 : 720;
  return Math.min(Math.max(parsed, min), max);
};

/**
 * Safely parse JSON from localStorage
 * @param {string} key
 * @returns {any|null}
 */
export const getStorageItem = function (key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return null;
  }
};

/**
 * Safely write JSON to localStorage
 * @param {string} key
 * @param {any} value
 */
export const setStorageItem = function (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing ${key} to storage:`, err);
  }
};
