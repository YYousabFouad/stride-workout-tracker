/**
 * Stride Workout Tracker — Main Application Entrypoint
 * Orchestrates global shell controllers and dynamically loads screen-specific modules.
 */

import { initNavigation } from "./navigation.js";
import { updateStreakDisplay } from "./streak.js";
import { initAccountModal } from "./modal.js";

const bootstrap = async function () {
  // 1. Initialize lightweight global shell controllers
  initNavigation();
  updateStreakDisplay();
  initAccountModal();

  // 2. Dynamically load only the controller for the active screen
  if (document.getElementById("view-plan")) {
    const { initPlanWorkoutScreen } = await import("./plan.js");
    initPlanWorkoutScreen();
  }

  if (document.getElementById("view-progress")) {
    const { initProgressScreen } = await import("./progress.js");
    initProgressScreen();
  }

  if (document.getElementById("view-complete")) {
    const { initCompleteScreen } = await import("./complete.js");
    initCompleteScreen();
  }

  if (document.getElementById("view-history")) {
    const { initHistoryScreen } = await import("./history.js");
    initHistoryScreen();
  }

  // 3. Global navigation button shortcuts
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
