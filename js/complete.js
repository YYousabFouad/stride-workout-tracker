/**
 * Stride Workout Tracker — Workout Complete Screen (complete.html)
 * Displays workout summary, saves results to history, and awards streak increases.
 */

import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
} from "./storage.js";
import { incrementStreak } from "./streak.js";

export const initCompleteScreen = function () {
  const viewComplete = document.getElementById("view-complete");
  if (!viewComplete) return;

  const workout =
    getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT) ||
    getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  const distVal = document.getElementById("complete-distance-val");
  const timeVal = document.getElementById("complete-time-val");
  const saveWorkoutBtn = document.getElementById("btn-save-workout");
  const alertModal = document.getElementById("modal-alert");

  if (workout) {
    if (distVal) distVal.textContent = workout.finalDistance || "0.0 km";
    if (timeVal) timeVal.textContent = workout.finalDuration || "00:00";
  }

  // Modal alert close handling
  if (alertModal) {
    alertModal.querySelectorAll(".modal-close-btn, .btn-primary").forEach((btn) => {
      btn.addEventListener("click", () => {
        alertModal.classList.remove("active");
      });
    });
  }

  // Save Workout & Update Streak
  if (saveWorkoutBtn) {
    saveWorkoutBtn.addEventListener("click", function () {
      if (saveWorkoutBtn.disabled) return;

      const newStreak = incrementStreak();

      // Append to workout history
      const historyList = getStorageItem(STORAGE_KEYS.HISTORY) || [];
      const historyItem = {
        title: workout ? `${workout.sportLabel} Session` : "Morning Run",
        date: "Today · Just now",
        distance: workout ? workout.finalDistance || "0.0 km" : "0.0 km",
        duration: workout ? workout.finalDuration || "00:00" : "00:00",
        sport: workout ? workout.sport : "run",
      };
      historyList.unshift(historyItem);
      setStorageItem(STORAGE_KEYS.HISTORY, historyList);

      saveWorkoutBtn.disabled = true;
      saveWorkoutBtn.innerHTML = `<span>Workout Saved! Streak: ${newStreak} Days ✓</span>`;
    });
  }
};
