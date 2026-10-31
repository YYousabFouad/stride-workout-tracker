/**
 * Stride Workout Tracker — GPS Route Math
 * Pure, side-effect-free helpers for measuring and smoothing GPS steps.
 * Distance measurement must always span raw-fix to raw-fix: deriving the step
 * from the *display* (smoothed) polyline makes smoothing lag re-count real
 * distance on every fix and inflates totals.
 */

import { calculateHaversineKm } from "./storage.js";

export const MIN_STEP_DISTANCE_KM = 0.007; // 7m deadband (micro-jitter & drift filter)
export const MAX_ACCEPTABLE_ACCURACY_M = 35; // Discard noisy satellite multipath spikes
export const SMOOTHING_WEIGHT = 0.45; // EMA display filter weight

/**
 * @param {unknown} coord
 * @returns {coord is [number, number]}
 */
const isCoordinate = function (coord) {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1])
  );
};

/**
 * Evaluate one GPS fix against the previous accepted raw fix.
 * @param {unknown} prevRawCoord Last accepted raw fix (measurement anchor).
 * @param {unknown} prevDisplayPoint Last point appended to the display polyline.
 * @param {unknown} coords New raw fix.
 * @param {{ minStepKm?: number, smoothingWeight?: number }} [options]
 * @returns {{ stepKm: number, displayPoint: [number, number] } | null}
 *   null when either fix is malformed or the step is inside the deadband;
 *   otherwise the raw-to-raw step distance and the EMA display point.
 */
export const acceptGpsStep = function (
  prevRawCoord,
  prevDisplayPoint,
  coords,
  options = {},
) {
  if (!isCoordinate(coords)) return null;

  const minStepKm = Number(options.minStepKm ?? MIN_STEP_DISTANCE_KM);
  const smoothingWeight = Number(options.smoothingWeight ?? SMOOTHING_WEIGHT);
  const weight = Math.min(1, Math.max(0, smoothingWeight));

  // First accepted fix: anchor measurement, display stays identical to raw.
  if (!isCoordinate(prevRawCoord)) {
    return { stepKm: 0, displayPoint: [coords[0], coords[1]] };
  }

  const stepKm = calculateHaversineKm(prevRawCoord, coords);
  if (!Number.isFinite(stepKm) || stepKm < minStepKm) return null;

  const smoothingBase = isCoordinate(prevDisplayPoint)
    ? prevDisplayPoint
    : prevRawCoord;
  return {
    stepKm,
    displayPoint: [
      Number(
        (smoothingBase[0] + weight * (coords[0] - smoothingBase[0])).toFixed(6),
      ),
      Number(
        (smoothingBase[1] + weight * (coords[1] - smoothingBase[1])).toFixed(6),
      ),
    ],
  };
};
