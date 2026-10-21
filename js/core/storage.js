/**
 * Stride Workout Tracker — Storage & Domain Utility Helpers
 * Single source of truth for localStorage keys, domain constants, and data transformations.
 */

export const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "stride_active_workout",
  COMPLETED_WORKOUT: "stride_completed_workout",
  HISTORY: "stride_history",
  STREAK: "stride_streak",
  USER: "stride_user",
};

export const SPORTS = {
  RUN: "run",
  RIDE: "ride",
};

export const GOAL_TYPES = {
  DISTANCE: "distance",
  TIME: "time",
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
 * Format distance in kilometers to a display string (e.g. "5.0 km")
 * @param {number} distanceKm
 * @returns {string}
 */
export const formatDistance = function (distanceKm) {
  const safeKm = Math.max(0, Number(distanceKm) || 0);
  return `${safeKm.toFixed(1)} km`;
};

/**
 * Calculate the Haversine distance in kilometers between two [lat, lng] coordinates
 * @param {[number, number]} coordA
 * @param {[number, number]} coordB
 * @returns {number}
 */
export const calculateHaversineKm = function (coordA, coordB) {
  if (!Array.isArray(coordA) || !Array.isArray(coordB)) return 0;
  const [lat1, lon1] = coordA;
  const [lat2, lon2] = coordB;
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate sport-appropriate efficiency metric (Pace /km for running, Speed km/h for riding)
 * @param {number} distanceKm
 * @param {number} elapsedSeconds
 * @param {string} sport
 * @returns {{ value: string, label: string }}
 */
export const calculateEfficiencyMetric = function (
  distanceKm,
  elapsedSeconds,
  sport
) {
  const safeKm = Math.max(0, Number(distanceKm) || 0);
  const safeSec = Math.max(0, Number(elapsedSeconds) || 0);

  if (sport === SPORTS.RIDE) {
    const speedKmh = safeSec > 0 ? (safeKm / (safeSec / 3600)).toFixed(1) : "0.0";
    return { value: speedKmh, label: "Speed (km/h)" };
  }

  if (safeKm <= 0.01 || safeSec <= 0) {
    return { value: "--:--", label: "Pace (/km)" };
  }

  const paceSecondsPerKm = Math.round(safeSec / safeKm);
  const mins = Math.floor(paceSecondsPerKm / 60);
  const secs = String(paceSecondsPerKm % 60).padStart(2, "0");
  return { value: `${mins}:${secs}`, label: "Pace (/km)" };
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
    return goal === GOAL_TYPES.DISTANCE ? 5.0 : 30;
  }
  // Bounds checking: 0.5km - 100km or 1min - 720min (12 hrs)
  const min = goal === GOAL_TYPES.DISTANCE ? 0.5 : 1;
  const max = goal === GOAL_TYPES.DISTANCE ? 100 : 720;
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
