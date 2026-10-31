/**
 * Stride Workout Tracker — Completion snapshot helpers.
 * Keep retryable completion data stable after live tracking has stopped.
 */

/** @typedef {[number, number]} Coordinate */
/**
 * @typedef {Object} CompletionSnapshot
 * @property {number} endTime
 * @property {number} elapsedSeconds
 * @property {number} distanceKm
 * @property {Coordinate[]} routeCoords
 * @property {boolean} targetReached
 */

/**
 * Freeze the first completion measurement, or reuse it on a save retry.
 * Empty live route data falls back to the last route already stored on the
 * workout, which remains available after the map has been destroyed.
 * @param {import("./storage.js").Workout} workout
 * @param {{ elapsedSeconds: number, distanceKm: number, percent: number }} liveMetrics
 * @param {Coordinate[]} liveRouteCoords
 * @param {number} endedAtMs
 * @returns {CompletionSnapshot}
 */
export const getWorkoutCompletionSnapshot = function (
  workout,
  liveMetrics,
  liveRouteCoords,
  endedAtMs,
) {
  const isRetry = workout.status === "complete";
  const storedElapsed = workout.elapsedSeconds;
  const storedDistance = workout.distanceKm;
  const storedRoute = workout.routeCoords;

  return {
    endTime:
      isRetry && typeof workout.endTime === "number"
        ? workout.endTime
        : endedAtMs,
    elapsedSeconds:
      isRetry && typeof storedElapsed === "number"
        ? storedElapsed
        : liveMetrics.elapsedSeconds,
    distanceKm:
      isRetry && typeof storedDistance === "number"
        ? storedDistance
        : liveMetrics.distanceKm,
    routeCoords:
      isRetry && Array.isArray(storedRoute)
        ? storedRoute
        : liveRouteCoords.length > 0
          ? liveRouteCoords
          : storedRoute || [],
    targetReached: isRetry
      ? workout.targetReached === true
      : liveMetrics.percent >= 100,
  };
};
