/**
 * Stride Workout Tracker — GPS Route Map & Live Path Tracker
 * Tracks live geolocation via watchPosition, draws a glowing route polyline,
 * and pans the map with the athlete until the workout goal is reached.
 */

import { calculateHaversineKm } from "../core/storage.js";

let map = null;
let watchId = null;
let routePolyline = null;
let originMarker = null;
let currentMarker = null;
let routeCoords = [];
let totalTrackedDistanceKm = 0;
let isTrackingStopped = false;
let onRouteUpdateCallback = null;

const MIN_STEP_DISTANCE_KM = 0.003; // 3m jitter filter

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
    mapContainer.innerHTML = "";
    map = L.map("map-viewport").setView(initialCoords, 16);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Origin marker
    originMarker = L.circleMarker(initialCoords, {
      radius: 6,
      color: "#060d0c",
      weight: 2,
      fillColor: "#bbf448",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup("Workout Start");

    // Live route polyline
    routePolyline = L.polyline(routeCoords, {
      color: "#bbf448",
      weight: 5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    // Live moving athlete marker
    currentMarker = L.circleMarker(initialCoords, {
      radius: 8,
      color: "#060d0c",
      weight: 3,
      fillColor: "#00d9f5",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup("Live GPS Position · Active Route");

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 100);
  }

  return map;
};

const recordCoordinate = function (coords) {
  if (isTrackingStopped) return;

  if (routeCoords.length === 0) {
    routeCoords.push(coords);
    ensureMapInitialized(coords);
  } else {
    const prev = routeCoords[routeCoords.length - 1];
    const stepKm = calculateHaversineKm(prev, coords);

    if (stepKm >= MIN_STEP_DISTANCE_KM) {
      totalTrackedDistanceKm += stepKm;
      routeCoords.push(coords);
    }
  }

  if (map) {
    if (routePolyline) {
      routePolyline.setLatLngs(routeCoords);
    }
    if (currentMarker) {
      currentMarker.setLatLng(coords);
    }
    map.panTo(coords, { animate: true, duration: 0.5 });
  } else {
    ensureMapInitialized(coords);
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
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    function (position) {
      const { latitude, longitude } = position.coords;
      recordCoordinate([latitude, longitude]);
    },
    function () {
      const mapContainer = document.getElementById("map-viewport");
      if (mapContainer && !map) {
        renderFallbackState(
          mapContainer,
          "Location access unavailable · Showing simulated grid"
        );
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
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

  if (map) {
    setTimeout(() => {
      map.invalidateSize();
      if (routeCoords.length > 0) {
        map.panTo(routeCoords[routeCoords.length - 1]);
      }
    }, 100);
    return;
  }

  if (typeof L === "undefined") {
    renderFallbackState(mapContainer, "Map library unavailable offline");
    return;
  }

  if (routeCoords.length > 0) {
    ensureMapInitialized(routeCoords[routeCoords.length - 1]);
    return;
  }

  if (!navigator.geolocation) {
    renderFallbackState(mapContainer, "Geolocation not supported by browser");
    return;
  }

  renderFallbackState(mapContainer, "Acquiring GPS signal...");
  startRouteTracking({ onUpdate: onRouteUpdateCallback });
};

export const initMap = loadMap;
