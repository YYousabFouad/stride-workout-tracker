/**
 * Stride Workout Tracker — Workout Complete Screen (complete.html)
 * Displays workout summary, saves results to history, and awards streak increases.
 */

import {
  SPORTS,
  STORAGE_KEYS,
  calculateEfficiencyMetric,
  getStorageItem,
  setStorageItem,
} from "../core/storage.js";
import { getStreakCount, incrementStreak, updateStreakDisplay } from "../core/streak.js";

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
  const accountModal = document.getElementById("modal-account");

  if (workout) {
    if (distVal) distVal.textContent = workout.finalDistance || "0.0 km";
    if (timeVal) timeVal.textContent = workout.finalDuration || "00:00";

    const completeMapViewport = document.getElementById("complete-map-viewport");
    if (
      completeMapViewport &&
      typeof L !== "undefined" &&
      Array.isArray(workout.routeCoords) &&
      workout.routeCoords.length > 0
    ) {
      completeMapViewport.innerHTML = "";
      const summaryMap = L.map("complete-map-viewport").setView(
        workout.routeCoords[0],
        15
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(summaryMap);

      const polyline = L.polyline(workout.routeCoords, {
        color: "#bbf448",
        weight: 5,
        opacity: 0.95,
      }).addTo(summaryMap);

      L.circleMarker(workout.routeCoords[0], {
        radius: 6,
        color: "#060d0c",
        weight: 2,
        fillColor: "#bbf448",
        fillOpacity: 1,
      }).addTo(summaryMap);

      const endCoord = workout.routeCoords[workout.routeCoords.length - 1];
      L.circleMarker(endCoord, {
        radius: 7,
        color: "#060d0c",
        weight: 2,
        fillColor: "#00d9f5",
        fillOpacity: 1,
      }).addTo(summaryMap);

      if (workout.routeCoords.length > 1) {
        summaryMap.fitBounds(polyline.getBounds(), { padding: [32, 32] });
      }
      setTimeout(() => summaryMap.invalidateSize(), 100);
    }
  }

  updateStreakDisplay();

  // Modal alert close & celebration handling
  if (alertModal) {
    const closeAlertModal = () => alertModal.classList.remove("active");

    alertModal
      .querySelectorAll(".modal-close-btn, .btn-primary")
      .forEach((btn) => {
        btn.addEventListener("click", closeAlertModal);
      });

    alertModal.addEventListener("click", (e) => {
      if (e.target === alertModal) closeAlertModal();
    });

    if (workout && workout.targetReached && !workout.saved) {
      const metricEl = alertModal.querySelector(".achievement-metric");
      if (metricEl && workout.targetValue && workout.targetUnit) {
        metricEl.textContent = `${workout.targetValue} ${workout.targetUnit}`;
      }
      alertModal.classList.add("active");
    }
  }

  // Guard against duplicate saves on page reload
  if (saveWorkoutBtn && workout && workout.saved) {
    saveWorkoutBtn.disabled = true;
    saveWorkoutBtn.innerHTML = `<span>Workout Saved! Streak: ${getStreakCount()} Days ✓</span>`;
  }

  let waitingForAccount = false;

  // Save Workout & Update Streak
  const saveWorkout = function () {
    if (!saveWorkoutBtn || saveWorkoutBtn.disabled || (workout && workout.saved)) return;

    if (workout) {
      workout.saved = true;
      setStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT, workout);
      setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
    }

    const newStreak = incrementStreak();

    const sport = workout ? workout.sport : SPORTS.RUN;
    const distanceKm = workout ? Number(workout.distanceKm) || 0 : 0;
    const elapsedSeconds = workout ? Number(workout.elapsedSeconds) || 0 : 0;
    const fallbackEfficiency = calculateEfficiencyMetric(
      distanceKm,
      elapsedSeconds,
      sport
    );

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Append to workout history
    const historyList = getStorageItem(STORAGE_KEYS.HISTORY) || [];
    const historyItem = {
      id: workout?.id || `workout_${Date.now()}`,
      title: workout ? `${workout.sportLabel} Session` : "Morning Run",
      date: `Today · ${timeStr}`,
      distance: workout ? workout.finalDistance || "0.0 km" : "0.0 km",
      duration: workout ? workout.finalDuration || "00:00" : "00:00",
      efficiencyValue: workout?.efficiencyValue || fallbackEfficiency.value,
      efficiencyLabel: workout?.efficiencyLabel || fallbackEfficiency.label,
      sport,
    };
    historyList.unshift(historyItem);
    setStorageItem(STORAGE_KEYS.HISTORY, historyList);

    saveWorkoutBtn.disabled = true;
    saveWorkoutBtn.innerHTML = `<span>Workout Saved! Streak: ${newStreak} Days ✓</span>`;
  };

  if (saveWorkoutBtn) {
    saveWorkoutBtn.addEventListener("click", function () {
      if (saveWorkoutBtn.disabled || (workout && workout.saved)) return;

      if (!getStorageItem(STORAGE_KEYS.USER)) {
        waitingForAccount = true;
        if (accountModal) accountModal.classList.add("active");
        return;
      }
      saveWorkout();
    });
  }

  document.addEventListener("stride:account-created", function () {
    if (!waitingForAccount) return;
    waitingForAccount = false;
    saveWorkout();
  });
};
