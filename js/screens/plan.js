/**
 * Stride Workout Tracker — Plan Workout Screen (index.html)
 * Configures workout goals, sport selection, targets, and launches workouts.
 */

import {
  GOAL_TARGETS,
  GOAL_TYPES,
  SPORTS,
  STORAGE_KEYS,
  getStorageItem,
  sanitizeGoal,
  sanitizeSport,
  sanitizeTarget,
  setStorageItem,
} from "../core/storage.js";

let isPlanInitialized = false;

export const initPlanWorkoutScreen = function () {
  if (isPlanInitialized) return;
  isPlanInitialized = true;

  const workoutForm = document.querySelector(".workout-form");
  const targetInput = document.getElementById("target-input");
  const targetUnitLabel = document.getElementById("target-unit-label");

  if (!workoutForm || !targetInput) return;

  const updateGoalType = function (clickedBtn) {
    if (clickedBtn.dataset.group !== "goal") return;
    const settings = GOAL_TARGETS[clickedBtn.dataset.value];
    if (!settings) return;

    if (targetUnitLabel) targetUnitLabel.textContent = settings.unit;
    targetInput.value = settings.defaultValue;
    targetInput.step = String(settings.step);
    targetInput.min = String(settings.min);
    targetInput.max = String(settings.max);
  };

  const selectedGoalBtn = workoutForm.querySelector(
    '.segmented-btn[data-group="goal"].active',
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

    parentControl.querySelectorAll(".segmented-btn").forEach((btn) => {
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

  const handleSegmentKeyDown = function (event) {
    if (!SEGMENT_NAV_KEYS.has(event.key)) return;
    const btn = event.target.closest(".segmented-btn");
    if (!btn) return;

    const buttons = Array.from(
      btn.closest(".segmented-control")?.querySelectorAll(".segmented-btn") ||
        [],
    );
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
    const activeSportBtn = workoutForm.querySelector(
      '.segmented-btn[data-group="sport"].active',
    );
    const activeGoalBtn = workoutForm.querySelector(
      '.segmented-btn[data-group="goal"].active',
    );

    const rawSport = activeSportBtn ? activeSportBtn.dataset.value : SPORTS.RUN;
    const sport = sanitizeSport(rawSport);
    const sportLabel = sport === SPORTS.RIDE ? "Riding" : "Running";
    const rawGoal = activeGoalBtn
      ? activeGoalBtn.dataset.value
      : GOAL_TYPES.DISTANCE;
    const goal = sanitizeGoal(rawGoal);
    const targetVal = sanitizeTarget(targetInput.value, goal);
    const targetUnit = GOAL_TARGETS[goal].unit;

    const workoutData = {
      id: `workout_${Date.now()}`,
      sport,
      sportLabel,
      goal,
      targetValue: targetVal,
      targetUnit,
      startTime: Date.now(),
      status: "in_progress",
      saved: false,
    };

    setStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT, workoutData);
    window.location.href = "progress.html";
  };

  // Event Listeners
  workoutForm.addEventListener("click", function (e) {
    const btn = e.target.closest(".segmented-btn");
    if (btn && !btn.classList.contains("active")) switchSegmentedBtn(btn);
  });

  workoutForm.addEventListener("keydown", handleSegmentKeyDown);

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
