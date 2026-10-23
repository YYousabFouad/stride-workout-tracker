/**
 * Stride Workout Tracker — Workout In Progress Screen (progress.html)
 * Coordinates live metrics, time elapsed counters, progress bar, 3D runner visualization, and completion routing.
 */

import {
  GOAL_TYPES,
  SPORTS,
  STORAGE_KEYS,
  calculateEfficiencyMetric,
  formatDistance,
  formatTime,
  getStorageItem,
  setStorageItem,
} from "../core/storage.js";
import { Runner3D } from "../visualizers/runner-3d.js?v=2";
import {
  destroyMap,
  getRouteData,
  loadMap,
  startRouteTracking,
  stopRouteTracking,
} from "../visualizers/map.js?v=2";

let workoutTimerInterval = null;
let telemetryInterval = null;
let runner3dInstance = null;

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

  // Visualizer DOM elements
  const runnerViewport = document.getElementById("runner-3d-viewport");
  const mapViewport = document.getElementById("map-viewport");
  const btnMode3d = document.getElementById("btn-mode-3d");
  const btnModeMap = document.getElementById("btn-mode-map");
  const vizTitle = document.getElementById("visualizer-card-title");
  const vizSubtitle = document.getElementById("visualizer-card-subtitle");
  const hudCadence = document.getElementById("runner-hud-cadence");
  const hudSpeed = document.getElementById("runner-hud-speed");

  const sport = workout?.sport || SPORTS.RUN;
  const isRide = sport === SPORTS.RIDE;
  const baseCadence = isRide ? 90 : 166;
  const baseSpeed = isRide ? 24.2 : 11.4;

  // =========================================================================
  // 1. Initialize 3D Runner & View Mode Switcher
  // =========================================================================
  if (runnerViewport && !runner3dInstance) {
    try {
      runner3dInstance = new Runner3D(runnerViewport);

      // Camera Preset Buttons
      const camBtns = runnerViewport.querySelectorAll(".cam-preset-btn");
      camBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          camBtns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const camMode = btn.getAttribute("data-cam");
          if (runner3dInstance) {
            runner3dInstance.applyCameraPreset(camMode, true);
          }
        });
      });
    } catch (err) {
      console.error("Failed to initialize 3D Runner:", err);
    }
  }

  // View Mode Switcher (3D Runner <-> GPS Route Map)
  if (btnMode3d && btnModeMap) {
    btnMode3d.addEventListener("click", () => {
      btnMode3d.classList.add("active");
      btnMode3d.setAttribute("aria-selected", "true");
      btnModeMap.classList.remove("active");
      btnModeMap.setAttribute("aria-selected", "false");

      if (runnerViewport) runnerViewport.style.display = "block";
      if (mapViewport) mapViewport.style.display = "none";
      if (vizTitle) vizTitle.textContent = "3D Live Runner";
      if (vizSubtitle)
        vizSubtitle.textContent = "Biomechanical pacing & speed telemetry";
      if (runner3dInstance) {
        runner3dInstance.start(true);
        runner3dInstance.resize();
      }
      startTelemetry();
    });

    btnModeMap.addEventListener("click", async () => {
      btnModeMap.classList.add("active");
      btnModeMap.setAttribute("aria-selected", "true");
      btnMode3d.classList.remove("active");
      btnMode3d.setAttribute("aria-selected", "false");

      if (mapViewport) mapViewport.style.display = "block";
      if (runnerViewport) runnerViewport.style.display = "none";
      if (vizTitle) vizTitle.textContent = "Live route";
      if (vizSubtitle) vizSubtitle.textContent = "GPS breadcrumb tracking";
      stopTelemetry();
      if (runner3dInstance) runner3dInstance.pause(true);
      loadMap();
    });

    // Auto-switch to map view if requested via URL param (?mode=map or #map)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("mode") === "map" || window.location.hash === "#map") {
      btnModeMap.click();
    }
  }

  // Biomechanical Telemetry Sync Loop (Active only when 3D Runner view is visible)
  const updateTelemetry = () => {
    if (!runner3dInstance) return;

    const now = Date.now();
    const cadence = Math.round(baseCadence + Math.sin(now / 3500) * 3);
    const speed = (baseSpeed + Math.cos(now / 4200) * 0.3).toFixed(1);

    runner3dInstance.setCadence(cadence);
    runner3dInstance.setSpeed(parseFloat(speed));

    if (hudCadence)
      hudCadence.textContent = `${cadence} ${isRide ? "RPM" : "SPM"}`;
    if (hudSpeed) hudSpeed.textContent = `${speed} km/h`;
  };

  const startTelemetry = () => {
    if (telemetryInterval) clearInterval(telemetryInterval);
    updateTelemetry();
    telemetryInterval = setInterval(updateTelemetry, 1500);
  };

  const stopTelemetry = () => {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  };

  startTelemetry();

  // =========================================================================
  // 2. Telemetry and Workout State
  // =========================================================================
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
  const isTimeGoal = workout.goal === GOAL_TYPES.TIME;
  if (isTimeGoal) {
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

  const targetValue = Number(workout.targetValue) || (isTimeGoal ? 30 : 5.0);
  const targetSeconds = isTimeGoal ? targetValue * 60 : 0;
  let gpsDistanceKm = Number(workout.gpsDistanceKm) || 0;
  let goalReachedStopped = false;

  // Start continuous GPS location & route polyline tracking
  startRouteTracking({
    initialCoords: workout.routeCoords || [],
    initialDistanceKm: gpsDistanceKm,
    onUpdate: ({ coords, distanceKm }) => {
      gpsDistanceKm = distanceKm;
      workout.routeCoords = coords;
      workout.gpsDistanceKm = Number(distanceKm.toFixed(3));
      setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
      updateWorkoutLoop();
    },
  });

  const computeLiveMetrics = function () {
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - workout.startTime) / 1000)
    );
    // Distance goals must reflect measured GPS movement. A speed estimate here
    // can otherwise complete a workout even when location access is unavailable.
    const distanceKm = gpsDistanceKm;
    const rawPercent = isTimeGoal
      ? (elapsedSeconds / targetSeconds) * 100
      : (distanceKm / targetValue) * 100;
    const percent = Math.min(100, Math.max(0, Math.floor(rawPercent)));

    return { elapsedSeconds, distanceKm, percent };
  };

  function updateWorkoutLoop() {
    const { elapsedSeconds, distanceKm, percent } = computeLiveMetrics();

    if (liveTime) liveTime.textContent = formatTime(elapsedSeconds);
    if (liveDistance) liveDistance.textContent = formatDistance(distanceKm);
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;

    if (percent >= 100) {
      if (!goalReachedStopped) {
        goalReachedStopped = true;
        stopRouteTracking();
      }
      if (targetHint) {
        targetHint.textContent = `Target reached! You completed ${workout.targetValue} ${workout.targetUnit} 🎉`;
      }
    }
  }

  updateWorkoutLoop();
  workoutTimerInterval = setInterval(updateWorkoutLoop, 1000);

  // End Workout
  if (endWorkoutBtn) {
    endWorkoutBtn.addEventListener("click", function () {
      if (workoutTimerInterval) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
      }
      stopTelemetry();
      stopRouteTracking();
      destroyMap();
      if (runner3dInstance) {
        runner3dInstance.destroy();
        runner3dInstance = null;
      }

      const { elapsedSeconds, distanceKm, percent } = computeLiveMetrics();
      const { coords } = getRouteData();
      const efficiency = calculateEfficiencyMetric(
        distanceKm,
        elapsedSeconds,
        workout.sport
      );

      workout.endTime = Date.now();
      workout.elapsedSeconds = elapsedSeconds;
      workout.distanceKm = Number(distanceKm.toFixed(2));

      // Decimate coordinate points if overly dense to prevent storage quota exhaustion
      if (Array.isArray(coords) && coords.length > 500) {
        const step = Math.ceil(coords.length / 500);
        workout.routeCoords = coords.filter((_, idx) => idx % step === 0);
      } else {
        workout.routeCoords = coords;
      }

      workout.finalDuration = formatTime(elapsedSeconds);
      workout.finalDistance = formatDistance(distanceKm);
      workout.efficiencyValue = efficiency.value;
      workout.efficiencyLabel = efficiency.label;
      workout.targetReached = percent >= 100;
      workout.status = "complete";

      setStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT, workout);
      setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
      window.location.href = "complete.html";
    });
  }

  // Cleanup on unload to prevent WebGL context and geolocation watcher leaks
  window.addEventListener("beforeunload", () => {
    if (workoutTimerInterval) clearInterval(workoutTimerInterval);
    stopTelemetry();
    stopRouteTracking();
    destroyMap();
    if (runner3dInstance) {
      runner3dInstance.destroy();
      runner3dInstance = null;
    }
  });
};
