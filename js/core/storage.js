/**
 * Stride Workout Tracker — Storage & Domain Utility Helpers
 * Single source of truth for localStorage keys, domain constants, and data transformations.
 */

/** @typedef {[number, number]} Coordinate */
/** @typedef {"run" | "ride"} Sport */
/** @typedef {"distance" | "time"} GoalType */
/** @typedef {"in_progress" | "complete"} WorkoutStatus */
/**
 * @typedef {Object} Workout
 * @property {string} [id]
 * @property {Sport} sport
 * @property {string} sportLabel
 * @property {GoalType} goal
 * @property {number} targetValue
 * @property {"km" | "min"} targetUnit
 * @property {number} startTime
 * @property {WorkoutStatus} status
 * @property {boolean} saved
 * @property {Coordinate[]} routeCoords
 * @property {number} gpsDistanceKm
 * @property {number} [endTime]
 * @property {number} [elapsedSeconds]
 * @property {number} [distanceKm]
 * @property {string} [finalDuration]
 * @property {string} [finalDistance]
 * @property {string} [efficiencyValue]
 * @property {string} [efficiencyLabel]
 * @property {boolean} [targetReached]
 */
/** @typedef {{ count: number, lastActivity: string|null }} StoredStreakState */
/**
 * @typedef {Object} UserProfile
 * @property {string} username
 * @property {string} email
 * @property {number} createdAt
 * @property {number} updatedAt
 */
/**
 * @typedef {Object} HistoryItem
 * @property {string} id
 * @property {string} title
 * @property {Sport} sport
 * @property {number | null} startedAtMs
 * @property {string} dateLabel
 * @property {number | null} distanceKm
 * @property {number | null} elapsedSeconds
 * @property {string} efficiencyValue
 * @property {string} efficiencyLabel
 */

export const STORAGE_KEYS = /** @type {const} */ ({
  ACTIVE_WORKOUT: "stride_active_workout",
  COMPLETED_WORKOUT: "stride_completed_workout",
  HISTORY: "stride_history",
  STREAK: "stride_streak",
  STREAK_LAST_ACTIVITY: "stride_streak_last_activity",
  STREAK_STATE: "stride_streak_state",
  USER: "stride_user",
  LAST_LOCATION: "stride_last_location",
  SCHEMA_VERSION: "stride_schema_version",
});

/**
 * Values returned for known local-storage keys after validation.
 * @typedef {Object} StorageValueMap
 * @property {Workout|null} stride_active_workout
 * @property {Workout|null} stride_completed_workout
 * @property {HistoryItem[]} stride_history
 * @property {number|string|null} stride_streak
 * @property {string|null} stride_streak_last_activity
 * @property {StoredStreakState|null} stride_streak_state
 * @property {UserProfile|null} stride_user
 * @property {Coordinate|null} stride_last_location
 * @property {number|string|null} stride_schema_version
 */

/**
 * Monotonic version of the persisted data shape. Every shape change must have
 * an additive or backward-compatible step in `migrateStoredSchema`.
 * @type {number}
 */
export const SCHEMA_VERSION = 2;

/**
 * Create a collision-resistant id for a workout record.
 * @returns {string}
 */
