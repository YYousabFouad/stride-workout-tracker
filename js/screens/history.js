/**
 * Stride Workout Tracker — History Screen (history.html)
 * Loads saved workouts from localStorage and dynamically renders historical entries.
 */

import { SPORTS, STORAGE_KEYS, getStorageItem } from "../core/storage.js";

let isHistoryInitialized = false;

export const initHistoryScreen = function () {
  if (isHistoryInitialized) return;
  isHistoryInitialized = true;

  const viewHistory = document.getElementById("view-history");
  if (!viewHistory) return;

  const historyContainer = document.querySelector(".history-list");
  const storedHistory = getStorageItem(STORAGE_KEYS.HISTORY);

  if (
    historyContainer &&
    Array.isArray(storedHistory) &&
    storedHistory.length > 0
  ) {
    historyContainer.replaceChildren();
    const fragment = document.createDocumentFragment();

    storedHistory.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const isRide = item.sport === SPORTS.RIDE;
      const iconPath = isRide
        ? '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 9l3-3 3 4.5 3.5-1"/>'
        : '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>';

      const entry = document.createElement("div");
      entry.className = "history-item";
      entry.innerHTML = `
        <div class="history-sport-info">
          <div class="sport-icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg></div>
          <div><div class="history-title"></div><div class="history-date"></div></div>
        </div>
        <div class="history-metrics">
          <div><div class="history-metric-val distance"></div><div class="history-metric-unit">Distance</div></div>
          <div><div class="history-metric-val duration"></div><div class="history-metric-unit">Duration</div></div>
          <div><div class="history-metric-val efficiency-val"></div><div class="history-metric-unit efficiency-label"></div></div>
        </div>`;

      entry.querySelector(".history-title").textContent =
        item.title ?? "Workout";
      entry.querySelector(".history-date").textContent = item.date ?? "";
      entry.querySelector(".distance").textContent = item.distance ?? "0.0 km";
      entry.querySelector(".duration").textContent = item.duration ?? "00:00";
      entry.querySelector(".efficiency-val").textContent =
        item.efficiencyValue ?? (isRide ? "0.0" : "--:--");
      entry.querySelector(".efficiency-label").textContent =
        item.efficiencyLabel ?? (isRide ? "Speed (km/h)" : "Pace (/km)");

      fragment.appendChild(entry);
    });

    historyContainer.appendChild(fragment);
  }
};
