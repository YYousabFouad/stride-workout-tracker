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

const isValidCoordinate = function (coordinate) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    Number.isFinite(coordinate[0]) &&
    coordinate[0] >= -90 &&
    coordinate[0] <= 90 &&
    Number.isFinite(coordinate[1]) &&
    coordinate[1] >= -180 &&
    coordinate[1] <= 180
  );
};

const sanitizeRouteCoords = function (coordinates) {
  if (!Array.isArray(coordinates)) return [];
  const validCoordinates = coordinates.filter(isValidCoordinate);
  if (validCoordinates.length <= 500) return validCoordinates;

  const step = Math.ceil((validCoordinates.length - 1) / 499);
  const decimated = validCoordinates.filter(
    (_, index) => index % step === 0,
  );
  if (decimated[decimated.length - 1] !== validCoordinates[validCoordinates.length - 1]) {
    decimated.push(validCoordinates[validCoordinates.length - 1]);
  }
  return decimated;
};

const sanitizeWorkout = function (value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Number.isFinite(value.startTime) || value.startTime <= 0) return null;

  const status = value.status;
  if (status !== "in_progress" && status !== "complete") return null;
  if (key === STORAGE_KEYS.COMPLETED_WORKOUT && status !== "complete") return null;

  const goal = sanitizeGoal(value.goal);
  return {
    ...value,
    sport: sanitizeSport(value.sport),
    sportLabel: value.sport === SPORTS.RIDE ? "Riding" : "Running",
    goal,
    targetValue: sanitizeTarget(value.targetValue, goal),
    targetUnit: goal === GOAL_TYPES.TIME ? "min" : "km",
    startTime: value.startTime,
    status,
    saved: value.saved === true,
    routeCoords: sanitizeRouteCoords(value.routeCoords),
    gpsDistanceKm:
      Number.isFinite(value.gpsDistanceKm) && value.gpsDistanceKm >= 0
        ? value.gpsDistanceKm
        : 0,
  };
};

const validateStoredValue = function (key, value) {
  if (
    key === STORAGE_KEYS.ACTIVE_WORKOUT ||
    key === STORAGE_KEYS.COMPLETED_WORKOUT
  ) {
    return sanitizeWorkout(value, key);
  }
  if (key === STORAGE_KEYS.LAST_LOCATION) {
    return isValidCoordinate(value) ? value : null;
  }
  return value;
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
  try {
    return JSON.parse(raw, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
      }
      return value;
    });
  } catch {
    return null;
  }
};

/**
 * In-memory fallback map for environments where localStorage is blocked (e.g. strict private browsing)
 */
const memoryStorageFallback = new Map();
const failedStorageWrites = new Set();

/**
 * Safely parse JSON from localStorage with prototype pollution protection and memory fallback
 * @param {string} key
 * @returns {any|null}
 */
export const getStorageItem = function (key) {
  // A failed write makes the in-memory value newer than any persisted value.
  if (failedStorageWrites.has(key)) {
    return validateStoredValue(key, memoryStorageFallback.get(key) ?? null);
  }

  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (parsed !== null) return validateStoredValue(key, parsed);
    }
    return validateStoredValue(key, memoryStorageFallback.get(key) ?? null);
  } catch (err) {
    console.warn(`Storage access restricted for ${key}, falling back to memory:`, err);
    return validateStoredValue(key, memoryStorageFallback.get(key) ?? null);
  }
};

/**
 * Safely write JSON to localStorage with quota-exceeded mitigation and memory fallback
 * @param {string} key
 * @param {any} value
 */
export const setStorageItem = function (key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
    memoryStorageFallback.set(key, value);
    failedStorageWrites.delete(key);
  } catch (err) {
    memoryStorageFallback.set(key, value);
    failedStorageWrites.add(key);
    console.warn(`Storage write restricted for ${key}, using in-memory state:`, err);
    try {
      // If quota exceeded, prune older historical logs to preserve active and current state
      const history = getStorageItem(STORAGE_KEYS.HISTORY);
      if (Array.isArray(history) && history.length > 10) {
        localStorage.setItem(
          STORAGE_KEYS.HISTORY,
          JSON.stringify(history.slice(0, 10))
        );
        localStorage.setItem(key, JSON.stringify(value));
        failedStorageWrites.delete(key);
      }
    } catch {
      // Memory fallback is safely preserved
    }
  }
};
