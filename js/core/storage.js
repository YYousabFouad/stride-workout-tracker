/**
 * Stride Workout Tracker — Storage & Domain Utility Helpers
 * Single source of truth for localStorage keys, domain constants, and data transformations.
 */

export const STORAGE_KEYS = {
  ACTIVE_WORKOUT: "stride_active_workout",
  COMPLETED_WORKOUT: "stride_completed_workout",
  HISTORY: "stride_history",
  STREAK: "stride_streak",
  STREAK_LAST_ACTIVITY: "stride_streak_last_activity",
  USER: "stride_user",
  LAST_LOCATION: "stride_last_location",
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
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return goal === GOAL_TYPES.TIME ? 30 : 5.0;
  }
  // Bounds checking: 0.5km - 100km or 1min - 720min (12 hrs)
  const min = goal === GOAL_TYPES.TIME ? 1 : 0.5;
  const max = goal === GOAL_TYPES.TIME ? 720 : 100;
  return Math.min(Math.max(parsed, min), max);
};

/**
 * Whitelist sport against valid domain options
 * @param {string} rawSport
 * @returns {'run'|'ride'}
 */
export const sanitizeSport = function (rawSport) {
  return rawSport === SPORTS.RIDE ? SPORTS.RIDE : SPORTS.RUN;
};

/**
 * Whitelist workout goal against valid domain options
 * @param {string} rawGoal
 * @returns {'distance'|'time'}
 */
export const sanitizeGoal = function (rawGoal) {
  return rawGoal === GOAL_TYPES.TIME ? GOAL_TYPES.TIME : GOAL_TYPES.DISTANCE;
};

/**
 * HTML-escape special characters to prevent Cross-Site Scripting (CWE-79)
 * @param {string} str
 * @returns {string}
 */
export const escapeHtml = function (str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/**
 * Sanitize text inputs: strip non-printable/control characters and enforce max length
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export const sanitizeString = function (str, maxLength = 50) {
  if (typeof str !== "string") return "";
  // Strip control characters (ASCII 0-31 and 127) to prevent display spoofing & layout distortion
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, maxLength);
};

/**
 * Safely parse JSON strings with reviver guarding against Prototype Pollution (CWE-1321)
 * @param {string} raw
 * @returns {any|null}
 */
export const safeJsonParse = function (raw) {
  if (!raw || typeof raw !== "string") return null;
  return JSON.parse(raw, (key, value) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return undefined;
    }
    return value;
  });
};

/**
 * Safely parse JSON from localStorage with prototype pollution protection
 * @param {string} key
 * @returns {any|null}
 */
export const getStorageItem = function (key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? safeJsonParse(raw) : null;
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return null;
  }
};

/**
 * Safely write JSON to localStorage with quota-exceeded mitigation (CWE-400)
 * @param {string} key
 * @param {any} value
 */
export const setStorageItem = function (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Error writing ${key} to storage, attempting recovery:`, err);
    try {
      // If quota exceeded, prune older historical logs to preserve active and current state
      const history = getStorageItem(STORAGE_KEYS.HISTORY);
      if (Array.isArray(history) && history.length > 10) {
        localStorage.setItem(
          STORAGE_KEYS.HISTORY,
          JSON.stringify(history.slice(0, 10))
        );
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (retryErr) {
      console.error(`Storage recovery failed for ${key}:`, retryErr);
    }
  }
};
