/**
 * Stride Workout Tracker — Plan Workout Screen (index.html)
 * Configures workout goals, sport selection, targets, and launches workouts.
 */

import {
  GOAL_TYPES,
  SPORTS,
  STORAGE_KEYS,
  getStorageItem,
  sanitizeTarget,
  setStorageItem,
} from "../core/storage.js";

export const initPlanWorkoutScreen = function () {
  const workoutForm = document.querySelector(".workout-form");
  const targetInput = document.getElementById("target-input");
  const targetUnitLabel = document.getElementById("target-unit-label");
  const accountModal = document.getElementById("modal-account");

  if (!workoutForm || !targetInput) return;

  const updateGoalType = function (clickedBtn) {
    if (clickedBtn.dataset.group !== "goal") return;
    if (!targetUnitLabel) return;

    if (clickedBtn.dataset.value === GOAL_TYPES.DISTANCE) {
      targetUnitLabel.textContent = "km";
      targetInput.value = "5.0";
      targetInput.step = "0.5";
      targetInput.min = "0.5";
    } else if (clickedBtn.dataset.value === GOAL_TYPES.TIME) {
      targetUnitLabel.textContent = "min";
      targetInput.value = "30";
      targetInput.step = "1";
      targetInput.min = "1";
    }
  };

  const switchSegmentedBtn = function (clickedBtn) {
    if (clickedBtn.classList.contains("active")) return;
    const parentControl = clickedBtn.closest(".segmented-control");
    if (!parentControl) return;

    parentControl.querySelectorAll(".segmented-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    clickedBtn.classList.add("active");
    updateGoalType(clickedBtn);
  };

  let waitingForAccount = false;

  const handleStartWorkout = function () {
    const activeSportBtn = workoutForm.querySelector(
      '.segmented-btn[data-group="sport"].active'
    );
    const activeGoalBtn = workoutForm.querySelector(
      '.segmented-btn[data-group="goal"].active'
    );

    const sport = activeSportBtn ? activeSportBtn.dataset.value : SPORTS.RUN;
    const sportLabel = sport === SPORTS.RIDE ? "Riding" : "Running";
    const goal = activeGoalBtn
      ? activeGoalBtn.dataset.value
      : GOAL_TYPES.DISTANCE;
    const targetVal = sanitizeTarget(targetInput.value, goal);
    const targetUnit = goal === GOAL_TYPES.DISTANCE ? "km" : "min";

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
    if (btn) switchSegmentedBtn(btn);
  });

  workoutForm.addEventListener("submit", function (e) {
    e.preventDefault();

    if (getStorageItem(STORAGE_KEYS.USER)) {
      handleStartWorkout();
      return;
    }

    waitingForAccount = true;
    if (accountModal) accountModal.classList.add("active");
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
