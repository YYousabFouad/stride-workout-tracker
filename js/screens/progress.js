/**
 * Stride Workout Tracker — Workout In Progress Screen (progress.html)
 * Coordinates live metrics, time elapsed counters, progress bar, 3D runner visualization, and completion routing.
 */

import {
  GOAL_TYPES,
  SPORTS,
  STORAGE_KEYS,
  calculateEfficiencyMetric,
  decimateRoute,
  formatDistance,
  formatTime,
  getStorageItem,
  isSameWorkoutSession,
  persistCompletedWorkout,
  removeStorageItem,
  setStorageItem,
} from "../core/storage.js";
import { getWorkoutCompletionSnapshot } from "../core/workout-completion.js";
import {
  destroyMap,
  getRouteData,
  loadMap,
  startRouteTracking,
  stopRouteTracking,
  // @ts-expect-error Browser import query parameter is a cache-busting suffix.
} from "../visualizers/map.js?v=2";

/** @typedef {import("../visualizers/runner-3d.js").Runner3D} Runner3DType */

/** @type {ReturnType<typeof setInterval>|null} */
let workoutTimerInterval = null;
/** @type {ReturnType<typeof setInterval>|null} */
let telemetryInterval = null;
/** @type {Runner3DType|null} */
let runner3dInstance = null;
let isProgressInitialized = false;

