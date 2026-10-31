/**
 * Stride Workout Tracker — Plan Workout Screen (index.html)
 * Configures workout goals, sport selection, targets, and launches workouts.
 */

import {
  GOAL_TARGETS,
  GOAL_TYPES,
  SPORTS,
  STORAGE_KEYS,
  createWorkoutId,
  getStorageItem,
  removeStorageItem,
  sanitizeGoal,
  sanitizeSport,
  sanitizeTarget,
  setStorageItem,
} from "../core/storage.js";

let isPlanInitialized = false;

export const initPlanWorkoutScreen = function () {
  if (isPlanInitialized) return;
  isPlanInitialized = true;

  const workoutForm = document.querySelector("form.workout-form");
  const targetInput = /** @type {HTMLInputElement|null} */ (
    document.getElementById("target-input")
  );
  const targetUnitLabel = document.getElementById("target-unit-label");
  const storageError = document.getElementById("storage-error");

  if (!workoutForm || !targetInput) return;

  /** @param {HTMLButtonElement} clickedBtn */
  const updateGoalType = function (clickedBtn) {
    if (clickedBtn.dataset.group !== "goal") return;
    const settings = GOAL_TARGETS[sanitizeGoal(clickedBtn.dataset.value)];

    if (targetUnitLabel) targetUnitLabel.textContent = settings.unit;
    targetInput.value = settings.defaultValue;
    targetInput.step = String(settings.step);
    targetInput.min = String(settings.min);
    targetInput.max = String(settings.max);
  };

  const selectedGoalBtn = /** @type {HTMLButtonElement|null} */ (
    workoutForm.querySelector('button.segmented-btn[data-group="goal"].active')
  );
  if (selectedGoalBtn) updateGoalType(selectedGoalBtn);

  /**
   * Select one segment of a radiogroup: visual state, ARIA state, and roving
   * tab stop all move together so the group is operable with arrow keys.
   * @param {HTMLButtonElement} clickedBtn
   * @param {{ focus?: boolean }} [options]
   */
  const switchSegmentedBtn = function (clickedBtn, options = {}) {
    const parentControl = clickedBtn.closest(".segmented-control");
    if (!parentControl) return;

    parentControl.querySelectorAll("button").forEach((btn) => {
      if (!btn.matches(".segmented-btn")) return;
      const isSelected = btn === clickedBtn;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-checked", String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });

    updateGoalType(clickedBtn);
    if (options.focus) clickedBtn.focus();
  };

  const SEGMENT_NAV_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ]);

  /** @param {KeyboardEvent} event */
  const handleSegmentKeyDown = function (event) {
    if (!SEGMENT_NAV_KEYS.has(event.key)) return;
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    const matchedBtn = eventTarget.closest(".segmented-btn");
    if (!(matchedBtn instanceof HTMLButtonElement)) return;
    const btn = matchedBtn;

    const buttons = Array.from(
      btn.closest(".segmented-control")?.querySelectorAll("button") || [],
    ).filter((candidate) => candidate.matches(".segmented-btn"));
    if (buttons.length === 0) return;

    const index = buttons.indexOf(btn);
    const lastIndex = buttons.length - 1;
    let nextIndex;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    event.preventDefault();
    switchSegmentedBtn(buttons[nextIndex], { focus: true });
  };

  let waitingForAccount = false;

  const handleStartWorkout = function () {
    // Guard against silently destroying a live session: navigating back to
    // Plan while a workout runs and pressing Start used to overwrite it.
    const existing = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    if (existing && existing.status === "in_progress") {
      const discardConfirmed = window.confirm(
        "A workout is already in progress. Starting a new one will discard it. " +
          "Choose Cancel to keep it — you can launch it from the In Progress screen.",
      );
      if (!discardConfirmed) return;
    }

    const activeSportBtn = /** @type {HTMLButtonElement|null} */ (
      workoutForm.querySelector(
        'button.segmented-btn[data-group="sport"].active',
      )
    );
    const activeGoalBtn = /** @type {HTMLButtonElement|null} */ (
      workoutForm.querySelector(
        'button.segmented-btn[data-group="goal"].active',
      )
    );

    const rawSport = activeSportBtn ? activeSportBtn.dataset.value : SPORTS.RUN;
    const sport = sanitizeSport(rawSport);
    const sportLabel = sport === SPORTS.RIDE ? "Riding" : "Running";
    const rawGoal = activeGoalBtn
      ? activeGoalBtn.dataset.value
      : GOAL_TYPES.DISTANCE;
    const goal = sanitizeGoal(rawGoal);
    const targetVal = sanitizeTarget(targetInput.value, goal);
    const targetUnit = /** @type {"km"|"min"} */ (GOAL_TARGETS[goal].unit);

    const workoutData = {
      id: createWorkoutId(),
      sport,
      sportLabel,
      goal,
      targetValue: targetVal,
      targetUnit,
      startTime: Date.now(),
      status: /** @type {"in_progress"} */ ("in_progress"),
      saved: false,
      routeCoords: [],
      gpsDistanceKm: 0,
    };

    const persisted = setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workoutData);
    if (!persisted) {
      if (storageError) {
        storageError.textContent =
          "Browser storage couldn't save this workout. Free space or enable site storage and try again; a workout cannot continue safely across pages without it.";
        storageError.classList.remove("u-hidden");
      }
      return;
    }
    if (existing?.status === "in_progress") {
      // The discarded session's precise GPS fix must not seed the new workout
      // map or remain persisted after its route has been replaced.
      removeStorageItem(STORAGE_KEYS.LAST_LOCATION);
    }
    window.location.href = "progress.html";
  };

  // Event Listeners
  workoutForm.addEventListener("click", function (e) {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest(".segmented-btn");
    if (btn instanceof HTMLButtonElement && !btn.classList.contains("active")) {
      switchSegmentedBtn(btn);
    }
  });

  workoutForm.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent) handleSegmentKeyDown(event);
  });

  workoutForm.addEventListener("submit", function (e) {
    e.preventDefault();

    if (getStorageItem(STORAGE_KEYS.USER)) {
      handleStartWorkout();
      return;
    }

    waitingForAccount = true;
    document.dispatchEvent(new CustomEvent("stride:open-account"));
  });

  document.addEventListener("stride:account-created", function () {
    if (!waitingForAccount) return;
    waitingForAccount = false;
    handleStartWorkout();
  });

  document.addEventListener("stride:account-cancelled", function () {
    waitingForAccount = false;
  });
};
