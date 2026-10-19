/**
 * Stride Workout Tracker — Main Application Entrypoint
 * Orchestrates modular controllers and handles application bootstrapping.
 */

import { initNavigation } from "./navigation.js";
import { updateStreakDisplay } from "./streak.js";
import { initAccountModal } from "./modal.js";
import { initPlanWorkoutScreen } from "./plan.js";
import { initProgressScreen } from "./progress.js";
import { initCompleteScreen } from "./complete.js";
import { initHistoryScreen } from "./history.js";

const bootstrap = function () {
  initNavigation();
  updateStreakDisplay();
  initAccountModal();
  initPlanWorkoutScreen();
  initProgressScreen();
  initCompleteScreen();
  initHistoryScreen();

  // Navigation button shortcuts
  const viewHistoryBtn = document.getElementById("btn-view-history");
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener("click", () => {
      window.location.href = "history.html";
    });
  }

  const newWorkoutBtn = document.getElementById("btn-new-workout");
  if (newWorkoutBtn) {
    newWorkoutBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
