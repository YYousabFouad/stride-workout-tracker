/**
 * Stride Workout Tracker — History Screen (history.html)
 * Renders persisted workout history and an honest empty state when there is none.
 */

import {
  SPORTS,
  STORAGE_KEYS,
  formatDistance,
  formatHistoryDate,
  formatTime,
  getStorageItem,
} from "../core/storage.js";

let isHistoryInitialized = false;

/**
 * Display timestamp for an entry: prefer the real start time, fall back to the
 * verbatim label preserved from pre-v1 records.
 * @param {{ startedAtMs?: number|null, dateLabel?: string }} item
 * @returns {string}
 */
const resolveDateLabel = function (item) {
  if (
    typeof item.startedAtMs === "number" &&
    Number.isFinite(item.startedAtMs) &&
    item.startedAtMs > 0
  ) {
    const formatted = formatHistoryDate(item.startedAtMs);
    if (formatted) return formatted;
  }
  return item.dateLabel || "";
};

export const initHistoryScreen = function () {
  if (isHistoryInitialized) return;
  isHistoryInitialized = true;

  const viewHistory = document.getElementById("view-history");
  if (!viewHistory) return;

  const historyContainer = document.querySelector(".history-list");
  const emptyState = document.getElementById("history-empty-state");
  if (!historyContainer) return;

  const storedHistory = getStorageItem(STORAGE_KEYS.HISTORY);
  /** @type {{ title: string, sport: string, startedAtMs: number|null, dateLabel: string, distanceKm: number|null, elapsedSeconds: number|null, efficiencyValue: string, efficiencyLabel: string }[]} */
  const entries = Array.isArray(storedHistory) ? storedHistory : [];

  historyContainer.replaceChildren();

  if (entries.length === 0) {
    if (emptyState) emptyState.hidden = false;
    return;
  }
  if (emptyState) emptyState.hidden = true;

  const fragment = document.createDocumentFragment();

  entries.forEach((item) => {
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

    /** @param {string} selector @param {string} text */
    const setText = function (selector, text) {
      const element = entry.querySelector(selector);
      if (element) element.textContent = text;
    };
    setText(".history-title", item.title || "Workout");
    setText(".history-date", resolveDateLabel(item));
    setText(
      ".distance",
      typeof item.distanceKm === "number" &&
        Number.isFinite(item.distanceKm) &&
        item.distanceKm >= 0
        ? formatDistance(item.distanceKm)
        : "0.0 km",
    );
    setText(
      ".duration",
      typeof item.elapsedSeconds === "number" &&
        Number.isFinite(item.elapsedSeconds) &&
        item.elapsedSeconds > 0
        ? formatTime(item.elapsedSeconds)
        : "00:00",
    );
    setText(
      ".efficiency-val",
      item.efficiencyValue || (isRide ? "0.0" : "--:--"),
    );
    setText(
      ".efficiency-label",
      item.efficiencyLabel || (isRide ? "Speed (km/h)" : "Pace (/km)"),
    );

    fragment.appendChild(entry);
  });

  historyContainer.appendChild(fragment);
};
