/**
 * Stride Workout Tracker — GPS Route Map & Live Path Tracker
 * Tracks live geolocation via watchPosition, draws a glowing route polyline,
 * and pans the map with the athlete until the workout goal is reached.
 * Optimized for instant mobile rendering via two-tier geolocation & fast edge CDN tiles.
 */

import {
  STORAGE_KEYS,
  calculateHaversineKm,
  getStorageItem,
  setStorageItem,
} from "../core/storage.js";

let map = null;
let watchId = null;
let routePolyline = null;
let routeCasingPolyline = null;
let originMarker = null;
let currentMarker = null;
let routeCoords = [];
let totalTrackedDistanceKm = 0;
let isTrackingStopped = false;
let onRouteUpdateCallback = null;

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_FALLBACK_COORDS = [40.7128, -74.006]; // Sensible default if no GPS or stored position yet
const MIN_STEP_DISTANCE_KM = 0.007; // 7m deadband threshold (filters micro-jitter & stationary drift)
const MAX_ACCEPTABLE_ACCURACY_M = 35; // Discard noisy satellite multipath spikes
const SMOOTHING_WEIGHT = 0.45; // EMA filter towards motion vector (ruler-straight segment smoothing)

const getStoredLocation = function () {
  if (routeCoords.length > 0) {
    return routeCoords[routeCoords.length - 1];
  }
  const lastLoc = getStorageItem(STORAGE_KEYS.LAST_LOCATION);
  if (Array.isArray(lastLoc) && lastLoc.length === 2) {
    return lastLoc;
  }
  const activeWorkout = getStorageItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  if (
    Array.isArray(activeWorkout?.routeCoords) &&
    activeWorkout.routeCoords.length > 0
  ) {
    return activeWorkout.routeCoords[activeWorkout.routeCoords.length - 1];
  }
  return DEFAULT_FALLBACK_COORDS;
};

const updateGpsStatusBadge = function (isActive, message) {
  const badge = document.getElementById("map-gps-badge");
  const text = document.getElementById("map-gps-status");
  if (badge && text) {
    if (isActive) {
      badge.classList.add("active");
    } else {
      badge.classList.remove("active");
    }
    text.textContent = message;
  }
};

const renderFallbackState = function (container, message) {
  if (map) return;
  container.innerHTML = `
    <div class="map-grid-layer"></div>
    <div class="map-hud-top">
      <div class="gps-badge">
        <span class="gps-indicator-dot"></span>
        <span>${message}</span>
      </div>
    </div>
  `;
};

