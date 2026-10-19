/**
 * Stride Workout Tracker — Workout In Progress Screen (progress.html)
 * Coordinates live metrics, time elapsed counters, progress bar, and completion routing.
 */

import {
  STORAGE_KEYS,
  formatTime,
  getStorageItem,
  setStorageItem,
} from "./storage.js";

let workoutTimerInterval = null;

export const initProgressScreen = function () {
  const viewProgress = document.getElementById("view-progress");
  if (!viewProgress) return;

  const workout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  const metaTag =
    document.getElementById("live-meta-tag") ||
    document.querySelector(".workout-meta-tag span:not(.status-dot)");
  const targetHint =
    document.getElementById("live-target-hint") ||
    document.querySelector("#view-progress .form-hint.u-text-center");
  const liveDistance = document.getElementById("live-distance-val");
  const liveTime = document.getElementById("live-time-val");
  const progressPercent =
    document.getElementById("live-progress-percent") ||
    document.querySelector(".progress-header .u-text-brand");
  const progressBar =
    document.getElementById("live-progress-bar") ||
    document.querySelector(".progress-track .progress-bar");
  const endWorkoutBtn = document.getElementById("btn-end-workout");

  // Always reset to initial 0 state
  if (liveDistance) liveDistance.textContent = "0.0 km";
  if (liveTime) liveTime.textContent = "00:00";
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressBar) progressBar.style.width = "0%";

  if (!workout || workout.status === "complete") {
    if (metaTag) metaTag.textContent = "Running · 5.0 km target";
    if (targetHint) {
      targetHint.textContent =
        "No workout currently in progress. Start a workout from Plan Workout!";
    }
    return;
  }

  // Populate Meta Tag & Hint
  if (metaTag) {
    metaTag.textContent = `${workout.sportLabel} · ${workout.targetValue} ${workout.targetUnit} target`;
  }
  if (targetHint) {
    targetHint.textContent = `You will be alerted immediately when reaching ${workout.targetValue} ${workout.targetUnit}`;
  }

  // Visual highlight on target metric
  if (workout.goal === "time") {
    if (liveDistance) liveDistance.classList.remove("highlight");
    if (liveTime) liveTime.classList.add("highlight");
  } else {
    if (liveDistance) liveDistance.classList.add("highlight");
    if (liveTime) liveTime.classList.remove("highlight");
  }

  // Clear any existing timer to prevent leaks
  if (workoutTimerInterval) {
    clearInterval(workoutTimerInterval);
    workoutTimerInterval = null;
  }

  // Timer: "if it's time start a timer and don't do anything to kilometers"
  if (workout.goal === "time") {
    const targetSeconds = (Number(workout.targetValue) || 30) * 60;

    const updateTimer = function () {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - workout.startTime) / 1000)
      );
      if (liveTime) liveTime.textContent = formatTime(elapsedSeconds);

      const percent = Math.min(
        100,
        Math.floor((elapsedSeconds / targetSeconds) * 100)
      );
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (progressBar) progressBar.style.width = `${percent}%`;

      if (percent >= 100 && targetHint) {
        targetHint.textContent = `Target reached! You completed ${workout.targetValue} ${workout.targetUnit} 🎉`;
      }
    };

    updateTimer();
    workoutTimerInterval = setInterval(updateTimer, 1000);
  }

  // End Workout
  if (endWorkoutBtn) {
    endWorkoutBtn.addEventListener("click", function () {
      if (workoutTimerInterval) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
      }
      workout.endTime = Date.now();
      workout.elapsedSeconds =
        workout.goal === "time"
          ? Math.max(0, Math.floor((Date.now() - workout.startTime) / 1000))
          : 0;
      workout.finalDuration = formatTime(workout.elapsedSeconds);
      workout.finalDistance = "0.0 km";
      workout.status = "complete";

      setStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT, workout);
      setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
      window.location.href = "complete.html";
    });
  }
};
