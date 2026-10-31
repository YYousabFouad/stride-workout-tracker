/**
 * Stride Workout Tracker — Main Application Entrypoint
 * Orchestrates global shell controllers and dynamically loads screen-specific modules.
 */

import { initAppShell } from "./ui/shell.js";
import { initNavigation } from "./ui/navigation.js";
import { updateStreakDisplay } from "./core/streak.js";
import { initAccountModal } from "./ui/modal.js";
import { migrateStoredSchema } from "./core/storage.js";

const bootstrap = async function () {
  // 0. Bring persisted state up to the current schema before anything reads it
  migrateStoredSchema();

  // 1. Initialize shared layout shell & lightweight global controllers
  initAppShell();
  initNavigation();
  updateStreakDisplay();
  initAccountModal();

  // 2. Dynamically load only the controller for the active screen
  if (document.getElementById("view-plan")) {
    // @ts-expect-error Browser module query parameter is a cache-busting suffix.
    const { initPlanWorkoutScreen } = await import("./screens/plan.js?v=2");
    initPlanWorkoutScreen();
  }

  if (document.getElementById("view-progress")) {
    // @ts-expect-error Browser module query parameter is a cache-busting suffix.
    const { initProgressScreen } = await import("./screens/progress.js?v=2");
    initProgressScreen();
  }

  if (document.getElementById("view-complete")) {
    // @ts-expect-error Browser module query parameter is a cache-busting suffix.
    const { initCompleteScreen } = await import("./screens/complete.js?v=2");
    initCompleteScreen();
  }

  if (document.getElementById("view-history")) {
    // @ts-expect-error Browser module query parameter is a cache-busting suffix.
    const { initHistoryScreen } = await import("./screens/history.js?v=2");
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