export const createWorkoutId = function () {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return `workout_${randomUUID.call(globalThis.crypto)}`;
  }
  return `workout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

/**
 * Return a stable identifier for a workout, including legacy records created
 * before workout IDs were persisted. The legacy fallback is deterministic so
 * retries after a partial save deduplicate the same history entry.
 * @param {Workout} workout
 * @returns {string}
 */
export const getWorkoutId = function (workout) {
  return workout.id || `workout_legacy_${workout.startTime}`;
};

/** Hard ceiling on persisted history entries (defends against quota exhaustion). */
export const HISTORY_LIMIT = 50;

/** Bound raw history entries inspected when sanitizing corrupt stored arrays. */
const HISTORY_RAW_SCAN_LIMIT = HISTORY_LIMIT * 4;

/** Hard ceiling on persisted/decimated GPS route points. */
export const ROUTE_POINT_LIMIT = 500;

export const SPORTS = /** @type {const} */ ({
  RUN: "run",
  RIDE: "ride",
});

export const GOAL_TYPES = /** @type {const} */ ({
  DISTANCE: "distance",
  TIME: "time",
});

/**
 * Shared display and validation settings for workout targets.
 * @type {Record<'distance'|'time', { defaultValue: string, unit: string, step: number, min: number, max: number }>}
 */
export const GOAL_TARGETS = {
  [GOAL_TYPES.DISTANCE]: {
    defaultValue: "5.0",
    unit: "km",
    step: 0.5,
    min: 0.5,
    max: 100,
  },
  [GOAL_TYPES.TIME]: {
    defaultValue: "30",
    unit: "min",
    step: 1,
    min: 1,
    max: 720,
  },
};

/**
 * Format total seconds into MM:SS or HH:MM:SS
 * @param {number} totalSeconds
 * @returns {string}
 */
export const formatTime = function (totalSeconds) {
  const parsedSeconds = Number(totalSeconds);
  const safeSeconds = Number.isFinite(parsedSeconds)
    ? Math.max(0, Math.floor(parsedSeconds))
    : 0;
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
  const parsedKm = Number(distanceKm);
  const safeKm = Number.isFinite(parsedKm) ? Math.max(0, parsedKm) : 0;
  return `${safeKm.toFixed(1)} km`;
};

/** @param {Date} date @returns {number} */
const startOfLocalDay = function (date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Format a workout timestamp for the history log.
 * Relative labels are only emitted for today/yesterday; older entries keep the
 * current year so the label never becomes ambiguous across year boundaries.
 * @param {number} startedAtMs
 * @returns {string} "" when the timestamp is unusable
 */
export const formatHistoryDate = function (startedAtMs) {
  const at = Number(startedAtMs);
  const when = new Date(at);
  if (!Number.isFinite(at) || Number.isNaN(when.getTime())) return "";

  const time = when.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayDelta = Math.round(
    (startOfLocalDay(new Date()) - startOfLocalDay(when)) / 86400000,
  );

  if (dayDelta === 0) return `Today · ${time}`;
  if (dayDelta === 1) return `Yesterday · ${time}`;

  const dateLabel = when.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year:
      when.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  return `${dateLabel} · ${time}`;
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
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
  const R = 6371; // Earth radius in km
  /** @param {number} deg @returns {number} */
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const safeA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
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
  sport,
) {
  const parsedKm = Number(distanceKm);
  const parsedSec = Number(elapsedSeconds);
  const safeKm = Number.isFinite(parsedKm) ? Math.max(0, parsedKm) : 0;
  const safeSec = Number.isFinite(parsedSec) ? Math.max(0, parsedSec) : 0;

  if (sport === SPORTS.RIDE) {
    const speedKmh =
      safeSec > 0 ? (safeKm / (safeSec / 3600)).toFixed(1) : "0.0";
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
  const settings = GOAL_TARGETS[goal] || GOAL_TARGETS[GOAL_TYPES.DISTANCE];
  const parsed = parseFloat(String(rawValue));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(settings.defaultValue);
  }
  return Math.min(Math.max(parsed, settings.min), settings.max);
};

/**
 * Whitelist sport against valid domain options
 * @param {unknown} rawSport
 * @returns {Sport}
 */
export const sanitizeSport = function (rawSport) {
  return rawSport === SPORTS.RIDE ? SPORTS.RIDE : SPORTS.RUN;
};

/**
 * Whitelist workout goal against valid domain options
 * @param {unknown} rawGoal
 * @returns {GoalType}
 */
export const sanitizeGoal = function (rawGoal) {
  return rawGoal === GOAL_TYPES.TIME ? GOAL_TYPES.TIME : GOAL_TYPES.DISTANCE;
};

/** @param {unknown} coordinate @returns {coordinate is Coordinate} */
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

/**
 * Reduce a coordinate array to at most `maxPoints`, always preserving the first
 * and last points so the drawn route keeps its true start and finish.
 * Shared by the live tracker and both persistence paths (CWE-400).
 * @param {Coordinate[]} coordinates
 * @param {number} [maxPoints]
 * @returns {Coordinate[]}
 */
export const decimateRoute = function (
  coordinates,
  maxPoints = ROUTE_POINT_LIMIT,
) {
  if (!Array.isArray(coordinates)) return [];
  const limit = Math.max(2, Math.floor(Number(maxPoints) || ROUTE_POINT_LIMIT));
  if (coordinates.length <= limit) return coordinates;

  // Uniform index sampling: always emits exactly `limit` points including the
  // first and last. The previous `index % step` filter kept only ~half the
  // requested points for arrays just over the limit (501 -> 251).
  const lastIndex = coordinates.length - 1;
  /** @type {Coordinate[]} */
  const decimated = [];
  for (let i = 0; i < limit; i++) {
    decimated.push(coordinates[Math.round((i * lastIndex) / (limit - 1))]);
  }
  return decimated;
};

/** Upper bound on raw coordinate scanning before decimation bounds output. */
export const ROUTE_RAW_SCAN_LIMIT = ROUTE_POINT_LIMIT * 4;

/** @param {unknown} coordinates @returns {Coordinate[]} */
const sanitizeRouteCoords = function (coordinates) {
  if (!Array.isArray(coordinates)) return [];
  // Bound raw entries inspected as well as valid points collected. An array
  // containing only invalid entries must not force a full scan on every read.
  const valid = [];
  const scanLimit = Math.min(coordinates.length, ROUTE_RAW_SCAN_LIMIT);
  for (let index = 0; index < scanLimit; index++) {
    const coordinate = coordinates[index];
    if (isValidCoordinate(coordinate)) {
      valid.push(coordinate);
    }
  }
  return decimateRoute(valid);
};

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {Workout|null}
 */
const sanitizeWorkout = function (value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (
    typeof record.startTime !== "number" ||
    !Number.isFinite(record.startTime) ||
    record.startTime <= 0
  ) {
    return null;
  }

  const status = record.status;
  if (status !== "in_progress" && status !== "complete") return null;
  if (key === STORAGE_KEYS.COMPLETED_WORKOUT && status !== "complete")
    return null;

  const goal = sanitizeGoal(record.goal);
  const sport = sanitizeSport(record.sport);
  return {
    ...(typeof record.id === "string" ? { id: record.id.slice(0, 64) } : {}),
    sport,
    sportLabel: sport === SPORTS.RIDE ? "Riding" : "Running",
    goal,
    targetValue: sanitizeTarget(
      typeof record.targetValue === "string" ||
        typeof record.targetValue === "number"
        ? record.targetValue
        : "",
      goal,
    ),
    targetUnit: goal === GOAL_TYPES.TIME ? "min" : "km",
    startTime: record.startTime,
    status,
    saved: record.saved === true,
    routeCoords: sanitizeRouteCoords(record.routeCoords),
    gpsDistanceKm:
      typeof record.gpsDistanceKm === "number" &&
      Number.isFinite(record.gpsDistanceKm) &&
      record.gpsDistanceKm >= 0
        ? record.gpsDistanceKm
        : 0,
    ...(typeof record.endTime === "number" &&
    Number.isFinite(record.endTime) &&
    record.endTime >= record.startTime
      ? { endTime: record.endTime }
      : {}),
    ...(typeof record.elapsedSeconds === "number" &&
    Number.isFinite(record.elapsedSeconds) &&
    record.elapsedSeconds >= 0
      ? { elapsedSeconds: record.elapsedSeconds }
      : {}),
    ...(typeof record.distanceKm === "number" &&
    Number.isFinite(record.distanceKm) &&
    record.distanceKm >= 0
      ? { distanceKm: record.distanceKm }
      : {}),
    ...(typeof record.finalDuration === "string"
      ? { finalDuration: record.finalDuration.slice(0, 32) }
      : {}),
    ...(typeof record.finalDistance === "string"
      ? { finalDistance: record.finalDistance.slice(0, 32) }
      : {}),
    ...(typeof record.efficiencyValue === "string"
      ? { efficiencyValue: record.efficiencyValue.slice(0, 32) }
      : {}),
    ...(typeof record.efficiencyLabel === "string"
      ? { efficiencyLabel: record.efficiencyLabel.slice(0, 32) }
      : {}),
    ...(typeof record.targetReached === "boolean"
      ? { targetReached: record.targetReached }
      : {}),
  };
};

/** Coerce legacy/unknown scalars to bounded, printable text. */
/** @param {unknown} value @returns {string} */
const toText = function (value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

/**
 * Recover a numeric distance from a legacy `"5.0 km"` label.
 * @param {unknown} label
 * @returns {number|null}
 */
const parseDistanceLabel = function (label) {
  const match = toText(label)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*km$/i);
  if (!match) return null;
  const distanceKm = Number(match[1]);
  return Number.isFinite(distanceKm) ? distanceKm : null;
};

/**
 * Recover elapsed seconds from a legacy `formatTime` label ("MM:SS" or "HH:MM:SS").
 * @param {unknown} label
 * @returns {number|null}
 */
const parseDurationLabel = function (label) {
  const match = toText(label)
    .trim()
    .match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const elapsedSeconds = match[3]
    ? Number(match[3]) + Number(match[2]) * 60 + Number(match[1]) * 3600
    : Number(match[2]) + Number(match[1]) * 60;
  return elapsedSeconds > 0 ? elapsedSeconds : null;
};

/**
 * Normalize one history entry onto the v1 shape: distance/duration as numbers,
 * and a real timestamp when one exists. Legacy entries persisted `date` as a
 * display string with no year, so it cannot be converted without inventing
 * data; it is preserved verbatim as `dateLabel`.
 * @param {unknown} item
 * @returns {HistoryItem|null} null when the entry is unusable
 */
const sanitizeHistoryItem = function (item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = /** @type {Record<string, unknown>} */ (item);

  const startedAtMs =
    typeof record.startedAtMs === "number" &&
    Number.isFinite(record.startedAtMs) &&
    record.startedAtMs > 0
      ? Math.floor(record.startedAtMs)
      : null;

  const distanceKm =
    typeof record.distanceKm === "number" &&
    Number.isFinite(record.distanceKm) &&
    record.distanceKm >= 0
      ? record.distanceKm
      : parseDistanceLabel(record.distance);

  const elapsedSeconds =
    typeof record.elapsedSeconds === "number" &&
    Number.isFinite(record.elapsedSeconds) &&
    record.elapsedSeconds > 0
      ? Math.floor(record.elapsedSeconds)
      : parseDurationLabel(record.duration);

  return {
    id: typeof record.id === "string" ? record.id.slice(0, 64) : "",
    title: sanitizeString(toText(record.title), 80) || "Workout",
    sport: sanitizeSport(record.sport),
    startedAtMs,
    // Empty when `startedAtMs` is known: the label is derived at render time.
    dateLabel:
      startedAtMs === null
        ? sanitizeString(toText(record.dateLabel ?? record.date), 40)
        : "",
    distanceKm,
    elapsedSeconds,
    efficiencyValue: sanitizeString(toText(record.efficiencyValue), 16),
    efficiencyLabel: sanitizeString(toText(record.efficiencyLabel), 32),
  };
};

/** Bound, validate, and normalize the whole history array on every read. */
/** @param {unknown} value @returns {HistoryItem[]} */
const sanitizeHistory = function (value) {
  if (!Array.isArray(value)) return [];
  // Bound raw entries inspected as well as valid items collected. Injected
  // arrays with mostly invalid entries must not saturate the main thread.
  /** @type {HistoryItem[]} */
  const bounded = [];
  const scanLimit = Math.min(value.length, HISTORY_RAW_SCAN_LIMIT);
  for (let index = 0; index < scanLimit; index++) {
    const candidate = value[index];
    const item = sanitizeHistoryItem(candidate);
    if (item) {
      bounded.push(item);
      if (bounded.length >= HISTORY_LIMIT) break;
    }
  }
  return bounded;
};

/** @param {unknown} value @returns {StoredStreakState|null} */
const sanitizeStreakState = function (value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (
    typeof record.count !== "number" ||
    !Number.isFinite(record.count) ||
    record.count < 0 ||
    (typeof record.lastActivity !== "string" && record.lastActivity !== null)
  ) {
    return null;
  }
  return {
    count: Math.floor(record.count),
    lastActivity: record.lastActivity,
  };
};

/** @param {unknown} value @returns {UserProfile|null} */
const sanitizeUserProfile = function (value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const username = sanitizeString(toText(record.username), 50);
  const email = sanitizeString(toText(record.email), 100);
  if (!username || !email) return null;

  const createdAt =
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    record.createdAt >= 0
      ? record.createdAt
      : 0;
  const updatedAt =
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt) &&
    record.updatedAt >= 0
      ? record.updatedAt
      : createdAt;
  return { username, email, createdAt, updatedAt };
};

/**
 * Validate one persisted value before it reaches an application consumer.
 * @param {keyof StorageValueMap} key
 * @param {unknown} value
 * @returns {unknown}
 */
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
  if (key === STORAGE_KEYS.HISTORY) {
    return sanitizeHistory(value);
  }
  if (key === STORAGE_KEYS.STREAK_STATE) {
    return sanitizeStreakState(value);
  }
  if (key === STORAGE_KEYS.USER) {
    return sanitizeUserProfile(value);
  }
  if (key === STORAGE_KEYS.STREAK) {
    return typeof value === "number" || typeof value === "string"
      ? value
      : null;
  }
  if (key === STORAGE_KEYS.STREAK_LAST_ACTIVITY) {
    return typeof value === "string" ? value : null;
  }
  if (key === STORAGE_KEYS.SCHEMA_VERSION) {
    return typeof value === "number" || typeof value === "string"
      ? value
      : null;
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
  // eslint-disable-next-line no-control-regex -- control characters are exactly what must be stripped
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, maxLength);
};

/**
 * Safely parse JSON strings with reviver guarding against Prototype Pollution (CWE-1321)
 * @param {string} raw
 * @returns {unknown|null}
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
/** @type {Map<string, unknown>} */
const memoryStorageFallback = new Map();
/** @type {Set<string>} */
const failedStorageWrites = new Set();

/**
 * Safely parse JSON from localStorage with prototype pollution protection and memory fallback
 * @template {keyof StorageValueMap} K
 * @param {K} key
 * @returns {StorageValueMap[K]}
 */
export const getStorageItem = function (key) {
  /** @param {unknown} value @returns {StorageValueMap[K]} */
  const validate = (value) =>
    /** @type {StorageValueMap[K]} */ (validateStoredValue(key, value));

  // A failed write makes the in-memory value newer than any persisted value.
  if (failedStorageWrites.has(key)) {
    return validate(memoryStorageFallback.get(key) ?? null);
  }

  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (parsed !== null) return validate(parsed);
    }
    return validate(memoryStorageFallback.get(key) ?? null);
  } catch (err) {
    console.warn(
      `Storage access restricted for ${key}, falling back to memory:`,
      err,
    );
    return validate(memoryStorageFallback.get(key) ?? null);
  }
};

/**
 * Safely write JSON to localStorage with quota-exceeded mitigation and memory fallback
 * @template {keyof StorageValueMap} K
 * @param {K} key
 * @param {StorageValueMap[K]} value
 * @returns {boolean} true when persisted to localStorage, false for memory-only fallback
 */
export const setStorageItem = function (key, value) {
  try {
    const hasLocalStorage = typeof localStorage !== "undefined";
    if (hasLocalStorage) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    memoryStorageFallback.set(key, value);
    failedStorageWrites.delete(key);
    return hasLocalStorage;
  } catch (err) {
    memoryStorageFallback.set(key, value);
    failedStorageWrites.add(key);
    console.warn(
      `Storage write restricted for ${key}, using in-memory state:`,
      err,
    );
    try {
      // Last-resort quota mitigation: prune older history so the current
      // write can succeed. Logged so data loss is visible, never silent.
      const history = getStorageItem(STORAGE_KEYS.HISTORY);
      if (Array.isArray(history) && history.length > 10) {
        console.warn(
          `Storage full: pruning history from ${history.length} to 10 entries to fit the new value.`,
        );
        const prunedHistory =
          key === STORAGE_KEYS.HISTORY && Array.isArray(value)
            ? value.slice(0, 10)
            : history.slice(0, 10);
        localStorage.setItem(
          STORAGE_KEYS.HISTORY,
          JSON.stringify(prunedHistory),
        );
        memoryStorageFallback.set(STORAGE_KEYS.HISTORY, prunedHistory);
        failedStorageWrites.delete(STORAGE_KEYS.HISTORY);
        if (key !== STORAGE_KEYS.HISTORY) {
          localStorage.setItem(key, JSON.stringify(value));
        }
        failedStorageWrites.delete(key);
        return true;
      }
    } catch (recoveryError) {
      console.warn(
        `Storage quota recovery failed for ${key}; keeping the value in memory:`,
        recoveryError,
      );
    }
    return false;
  }
};

/**
 * Remove a key from localStorage and the in-memory fallback.
 * Used to drop privacy-sensitive state once it is no longer needed.
 * @param {keyof StorageValueMap} key
 */
export const removeStorageItem = function (key) {
  memoryStorageFallback.delete(key);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
    failedStorageWrites.delete(key);
  } catch (err) {
    // Keep a tombstone so a stale persisted value cannot reappear on the next
    // read when removal is denied but reads still work.
    memoryStorageFallback.set(key, null);
    failedStorageWrites.add(key);
    console.warn(`Storage removal restricted for ${key}:`, err);
  }
};

/**
 * Resolve the workout the Complete/Streak screens should summarize.
 * Returns null while a session is still in progress, or when none exists.
 * Single source of truth for "which workout is on screen".
 * @returns {Workout|null}
 */
export const getCurrentWorkout = function () {
  const activeWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  const completedWorkout = getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT);

  if (activeWorkout?.status === "complete") return activeWorkout;
  if (activeWorkout?.status === "in_progress") {
    return isSameWorkoutSession(activeWorkout, completedWorkout) &&
      completedWorkout?.status === "complete"
      ? completedWorkout
      : null;
  }
  return completedWorkout?.status === "complete" ? completedWorkout : null;
};

/**
 * Compare workout identity, falling back to start time only for legacy records
 * where neither record has an id.
 * @param {Workout|null} first
 * @param {Workout|null} second
 * @returns {boolean}
 */
export const isSameWorkoutSession = function (first, second) {
  if (!first || !second) return false;
  if (first.id || second.id) {
    return Boolean(first.id && second.id && first.id === second.id);
  }
  return first.startTime === second.startTime;
};

/**
 * Persist the completed session to both recovery slots.
 * At least one durable copy is enough for the completion screen to recover it.
 * @param {Workout} workout
 * @returns {boolean} whether either record was persisted
 */
export const persistCompletedWorkout = function (workout) {
  const completedPersisted = setStorageItem(
    STORAGE_KEYS.COMPLETED_WORKOUT,
    workout,
  );
  const activePersisted = setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
  return completedPersisted || activePersisted;
};

/**
 * Migrate persisted state up to SCHEMA_VERSION. Idempotent, so it is safe to
 * call on every boot; returns immediately once the marker matches.
 *
 * v0 -> v1: history entries moved from display-only strings to numeric
 * distance/duration plus a real start timestamp.
 * v1 -> v2: copy the legacy two-key streak into one atomic state record.
 */
export const migrateStoredSchema = function () {
  const rawStored = Number(getStorageItem(STORAGE_KEYS.SCHEMA_VERSION));
  const stored =
    Number.isFinite(rawStored) && rawStored > 0 ? Math.floor(rawStored) : 0;
  if (Number.isFinite(stored) && stored >= SCHEMA_VERSION) return false;

  if (stored < 1) {
    const history = getStorageItem(STORAGE_KEYS.HISTORY);
    if (history.length > 0) {
      setStorageItem(STORAGE_KEYS.HISTORY, history);
    }
  }
  if (stored < 2) {
    const existingStreakState = getStorageItem(STORAGE_KEYS.STREAK_STATE);
    if (existingStreakState === null) {
      const streak = Number(getStorageItem(STORAGE_KEYS.STREAK));
      const lastActivity = getStorageItem(STORAGE_KEYS.STREAK_LAST_ACTIVITY);
      if (
        Number.isFinite(streak) &&
        streak >= 0 &&
        typeof lastActivity === "string"
      ) {
        setStorageItem(STORAGE_KEYS.STREAK_STATE, {
          count: Math.floor(streak),
          lastActivity,
        });
      }
    }
  }
  setStorageItem(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  return true;
};
