/**
 * Stride Workout Tracker — Workout In Progress Screen (progress.html)
 * Coordinates live metrics, time elapsed counters, progress bar, 3D runner visualization, and completion routing.
 */

import {
  STORAGE_KEYS,
  formatTime,
  getStorageItem,
  setStorageItem,
} from "./storage.js";
import { Runner3D } from "./runner-3d.js";

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
      if (vizSubtitle) vizSubtitle.textContent = "Biomechanical pacing & speed telemetry";
      if (runner3dInstance) runner3dInstance.start();
    });

    btnModeMap.addEventListener("click", () => {
      btnModeMap.classList.add("active");
      btnModeMap.setAttribute("aria-selected", "true");
      btnMode3d.classList.remove("active");
      btnMode3d.setAttribute("aria-selected", "false");

      if (mapViewport) mapViewport.style.display = "block";
      if (runnerViewport) runnerViewport.style.display = "none";
      if (vizTitle) vizTitle.textContent = "Live route";
      if (vizSubtitle) vizSubtitle.textContent = "GPS breadcrumb tracking";
      if (runner3dInstance) runner3dInstance.pause();
    });
  }

  // Biomechanical Telemetry Sync Loop
  const updateTelemetry = () => {
    if (!runner3dInstance) return;

    const sport = workout?.sport || "running";
    const isWalk = sport === "walking";
    const isCycle = sport === "cycling";

    const baseCadence = isWalk ? 126 : isCycle ? 90 : 166;
    const baseSpeed = isWalk ? 5.2 : isCycle ? 24.2 : 11.4;

    const now = Date.now();
    const cadence = Math.round(baseCadence + Math.sin(now / 3500) * 3);
    const speed = (baseSpeed + Math.cos(now / 4200) * 0.3).toFixed(1);

    runner3dInstance.setCadence(cadence);
    runner3dInstance.setSpeed(parseFloat(speed));

    if (hudCadence) hudCadence.textContent = `${cadence} SPM`;
    if (hudSpeed) hudSpeed.textContent = `${speed} km/h`;
  };

  updateTelemetry();
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryInterval = setInterval(updateTelemetry, 1500);

  // =========================================================================
  // 2. Telemetry and Workout State
  // =========================================================================
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
      if (telemetryInterval) {
        clearInterval(telemetryInterval);
        telemetryInterval = null;
      }
      if (runner3dInstance) {
        runner3dInstance.destroy();
        runner3dInstance = null;
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

  // Cleanup on unload to prevent WebGL context leaks
  window.addEventListener("beforeunload", () => {
    if (workoutTimerInterval) clearInterval(workoutTimerInterval);
    if (telemetryInterval) clearInterval(telemetryInterval);
    if (runner3dInstance) {
      runner3dInstance.destroy();
      runner3dInstance = null;
    }
  });
};
