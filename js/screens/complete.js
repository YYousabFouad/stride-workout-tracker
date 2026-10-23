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
import {
  addArrowToMap,
  clearNavigation,
  navigateToArrow,
  showCurrentLocation,
} from "../visualizers/map.js?v=2";

let summaryMapInstance = null;

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
      if (summaryMapInstance) {
        try {
          summaryMapInstance.remove();
        } catch (err) {
          console.warn("Error removing previous summaryMap:", err);
        }
        summaryMapInstance = null;
      }
      if (completeMapViewport._leaflet_id) {
        delete completeMapViewport._leaflet_id;
      }
      completeMapViewport.innerHTML = "";
      summaryMapInstance = L.map("complete-map-viewport", {
        preferCanvas: true,
      }).setView(workout.routeCoords[0], 15);
      const summaryMap = summaryMapInstance;
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

      // Listen for click events anywhere on the summary map using Leaflet's .on() API
      summaryMap.on("click", function (e) {
        if (!e || !e.latlng) return;
        addArrowToMap(summaryMap, e.latlng);
      });

      // Add floating controls and directions HUD banner
      completeMapViewport.insertAdjacentHTML(
        "beforeend",
        `
        <div class="map-hud-top">
          <div class="nav-directions-banner" id="complete-directions-banner" style="display: none;">
            <div class="nav-directions-left">
              <div class="nav-bearing-icon" title="Compass heading">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 19 21 12 17 5 21 12 2"/>
                </svg>
              </div>
              <div class="nav-directions-text">
                <div class="nav-direction-title">Head North · 300 m</div>
                <div class="nav-direction-meta">~2 min · Route</div>
              </div>
            </div>
            <button type="button" class="nav-directions-close" id="btn-complete-cancel-directions" title="Clear directions" aria-label="Clear directions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="map-controls-group">
          <button
            type="button"
            class="map-control-btn nav-target-btn"
            id="btn-complete-navigate"
            title="Get directions to arrow"
            aria-label="Get directions to arrow"
            style="display: none;"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </button>
          <button
            type="button"
            class="map-control-btn"
            id="btn-complete-locate"
            title="Show my current location"
            aria-label="Show my current location"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="locate-icon">
              <circle cx="12" cy="12" r="3"></circle>
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
            </svg>
          </button>
        </div>
      `
      );

      const completeLocateBtn =
        completeMapViewport.querySelector("#btn-complete-locate");
      if (completeLocateBtn) {
        completeLocateBtn.addEventListener("click", function (evt) {
          evt.stopPropagation();
          showCurrentLocation(summaryMap);
        });
      }

      const completeNavBtn =
        completeMapViewport.querySelector("#btn-complete-navigate");
      if (completeNavBtn) {
        completeNavBtn.addEventListener("click", function (evt) {
          evt.stopPropagation();
          navigateToArrow(summaryMap);
        });
      }

      const completeCancelBtn =
        completeMapViewport.querySelector("#btn-complete-cancel-directions");
      if (completeCancelBtn) {
        completeCancelBtn.addEventListener("click", function (evt) {
          evt.stopPropagation();
          clearNavigation(summaryMap);
        });
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

  window.addEventListener("beforeunload", () => {
    if (summaryMapInstance) {
      try {
        clearNavigation(summaryMapInstance);
        summaryMapInstance.remove();
      } catch (err) {
        // Silently ignore unload errors
      }
      summaryMapInstance = null;
    }
  });
};
