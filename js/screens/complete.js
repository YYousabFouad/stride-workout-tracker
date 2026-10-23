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

  const activeWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  const completedWorkout = getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT);
  const workout =
    activeWorkout?.status === "complete"
      ? activeWorkout
      : activeWorkout?.status === "in_progress"
        ? null
        : completedWorkout?.status === "complete"
          ? completedWorkout
          : null;

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
      const summaryMap = L.map("complete-map-viewport", {
        preferCanvas: true,
      }).setView(workout.routeCoords[0], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(summaryMap);

      // Outer casing (Google Maps crisp ruler-drawn border outline)
      L.polyline(workout.routeCoords, {
        color: "#050b0c",
        weight: 9,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
        smoothFactor: 1.5,
      }).addTo(summaryMap);

      const polyline = L.polyline(workout.routeCoords, {
        color: "#bbf448",
        weight: 5,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
        smoothFactor: 1.5,
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

  if (!workout && saveWorkoutBtn) {
    saveWorkoutBtn.disabled = true;
    saveWorkoutBtn.textContent = "No completed workout to save";
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
    if (!workout || !saveWorkoutBtn || saveWorkoutBtn.disabled || workout.saved) return;

    workout.saved = true;

    // Decimate route coordinates if excessively large to prevent localStorage QuotaExceededError (CWE-400)
    if (Array.isArray(workout.routeCoords) && workout.routeCoords.length > 500) {
      const step = Math.ceil(workout.routeCoords.length / 500);
      workout.routeCoords = workout.routeCoords.filter((_, idx) => idx % step === 0);
    }

    setStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT, workout);
    setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);

    const newStreak = incrementStreak();

    const sport = workout.sport || SPORTS.RUN;
    const distanceKm = Number(workout.distanceKm) || 0;
    const elapsedSeconds = Number(workout.elapsedSeconds) || 0;
    const fallbackEfficiency = calculateEfficiencyMetric(
      distanceKm,
      elapsedSeconds,
      sport
    );

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Append to workout history with bounded size (max 50 recent items to prevent storage exhaustion)
    const storedHistory = getStorageItem(STORAGE_KEYS.HISTORY);
    const historyList = Array.isArray(storedHistory) ? storedHistory : [];
    const historyItem = {
      id: workout.id || `workout_${Date.now()}`,
      title: `${workout.sportLabel || "Running"} Session`,
      date: `Today · ${timeStr}`,
      distance: workout.finalDistance || "0.0 km",
      duration: workout.finalDuration || "00:00",
      efficiencyValue: workout?.efficiencyValue || fallbackEfficiency.value,
      efficiencyLabel: workout?.efficiencyLabel || fallbackEfficiency.label,
      sport,
    };
    historyList.unshift(historyItem);
    const boundedHistory = historyList.slice(0, 50);
    setStorageItem(STORAGE_KEYS.HISTORY, boundedHistory);

    saveWorkoutBtn.disabled = true;
    saveWorkoutBtn.innerHTML = `<span>Workout Saved! Streak: ${newStreak} Days ✓</span>`;
  };

  if (saveWorkoutBtn) {
    saveWorkoutBtn.addEventListener("click", function () {
      if (saveWorkoutBtn.disabled || workout?.saved) return;

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

  document.addEventListener("stride:account-cancelled", function () {
    waitingForAccount = false;
  });
};