const ensureMapInitialized = function (initialCoords) {
  const mapContainer = document.getElementById("map-viewport");
  if (!mapContainer || typeof L === "undefined") return null;

  if (!map) {
    mapContainer.innerHTML = `
      <div class="map-hud-top">
        <div class="gps-badge ${routeCoords.length > 0 ? "active" : ""}" id="map-gps-badge">
          <span class="gps-indicator-dot"></span>
          <span id="map-gps-status">${routeCoords.length > 0 ? "Live GPS Active" : "Acquiring GPS signal..."}</span>
        </div>
      </div>
    `;

    map = L.map("map-viewport", {
      zoomControl: true,
      preferCanvas: true,
    }).setView(initialCoords, 16);

    L.tileLayer(OSM_TILES, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    }).addTo(map);

    // Outer casing (Google Maps crisp ruler-drawn border outline)
    routeCasingPolyline = L.polyline(routeCoords, {
      color: "#050b0c",
      weight: 9,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
      smoothFactor: 1.5,
    }).addTo(map);

    // Live route polyline (vibrant inner core)
    routePolyline = L.polyline(routeCoords, {
      color: "#bbf448",
      weight: 5,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      smoothFactor: 1.5,
    }).addTo(map);

    // If we already have route coordinates (e.g. resuming workout), render markers
    if (routeCoords.length > 0) {
      originMarker = L.circleMarker(routeCoords[0], {
        radius: 6,
        color: "#060d0c",
        weight: 2,
        fillColor: "#bbf448",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup("Workout Start");

      const currentPos = routeCoords[routeCoords.length - 1];
      currentMarker = L.circleMarker(currentPos, {
        radius: 8,
        color: "#060d0c",
        weight: 3,
        fillColor: "#00d9f5",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup("Live GPS Position · Active Route");
    }

    // Immediately trigger layout recalculation
    requestAnimationFrame(() => {
      if (map) map.invalidateSize();
    });
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 100);
  }

  return map;
};

const recordCoordinate = function (coords, accuracy = 0) {
  if (isTrackingStopped) return;

  // Filter out wild satellite multipath spikes if accuracy is poor
  if (accuracy > MAX_ACCEPTABLE_ACCURACY_M && routeCoords.length > 0) {
    return;
  }

  setStorageItem(STORAGE_KEYS.LAST_LOCATION, coords);
  updateGpsStatusBadge(true, "Live GPS Active");

  if (routeCoords.length === 0) {
    routeCoords.push(coords);
    if (map) {
      if (!originMarker) {
        originMarker = L.circleMarker(coords, {
          radius: 6,
          color: "#060d0c",
          weight: 2,
          fillColor: "#bbf448",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup("Workout Start");
      }
      if (!currentMarker) {
        currentMarker = L.circleMarker(coords, {
          radius: 8,
          color: "#060d0c",
          weight: 3,
          fillColor: "#00d9f5",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup("Live GPS Position · Active Route");
      }
      map.setView(coords, 16, { animate: true });
    } else {
      ensureMapInitialized(coords);
    }
  } else {
    const prev = routeCoords[routeCoords.length - 1];
    const rawStepKm = calculateHaversineKm(prev, coords);

    if (rawStepKm >= MIN_STEP_DISTANCE_KM) {
      // Linear vector smoothing (Exponential Moving Average) to eliminate lateral hand shake
      const smoothLat = prev[0] + SMOOTHING_WEIGHT * (coords[0] - prev[0]);
      const smoothLng = prev[1] + SMOOTHING_WEIGHT * (coords[1] - prev[1]);
      const smoothedPoint = [
        Number(smoothLat.toFixed(6)),
        Number(smoothLng.toFixed(6)),
      ];

      // Keep display smoothing separate from measurement: measuring from the
      // previous point to the smoothed point would count only SMOOTHING_WEIGHT
      // of each accepted GPS step.
      totalTrackedDistanceKm += rawStepKm;
      routeCoords.push(smoothedPoint);
    }
  }

  if (map) {
    if (routeCasingPolyline) {
      routeCasingPolyline.setLatLngs(routeCoords);
    }
    if (routePolyline) {
      routePolyline.setLatLngs(routeCoords);
    }
    if (currentMarker) {
      const activeHead =
        routeCoords.length > 0 ? routeCoords[routeCoords.length - 1] : coords;
      currentMarker.setLatLng(activeHead);
    }
    map.panTo(coords, { animate: true, duration: 0.5 });
  }

  if (typeof onRouteUpdateCallback === "function") {
    onRouteUpdateCallback({
      coords: [...routeCoords],
      distanceKm: totalTrackedDistanceKm,
      currentPosition: coords,
    });
  }
};

export const startRouteTracking = function (options = {}) {
  const { initialCoords = [], initialDistanceKm = 0, onUpdate = null } = options;

  onRouteUpdateCallback = onUpdate;
  isTrackingStopped = false;

  if (Array.isArray(initialCoords) && initialCoords.length > 0 && routeCoords.length === 0) {
    routeCoords = [...initialCoords];
    totalTrackedDistanceKm = Number(initialDistanceKm) || 0;
  }

  if (!navigator.geolocation) return;

  // Tier 1: Fast coarse location (< 300ms) to snap map immediately on mobile
  if (routeCoords.length === 0) {
    navigator.geolocation.getCurrentPosition(
      function (position) {
        if (routeCoords.length === 0) {
          const { latitude, longitude } = position.coords;
          setStorageItem(STORAGE_KEYS.LAST_LOCATION, [latitude, longitude]);
          if (map) {
            map.setView([latitude, longitude], 16, { animate: true });
          }
        }
      },
      function () {
        // Silently ignore coarse fallback error; high accuracy watcher handles location
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 3000,
      }
    );
  }

  // Tier 2: Continuous precision GPS tracking
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    function (position) {
      const { latitude, longitude, accuracy } = position.coords;
      recordCoordinate([latitude, longitude], accuracy);
    },
    function () {
      const mapContainer = document.getElementById("map-viewport");
      if (!map && mapContainer) {
        renderFallbackState(
          mapContainer,
          "Location access unavailable · Showing simulated grid"
        );
      } else {
        updateGpsStatusBadge(false, "GPS signal lost · Retrying...");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    }
  );
};

export const stopRouteTracking = function () {
  isTrackingStopped = true;
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (currentMarker) {
    currentMarker.bindPopup("Goal Reached! 🎉").openPopup();
  }
};

export const getRouteData = function () {
  return {
    coords: [...routeCoords],
    distanceKm: totalTrackedDistanceKm,
  };
};

export const loadMap = function () {
  const mapContainer = document.getElementById("map-viewport");
  if (!mapContainer) return;

  if (typeof L === "undefined") {
    renderFallbackState(mapContainer, "Map library unavailable offline");
    return;
  }

  // Optimistically mount map immediately using last known or coarse location
  const initialCoords = getStoredLocation();
  if (!map) {
    ensureMapInitialized(initialCoords);
  }

  requestAnimationFrame(() => {
    if (map) {
      map.invalidateSize();
      if (routeCoords.length > 0) {
        map.panTo(routeCoords[routeCoords.length - 1], { animate: false });
      }
    }
  });

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 100);

  if (watchId === null && !isTrackingStopped) {
    startRouteTracking({ onUpdate: onRouteUpdateCallback });
  }
};

export const initMap = loadMap;
