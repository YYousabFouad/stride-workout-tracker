import assert from "node:assert/strict";
import { test } from "node:test";
import { getWorkoutCompletionSnapshot } from "../js/core/workout-completion.js";

const workout = {
  id: "workout-1",
  sport: "run",
  sportLabel: "Running",
  goal: "distance",
  targetValue: 5,
  targetUnit: "km",
  startTime: 1000,
  status: "in_progress",
  saved: false,
  routeCoords: [[30, 31]],
  gpsDistanceKm: 1,
};

test("completion retry reuses the frozen time, distance, route and target state", () => {
  const first = getWorkoutCompletionSnapshot(
    { ...workout },
    { elapsedSeconds: 600, distanceKm: 1.25, percent: 25 },
    [
      [30, 31],
      [30.01, 31.01],
    ],
    2000,
  );
  const retry = getWorkoutCompletionSnapshot(
    { ...workout, ...first, status: "complete" },
    { elapsedSeconds: 900, distanceKm: 0, percent: 100 },
    [],
    3000,
  );

  assert.deepEqual(retry, first);
});

test("first completion falls back to the workout route when live route is empty", () => {
  const snapshot = getWorkoutCompletionSnapshot(
    workout,
    { elapsedSeconds: 600, distanceKm: 1.25, percent: 100 },
    [],
    2000,
  );

  assert.deepEqual(snapshot.routeCoords, workout.routeCoords);
  assert.equal(snapshot.targetReached, true);
});