export const initProgressScreen = function () {
  if (isProgressInitialized) return;
  isProgressInitialized = true;

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
  const completionStorageError = document.getElementById(
    "completion-storage-error",
  );

  // Visualizer DOM elements
  const runnerViewport = document.getElementById("runner-3d-viewport");
  const mapViewport = document.getElementById("map-viewport");
  const btnMode3d = document.getElementById("btn-mode-3d");
  const btnModeMap = document.getElementById("btn-mode-map");
  const vizTitle = document.getElementById("visualizer-card-title");
  const vizSubtitle = document.getElementById("visualizer-card-subtitle");
  const hudCadence = document.getElementById("runner-hud-cadence");
  const hudSpeed = document.getElementById("runner-hud-speed");
  const motionStatusEl = document.getElementById("runner-motion-status");
  const motionDotEl = document.getElementById("runner-motion-indicator");
  const btnToggleMotion = document.getElementById("btn-toggle-motion");
  const btnMotionIcon = document.getElementById("btn-motion-icon");
  const btnMotionLabel = document.getElementById("btn-motion-label");

  const sport = workout?.sport || SPORTS.RUN;
  const isRide = sport === SPORTS.RIDE;
  const baseCadence = isRide ? 90 : 166;
  const baseSpeed = isRide ? 24.2 : 11.4;
  const isPreviewMode = !workout || workout.status === "complete";

  // =========================================================================
  // 1. Initialize 3D Runner (lazy) & View Mode Switcher
  // =========================================================================
  /** @type {Promise<Runner3DType|null>|null} */
  let runner3dInitialization = null;
  let isScreenDisposed = false;

  const attachCameraButtons = () => {
    if (!runnerViewport) return;
    const camBtns = runnerViewport.querySelectorAll(".cam-preset-btn");
    camBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        camBtns.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        const camMode = btn.getAttribute("data-cam");
        if (runner3dInstance) {
          runner3dInstance.applyCameraPreset(camMode || "follow", true);
        }
      });
    });
  };

  /**
   * Construct the 3D runner on first use. Importing `runner-3d.js` statically
   * ships ~1.1 MB of unminified Three.js even when the session starts in
   * `?mode=map`, where the 3D canvas is never rendered.
   * @returns {Promise<Runner3DType|null>}
   */
  const ensureRunner3d = function () {
    if (runner3dInstance) return Promise.resolve(runner3dInstance);
    if (!runnerViewport || isScreenDisposed) return Promise.resolve(null);

    // Share one in-flight import/construction across rapid tab switches. A
    // dynamic import is cached by the browser, but its continuation still runs
    // once per caller and would otherwise construct multiple render loops.
    if (!runner3dInitialization) {
      runner3dInitialization = (async () => {
        try {
          // @ts-expect-error Browser import query parameter is a cache-busting suffix.
          const { Runner3D } = await import("../visualizers/runner-3d.js?v=2");
          // The page may have been left while the module was loading.
          if (isScreenDisposed) return null;

          const runner = new Runner3D(runnerViewport);
          runner3dInstance = runner;
          runner.setSport(sport);
          attachCameraButtons();
          return runner;
        } catch (err) {
          console.error("Failed to initialize 3D Runner:", err);
          return null;
        } finally {
          runner3dInitialization = null;
        }
      })();
    }

    return runner3dInitialization;
  };

  /** Start the renderer only when its tab is still the visible selection. */
  /** @param {Runner3DType|null} runner */
  const activateRunnerIfVisible = (runner) => {
    if (!runner) return;
    if (runnerViewport?.hidden) {
      // The lazy import may finish after the user switches to the map. The
      // Runner3D constructor auto-starts, so stop that loop explicitly.
      runner.pause(true);
      return;
    }
    runner.start(true);
    runner.resize();
  };

  // Motion State & Biomechanical Telemetry Tracking
  let isUserMoving = true;
  let liveSpeedKmh = baseSpeed;
  let liveCadence = baseCadence;
  let hasReceivedRealGpsSpeed = false;

  /** @param {boolean} isMoving @param {number} speedKmh @param {number} cadenceVal */
  const updateMotionDisplay = (isMoving, speedKmh, cadenceVal) => {
    isUserMoving = isMoving;
    liveSpeedKmh = isMoving ? Number(speedKmh) || 0 : 0;
    liveCadence = isMoving ? Math.round(Number(cadenceVal) || 0) : 0;

    if (runner3dInstance) {
      runner3dInstance.setSpeed(liveSpeedKmh);
      runner3dInstance.setCadence(liveCadence);
    }

    if (hudCadence) {
      hudCadence.textContent = `${liveCadence} ${
        isRide ? "RPM" : "SPM"
      }${hasReceivedRealGpsSpeed ? "" : " (est.)"}`;
    }
    if (hudSpeed) {
      hudSpeed.textContent = `${liveSpeedKmh.toFixed(1)} km/h${
        hasReceivedRealGpsSpeed ? "" : " (est.)"
      }`;
    }

    if (motionStatusEl) {
      motionStatusEl.textContent = isMoving
        ? isRide
          ? "CYCLING"
          : "RUNNING"
        : "STOPPED";
    }
    if (motionDotEl) {
      if (isMoving) {
        motionDotEl.classList.remove("stopped");
      } else {
        motionDotEl.classList.add("stopped");
      }
    }
    if (btnToggleMotion) {
      if (isMoving) {
        btnToggleMotion.classList.remove("is-stopped");
        if (btnMotionIcon) btnMotionIcon.textContent = "⏸️";
        if (btnMotionLabel) btnMotionLabel.textContent = "Stop";
      } else {
        btnToggleMotion.classList.add("is-stopped");
        if (btnMotionIcon) btnMotionIcon.textContent = "▶️";
        if (btnMotionLabel) btnMotionLabel.textContent = "Move";
      }
    }
  };

  const toggleMotion = () => {
    if (isUserMoving) {
      updateMotionDisplay(false, 0, 0);
    } else {
      hasReceivedRealGpsSpeed = false;
      updateMotionDisplay(true, baseSpeed, baseCadence);
    }
  };

  if (btnToggleMotion) {
    btnToggleMotion.addEventListener("click", toggleMotion);
  }

  /** @param {KeyboardEvent} e */
  const handleKeyDown = (e) => {
    if (
      e.code === "Space" &&
      (e.target === document.body || e.target === runnerViewport)
    ) {
      e.preventDefault();
      toggleMotion();
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  // Mobile accelerometer motion sensor (detects running/cycling steps)
  let lastStepDetectedTime = 0;
  /** @param {DeviceMotionEvent} event */
  const handleDeviceMotion = (event) => {
    if (!event.acceleration && !event.accelerationIncludingGravity) return;
    const acc = event.acceleration || event.accelerationIncludingGravity;
    if (!acc) return;
    const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    const threshold = event.acceleration ? 2.8 : 12.6;
    const now = Date.now();
    if (mag > threshold && now - lastStepDetectedTime > 320) {
      lastStepDetectedTime = now;
      if (!isUserMoving) {
        updateMotionDisplay(true, baseSpeed, baseCadence);
      }
    }
  };
  window.addEventListener("devicemotion", handleDeviceMotion);

  /** @param {{ speedKmh: number, isMoving: boolean }} movement */
  const handleGpsMovement = ({ speedKmh, isMoving }) => {
    if (typeof speedKmh === "number") {
      hasReceivedRealGpsSpeed = true;
      if (isMoving && speedKmh >= 0.9) {
        // Derive athlete cadence from measured speed (SPM for run, RPM for ride)
        const derivedCadence = isRide
          ? Math.max(60, Math.min(115, Math.round(55 + speedKmh * 1.3)))
          : Math.max(135, Math.min(205, Math.round(125 + speedKmh * 3.6)));
        updateMotionDisplay(true, speedKmh, derivedCadence);
      } else {
        // Athlete stopped moving
        updateMotionDisplay(false, 0, 0);
      }
    }
  };

  // View Mode Switcher (3D Runner <-> GPS Route Map)
  if (btnMode3d && btnModeMap) {
    btnMode3d.addEventListener("click", () => {
      btnMode3d.classList.add("active");
      btnMode3d.setAttribute("aria-selected", "true");
      btnMode3d.tabIndex = 0;
      btnModeMap.classList.remove("active");
      btnModeMap.setAttribute("aria-selected", "false");
      btnModeMap.tabIndex = -1;

      if (runnerViewport) runnerViewport.hidden = false;
      if (mapViewport) mapViewport.hidden = true;
      if (vizTitle) vizTitle.textContent = "3D Live Runner";
      if (vizSubtitle)
        vizSubtitle.textContent = "Biomechanical pacing & speed telemetry";
      void ensureRunner3d().then(activateRunnerIfVisible);
      updateMotionDisplay(isUserMoving, liveSpeedKmh, liveCadence);
      startTelemetry();
    });

    btnModeMap.addEventListener("click", async () => {
      btnModeMap.classList.add("active");
      btnModeMap.setAttribute("aria-selected", "true");
      btnModeMap.tabIndex = 0;
      btnMode3d.classList.remove("active");
      btnMode3d.setAttribute("aria-selected", "false");
      btnMode3d.tabIndex = -1;

      if (mapViewport) mapViewport.hidden = false;
      if (runnerViewport) runnerViewport.hidden = true;
      if (vizTitle) vizTitle.textContent = "Live route";
      if (vizSubtitle) vizSubtitle.textContent = "GPS breadcrumb tracking";
      stopTelemetry();
      if (runner3dInstance) runner3dInstance.pause(true);
      if (workout?.status === "in_progress") {
        loadMap();
      } else if (mapViewport) {
        const previewMessage = document.createElement("p");
        previewMessage.className = "map-preview-empty";
        previewMessage.textContent = "Start a workout to track a GPS route.";
        mapViewport.replaceChildren(previewMessage);
      }
    });

    // Roving focus for the visualizer tablist (role="tab" semantics): arrow
    // keys move both focus and the active tab, as the ARIA pattern requires.
    /** @param {KeyboardEvent} event */
    const handleTablistKey = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const target = event.target === btnMode3d ? btnModeMap : btnMode3d;
      target.focus();
      target.click();
    };
    btnMode3d.addEventListener("keydown", handleTablistKey);
    btnModeMap.addEventListener("keydown", handleTablistKey);
  }

  // Biomechanical Telemetry Sync Loop (Active only when 3D Runner view is visible)
  const updateTelemetry = () => {
    if (!runner3dInstance || !isUserMoving || hasReceivedRealGpsSpeed) return;

    const now = Date.now();
    const cadence = Math.round(baseCadence + Math.sin(now / 3500) * 3);
    const speed = parseFloat(
      (baseSpeed + Math.cos(now / 4200) * 0.3).toFixed(1),
    );

    updateMotionDisplay(true, speed, cadence);
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

  // Auto-switch only after the tab handlers' dependencies are initialized.
  // Calling click() earlier hits the temporal dead zone for stopTelemetry.
  if (btnMode3d && btnModeMap) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("mode") === "map" || window.location.hash === "#map") {
      btnModeMap.click();
    }
  }

  // Ensure 3D runner animation and telemetry HUD are running if 3D viewport is active
  const isMapMode = mapViewport && !mapViewport.hidden;
  if (!isMapMode && runnerViewport) {
    // Skip the Three.js load entirely while the map view is the active mode.
    void ensureRunner3d().then(activateRunnerIfVisible);
    // Preview (no workout): keep the HUD neutral instead of showing
    // fabricated live speed/cadence for a session that does not exist.
    if (isPreviewMode) {
      updateMotionDisplay(false, 0, 0);
    } else {
      updateMotionDisplay(true, baseSpeed, baseCadence);
      startTelemetry();
    }
  }

  const cleanupListeners = () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("devicemotion", handleDeviceMotion);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("storage", handleStorageEvent);
  };

  // Register unload cleanup unconditionally to ensure WebGL context and watchers are always released
  let lastStorageSaveTime = 0;
  const STORAGE_SAVE_THROTTLE_MS = 3000;
  // Set when another tab takes ownership of this session; our snapshot then
  // becomes stale and must never overwrite the newer record.
  let sessionTakenOver = false;

  const flushStorageSave = () => {
    if (sessionTakenOver) return;
    if (workout && workout.status === "in_progress") {
      setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workout);
      lastStorageSaveTime = Date.now();
    }
  };

  // Mobile browsers routinely skip `beforeunload` (iOS Safari, Android Chrome
  // background tabs), so persistence also rides on pagehide/visibilitychange.
  const handlePageHide = () => flushStorageSave();
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") flushStorageSave();
  };

  /** @param {StorageEvent} event */
  const handleStorageEvent = (event) => {
    // Only a session we are actively tracking can be lost to another tab; the
    // preview (no workout) view has nothing to reconcile.
    if (!workout || workout.status !== "in_progress") return;
    if (
      event.key !== null &&
      event.key !== STORAGE_KEYS.ACTIVE_WORKOUT &&
      event.key !== STORAGE_KEYS.COMPLETED_WORKOUT
    ) {
      return;
    }

    const latestActive = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    const latestCompleted = getStorageItem(STORAGE_KEYS.COMPLETED_WORKOUT);
    // Completion writes the recovery slot before the active slot. If the
    // second write fails, another tab still needs to stop tracking this run.
    const latest =
      latestCompleted?.status === "complete" &&
      isSameWorkoutSession(latestCompleted, workout)
        ? latestCompleted
        : latestActive;
    const isSameSession = isSameWorkoutSession(latest, workout);
    // Routine throttled writes from another tab tracking this same session.
    if (isSameSession && latest?.status === "in_progress") return;

    // Stop writing: `workout` is now a stale snapshot that would clobber the
    // newer record on the next flush (or on beforeunload during navigation).
    sessionTakenOver = true;
    isScreenDisposed = true;
    stopTelemetry();
    stopRouteTracking();
    if (workoutTimerInterval) {
      clearInterval(workoutTimerInterval);
      workoutTimerInterval = null;
    }

    // A session still running elsewhere: adopt it by reloading.
    // One that finished: show its summary; if cancelled/cleared: return to setup.
    if (latest?.status === "in_progress") {
      window.location.href = "progress.html";
    } else if (latest?.status === "complete") {
      window.location.href = "complete.html";
    } else {
      window.location.href = isSameWorkoutSession(latestCompleted, workout)
        ? "complete.html"
        : "index.html";
    }
  };

  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("storage", handleStorageEvent);

  window.addEventListener("beforeunload", () => {
    isScreenDisposed = true;
    flushStorageSave();
    if (workoutTimerInterval) clearInterval(workoutTimerInterval);
    cleanupListeners();
    stopTelemetry();
    stopRouteTracking();
    destroyMap();
    if (runner3dInstance) {
      runner3dInstance.destroy();
      runner3dInstance = null;
    }
  });

  // =========================================================================
  // 2. Telemetry and Workout State
  // =========================================================================
  if (liveDistance) liveDistance.textContent = "0.0 km";
  if (liveTime) liveTime.textContent = "00:00";
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressBar) {
    progressBar.style.width = "0%";
    progressBar.parentElement?.setAttribute("aria-valuenow", "0");
  }

  if (!workout || workout.status === "complete") {
    if (metaTag) metaTag.textContent = "No workout in progress";
    if (targetHint) {
      targetHint.textContent =
        "No workout currently in progress. Start a workout from Plan Workout!";
    }
    if (endWorkoutBtn) {
      const btnSpan = endWorkoutBtn.querySelector("span") || endWorkoutBtn;
      btnSpan.textContent = "Plan a workout";
      endWorkoutBtn.addEventListener("click", () => {
        window.location.href = "index.html";
      });
    }

    // No GPS tracking in preview mode: without a workout there is nothing to
    // measure, so requesting location would prompt, drain battery, and persist
    // position fixes for no benefit.
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
    onUpdate: (
      /** @type {import("../visualizers/map-contracts.js").RouteUpdate} */ update,
    ) => {
      const { coords, distanceKm, speedKmh, isMoving } = update;
      gpsDistanceKm = distanceKm;
      handleGpsMovement({ speedKmh, isMoving });
      // Bound stored route points to mitigate storage exhaustion (CWE-400)
      workout.routeCoords = decimateRoute(coords);
      workout.gpsDistanceKm = Number(distanceKm.toFixed(3));
      const now = Date.now();
      if (now - lastStorageSaveTime >= STORAGE_SAVE_THROTTLE_MS) {
        flushStorageSave();
      }
      updateWorkoutLoop();
    },
  });

  const computeLiveMetrics = function () {
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - workout.startTime) / 1000),
    );
    // Distance goals must reflect measured GPS movement. A speed estimate here
    // can otherwise complete a workout even when location access is unavailable.
    const distanceKm = gpsDistanceKm;
    const rawPercent = isTimeGoal
      ? targetSeconds > 0
        ? (elapsedSeconds / targetSeconds) * 100
        : 0
      : targetValue > 0
        ? (distanceKm / targetValue) * 100
        : 0;
    const safePercent = Number.isFinite(rawPercent) ? rawPercent : 0;
    const percent = Math.min(100, Math.max(0, Math.floor(safePercent)));

    return { elapsedSeconds, distanceKm, percent };
  };

  function updateWorkoutLoop() {
    const { elapsedSeconds, distanceKm, percent } = computeLiveMetrics();

    if (liveTime) liveTime.textContent = formatTime(elapsedSeconds);
    if (liveDistance) liveDistance.textContent = formatDistance(distanceKm);
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
      progressBar.parentElement?.setAttribute("aria-valuenow", String(percent));
    }

    if (percent >= 100) {
      if (!goalReachedStopped) {
        goalReachedStopped = true;
        // Only the real goal trigger may show the celebratory popup.
        stopRouteTracking(true);
      }
      if (targetHint) {
        targetHint.textContent = `Target reached! You completed ${workout?.targetValue ?? targetValue} ${workout?.targetUnit ?? (isTimeGoal ? "min" : "km")} 🎉`;
      }
    }
  }

  updateWorkoutLoop();
  workoutTimerInterval = setInterval(updateWorkoutLoop, 1000);

  // End Workout
  if (endWorkoutBtn) {
    endWorkoutBtn.addEventListener("click", function () {
      isScreenDisposed = true;
      if (workoutTimerInterval) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
      }

      // Snapshot final metrics and tracked route coordinates BEFORE tearing down the map
      const liveMetrics =
        workout.status === "complete"
          ? {
              elapsedSeconds: workout.elapsedSeconds || 0,
              distanceKm: workout.distanceKm || gpsDistanceKm,
              percent: workout.targetReached ? 100 : 0,
            }
          : computeLiveMetrics();
      const { coords } = getRouteData();
      const completion = getWorkoutCompletionSnapshot(
        workout,
        liveMetrics,
        coords,
        Date.now(),
      );
      const { elapsedSeconds, distanceKm, targetReached } = completion;
      const efficiency = calculateEfficiencyMetric(
        distanceKm,
        elapsedSeconds,
        workout.sport,
      );

      cleanupListeners();
      stopTelemetry();
      stopRouteTracking(targetReached);
      destroyMap();
      // The precise last-known location is no longer needed once the workout
      // ends; keeping it would persist GPS data indefinitely (privacy + quota).
      removeStorageItem(STORAGE_KEYS.LAST_LOCATION);
      if (runner3dInstance) {
        runner3dInstance.destroy();
        runner3dInstance = null;
      }

      workout.endTime = completion.endTime;
      workout.elapsedSeconds = elapsedSeconds;
      workout.distanceKm = Number(distanceKm.toFixed(2));

      // Bound stored route points to prevent storage quota exhaustion
      workout.routeCoords = decimateRoute(completion.routeCoords);

      workout.finalDuration = formatTime(elapsedSeconds);
      workout.finalDistance = formatDistance(distanceKm);
      workout.efficiencyValue = efficiency.value;
      workout.efficiencyLabel = efficiency.label;
      workout.targetReached = targetReached;
      workout.status = "complete";

      if (!persistCompletedWorkout(workout)) {
        if (completionStorageError) {
          completionStorageError.textContent =
            "Browser storage couldn't save the completed workout. Free space or enable site storage, then retry while this page stays open.";
          completionStorageError.classList.remove("u-hidden");
        }
        const btnSpan = endWorkoutBtn.querySelector("span") || endWorkoutBtn;
        btnSpan.textContent = "Retry save";
        return;
      }
      if (completionStorageError) {
        completionStorageError.classList.add("u-hidden");
      }
      window.location.href = "complete.html";
    });
  }
};
