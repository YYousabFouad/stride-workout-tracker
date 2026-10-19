/**
 * Stride Workout Tracker — Plan Workout Screen (index.html)
 * Configures workout goals, sport selection, targets, and launches workouts.
 */

import { STORAGE_KEYS, sanitizeTarget, setStorageItem } from "./storage.js";

export const initPlanWorkoutScreen = function () {
  const workoutForm = document.querySelector(".workout-form");
  const targetInput = document.getElementById("target-input");
  const targetUnitLabel = document.getElementById("target-unit-label");
  const startWorkoutBtn = document.getElementById("btn-start-workout");

  if (!workoutForm || !targetInput) return;

  const updateGoalType = function (clickedBtn) {
    if (clickedBtn.dataset.group !== "goal") return;
    if (!targetUnitLabel) return;

    if (clickedBtn.dataset.value === "distance") {
      targetUnitLabel.textContent = "km";
      targetInput.value = "5.0";
      targetInput.step = "0.5";
      targetInput.min = "0.5";
    } else if (clickedBtn.dataset.value === "time") {
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

  const handleStartWorkout = function () {
    const activeSportBtn = document.querySelector(
      '.segmented-btn[data-group="sport"].active'
    );
    const activeGoalBtn = document.querySelector(
      '.segmented-btn[data-group="goal"].active'
    );

    const sport = activeSportBtn ? activeSportBtn.dataset.value : "run";
    const sportLabel = sport === "ride" ? "Riding" : "Running";
    const goal = activeGoalBtn ? activeGoalBtn.dataset.value : "distance";
    const targetVal = sanitizeTarget(targetInput.value, goal);
    const targetUnit = goal === "distance" ? "km" : "min";

    const workoutData = {
      sport,
      sportLabel,
      goal,
      targetValue: targetVal,
      targetUnit,
      startTime: Date.now(),
      status: "in_progress",
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
    handleStartWorkout();
  });

  if (startWorkoutBtn) {
    startWorkoutBtn.addEventListener("click", handleStartWorkout);
  }
};
