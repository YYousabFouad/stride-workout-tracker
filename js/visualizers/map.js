/**
 * Stride Workout Tracker — GPS Route Map & Live Path Tracker
 * Tracks live geolocation via watchPosition, draws a glowing route polyline,
 * and pans the map with the athlete until the workout goal is reached.
 * Optimized for instant mobile rendering via two-tier geolocation & fast edge CDN tiles.
 */

import {
  STORAGE_KEYS,
  calculateHaversineKm,
  decimateRoute,
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
let clickArrowMarker = null;
let locationAccuracyCircle = null;
let navGuidePolyline = null;
let navGuideCasingPolyline = null;
let isNavigatingToArrow = false;
let activeOsrmAbortController = null;
let navToastTimeout = null;
let lastRecordedGpsTime = 0;
let lastRecordedGpsCoord = null;
let currentGpsSpeedKmh = 0;
let stationaryWatchdogTimer = null;

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
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

export const createArrowIcon = function () {
  return L.divIcon({
    className: "stride-map-arrow-icon",
    html: `
      <div class="map-arrow-marker-pin" role="img" aria-label="Target Arrow">
        <svg class="map-arrow-svg" width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="strideArrowGrad" x1="18" y1="2" x2="18" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#cdfa5a" />
              <stop offset="40%" stop-color="#bbf448" />
              <stop offset="100%" stop-color="#00d9f5" />
            </linearGradient>
            <linearGradient id="arrowFacet" x1="4" y1="12" x2="18" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </linearGradient>
          </defs>
          <!-- Ground pulse radar ring -->
          <circle class="arrow-ground-ring" cx="18" cy="44" r="5" stroke="#00d9f5" stroke-width="1.5" fill="none" />
          <!-- Aerodynamic Stealth Arrow Body -->
          <path
            d="M18 43 L4 12 C2.8 9.5 4.6 6.5 7.4 6.5 H12.5 L18 14 L23.5 6.5 H28.6 C31.4 6.5 33.2 9.5 32 12 L18 43 Z"
            fill="url(#strideArrowGrad)"
            stroke="#060d0c"
            stroke-width="2.2"
            stroke-linejoin="round"
          />
          <!-- 3D Bevel Facet Highlight -->
          <path
            d="M18 43 L4 12 C2.8 9.5 4.6 6.5 7.4 6.5 H12.5 L18 14 V43 Z"
            fill="url(#arrowFacet)"
          />
          <!-- High-tech Center Ridge Line -->
          <line x1="18" y1="14" x2="18" y2="41" stroke="#060d0c" stroke-width="2" stroke-linecap="round" opacity="0.8" />
          <circle cx="18" cy="22" r="2.5" fill="#060d0c" />
          <circle cx="18" cy="22" r="1.2" fill="#ffffff" />
        </svg>
      </div>
    `,
    iconSize: [36, 48],
    iconAnchor: [18, 44],
  });
};

export const setOrMoveArrowMarker = function (targetMap, latlng) {
  if (!targetMap || !latlng || typeof L === "undefined") return null;

  const normalized = Array.isArray(latlng)
    ? L.latLng(latlng[0], latlng[1])
    : latlng;

  if (!clickArrowMarker) {
    clickArrowMarker = L.marker(normalized, {
      icon: createArrowIcon(),
      title: "Target Arrow · Click to navigate here",
    }).addTo(targetMap);

    // Clicking the arrow marker directly also triggers directions
    if (typeof clickArrowMarker.on === "function") {
      clickArrowMarker.on("click", function (evt) {
        if (evt && evt.originalEvent) {
          evt.originalEvent.stopPropagation();
        }
        navigateToArrow(targetMap);
      });
    }
  } else {
    clickArrowMarker.setLatLng(normalized);
    if (!targetMap.hasLayer(clickArrowMarker)) {
      clickArrowMarker.addTo(targetMap);
    }
    // Replay drop animation so it visibly drops/hops at the new position
    const el = clickArrowMarker.getElement();
    if (el) {
      const pin = el.querySelector(".map-arrow-marker-pin");
      if (pin) {
        pin.style.animation = "none";
        requestAnimationFrame(() => {
          pin.style.animation = "";
        });
      }
    }
  }

  // Reveal the Navigate button in the map controls
  const navBtns = [
    document.getElementById("btn-navigate-arrow"),
    document.getElementById("btn-complete-navigate"),
  ].filter(Boolean);
  navBtns.forEach((btn) => {
    btn.style.display = "flex";
  });

  // If already navigating, dynamically update the directions route to the new arrow location
  if (isNavigatingToArrow) {
    navigateToArrow(targetMap);
  }

  return clickArrowMarker;
};

export const addArrowToMap = setOrMoveArrowMarker;

export const clearClickArrowMarker = function (targetMap = map) {
  const activeMap = targetMap || map;
  clearNavigation(activeMap);
  if (activeMap && clickArrowMarker) {
    activeMap.removeLayer(clickArrowMarker);
  }
  clickArrowMarker = null;

  // Hide navigate buttons when arrow is cleared
  const navBtns = [
    document.getElementById("btn-navigate-arrow"),
    document.getElementById("btn-complete-navigate"),
  ].filter(Boolean);
  navBtns.forEach((btn) => {
    btn.style.display = "none";
  });
};

/**
 * Calculate forward compass azimuth / bearing in degrees [0, 359]
 * @param {[number, number]} coordA [lat1, lon1]
 * @param {[number, number]} coordB [lat2, lon2]
 * @returns {number}
 */
export const calculateBearing = function (coordA, coordB) {
  if (!Array.isArray(coordA) || !Array.isArray(coordB)) return 0;
  const [lat1, lon1] = coordA;
  const [lat2, lon2] = coordB;
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(bearing);
};

/**
 * Convert bearing in degrees to 8-point compass cardinal direction
 * @param {number} bearing
 * @returns {string}
 */
export const getCompassDirection = function (bearing) {
  const directions = [
    "North",
    "North-East",
    "East",
    "South-East",
    "South",
    "South-West",
    "West",
    "North-West",
  ];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

/**
 * Fetch pedestrian route from OpenStreetMap Routing Machine (OSRM)
 * @param {[number, number]} start [lat, lon]
 * @param {[number, number]} dest [lat, lon]
 * @param {AbortSignal|null} [externalSignal=null]
 * @returns {Promise<{ coords: [number, number][], distanceMeters: number, durationSec: number }>}
 */
export const fetchOsrmRoute = async function (
  start,
  dest,
  externalSignal = null,
) {
  if (
    !Array.isArray(start) ||
    !Array.isArray(dest) ||
    start.length < 2 ||
    dest.length < 2 ||
    !Number.isFinite(start[0]) ||
    !Number.isFinite(start[1]) ||
    !Number.isFinite(dest[0]) ||
    !Number.isFinite(dest[1])
  ) {
    throw new Error("Invalid start or destination coordinates for routing");
  }

  const [startLat, startLon] = start;
  const [destLat, destLon] = dest;

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), 3500)
    : null;

  const handleExternalAbort = () => {
    if (controller) controller.abort();
  };

  if (externalSignal && controller) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", handleExternalAbort, {
        once: true,
      });
    }
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(
      url,
      controller ? { signal: controller.signal } : {},
    );
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", handleExternalAbort);
    }

    if (!res.ok) throw new Error(`OSRM status ${res.status}`);
    const data = await res.json();

    if (
      data.code === "Ok" &&
      Array.isArray(data.routes) &&
      data.routes.length > 0
    ) {
      const best = data.routes[0];
      const coords = best.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      return {
        coords,
        distanceMeters: best.distance,
        durationSec: best.duration,
      };
    }
    throw new Error("No route found in response");
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", handleExternalAbort);
    }
    throw err;
  }
};

export const isNavigating = function () {
  return isNavigatingToArrow;
};

export const showNavToast = function (title, subtitle) {
  const toasts = [
    document.getElementById("map-nav-toast"),
    document.getElementById("complete-nav-toast"),
  ].filter(Boolean);

  if (navToastTimeout) {
    clearTimeout(navToastTimeout);
    navToastTimeout = null;
  }

  toasts.forEach((toast) => {
    const titleEl = toast.querySelector(".nav-moment-toast-title");
    const subEl = toast.querySelector(".nav-moment-toast-sub");
    if (titleEl && title) titleEl.textContent = title;
    if (subEl && subtitle) subEl.textContent = subtitle;

    toast.style.display = "flex";
    requestAnimationFrame(() => {
      toast.classList.add("visible");
    });
  });

  // Dissolve message automatically after a few moments (3.5s) so map and road remain clear
  navToastTimeout = setTimeout(() => {
    toasts.forEach((toast) => {
      toast.classList.remove("visible");
      setTimeout(() => {
        if (!toast.classList.contains("visible")) {
          toast.style.display = "none";
        }
      }, 350);
    });
    navToastTimeout = null;
  }, 3500);
};

export const clearNavigation = function (targetMap = map) {
  if (activeOsrmAbortController) {
    activeOsrmAbortController.abort();
    activeOsrmAbortController = null;
  }
  isNavigatingToArrow = false;
  const activeMap = targetMap || map;

  if (activeMap) {
    if (navGuidePolyline && activeMap.hasLayer(navGuidePolyline)) {
      activeMap.removeLayer(navGuidePolyline);
    }
    if (navGuideCasingPolyline && activeMap.hasLayer(navGuideCasingPolyline)) {
      activeMap.removeLayer(navGuideCasingPolyline);
    }
  }
  navGuidePolyline = null;
  navGuideCasingPolyline = null;

  // Restore HUD headers from navigating layout
  const hudContainers = [
    document.getElementById("map-hud-top"),
    document.getElementById("complete-map-hud-top"),
  ].filter(Boolean);
  hudContainers.forEach((h) => {
    h.classList.remove("is-navigating");
  });

  // Hide directions banners
  const banners = [
    document.getElementById("map-directions-banner"),
    document.getElementById("complete-directions-banner"),
  ].filter(Boolean);
  banners.forEach((b) => {
    b.style.display = "none";
  });

  // Dismiss any momentary toast
  const toasts = [
    document.getElementById("map-nav-toast"),
    document.getElementById("complete-nav-toast"),
  ].filter(Boolean);
  toasts.forEach((t) => {
    t.classList.remove("visible");
    t.style.display = "none";
  });
  if (navToastTimeout) {
    clearTimeout(navToastTimeout);
    navToastTimeout = null;
  }

  // Reset navigate button states
  const navBtns = [
    document.getElementById("btn-navigate-arrow"),
    document.getElementById("btn-complete-navigate"),
  ].filter(Boolean);
  navBtns.forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("title", "Get directions to arrow");
  });
};

/**
 * Lead athlete from current position to the placed arrow marker with turn/direction guidance
 * @param {L.Map} targetMap
 */
export const navigateToArrow = async function (targetMap = map) {
  const activeMap = targetMap || map;
  if (!activeMap || !clickArrowMarker) return;

  const targetLatLng = clickArrowMarker.getLatLng();
  const dest = [targetLatLng.lat, targetLatLng.lng];

  // Determine current athlete position
  let start;
  if (currentMarker) {
    const cll = currentMarker.getLatLng();
    start = [cll.lat, cll.lng];
  } else if (routeCoords.length > 0) {
    start = routeCoords[routeCoords.length - 1];
  } else {
    start = getStoredLocation();
  }

  isNavigatingToArrow = true;

  if (activeOsrmAbortController) {
    activeOsrmAbortController.abort();
  }
  activeOsrmAbortController =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const currentSignal = activeOsrmAbortController
    ? activeOsrmAbortController.signal
    : null;

  // Mark HUD headers as active navigation so mobile screens dock cleanly at top without blocking road
  const hudContainers = [
    document.getElementById("map-hud-top"),
    document.getElementById("complete-map-hud-top"),
  ].filter(Boolean);
  hudContainers.forEach((h) => {
    h.classList.add("is-navigating");
  });

  // Update navigate button states to active
  const navBtns = [
    document.getElementById("btn-navigate-arrow"),
    document.getElementById("btn-complete-navigate"),
  ].filter(Boolean);
  navBtns.forEach((btn) => {
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("title", "Clear directions");
    btn.style.display = "flex";
  });

  const distKm = calculateHaversineKm(start, dest);
  const bearing = calculateBearing(start, dest);
  const compass = getCompassDirection(bearing);
  const distStr =
    distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
  const estMins = Math.max(1, Math.round((distKm / 11) * 60));

  const updateBannerUI = (title, meta, bearingDeg) => {
    const banners = [
      document.getElementById("map-directions-banner"),
      document.getElementById("complete-directions-banner"),
    ].filter(Boolean);

    banners.forEach((banner) => {
      banner.style.display = "flex";
      const titleEl = banner.querySelector(".nav-direction-title");
      const metaEl = banner.querySelector(".nav-direction-meta");
      const arrowEl = banner.querySelector(".nav-bearing-icon");

      if (titleEl) titleEl.textContent = title;
      if (metaEl) metaEl.textContent = meta;
      if (arrowEl && Number.isFinite(bearingDeg)) {
        arrowEl.style.transform = `rotate(${bearingDeg}deg)`;
      }
    });
  };

  const renderGuidePolyline = (coords) => {
    if (!isNavigatingToArrow || !activeMap) return;

    if (!navGuideCasingPolyline) {
      navGuideCasingPolyline = L.polyline(coords, {
        color: "#060d0c",
        weight: 8,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(activeMap);
    } else {
      navGuideCasingPolyline.setLatLngs(coords);
      if (!activeMap.hasLayer(navGuideCasingPolyline)) {
        navGuideCasingPolyline.addTo(activeMap);
      }
    }

    if (!navGuidePolyline) {
      navGuidePolyline = L.polyline(coords, {
        color: "#00d9f5",
        weight: 4.5,
        opacity: 1,
        dashArray: "8, 8",
        className: "nav-guide-polyline",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(activeMap);
    } else {
      navGuidePolyline.setLatLngs(coords);
      if (!activeMap.hasLayer(navGuidePolyline)) {
        navGuidePolyline.addTo(activeMap);
      }
    }

    if (coords.length > 1) {
      if (typeof activeMap.fitBounds === "function") {
        const isMobile =
          typeof window !== "undefined" && window.innerWidth <= 768;
        // On phone screens, ensure top padding keeps the road and destination completely clear beneath top instructions
        activeMap.fitBounds(L.latLngBounds ? L.latLngBounds(coords) : coords, {
          paddingTopLeft: isMobile ? [16, 62] : [45, 45],
          paddingBottomRight: isMobile ? [16, 42] : [45, 45],
          maxZoom: 17,
        });
      }
    }
  };

  // 1. Render immediate direct guideline while fetching road routing
  renderGuidePolyline([start, dest]);
  updateBannerUI(
    `Head ${compass} · ${distStr}`,
    `~${estMins} min · Calculating path...`,
    bearing,
  );
  showNavToast(
    "Navigating to Destination",
    `Calculating walking route · ${distStr}`,
  );

  // 2. Fetch precision street routing from OSRM
  try {
    const route = await fetchOsrmRoute(start, dest, currentSignal);
    if (!isNavigatingToArrow || (currentSignal && currentSignal.aborted))
      return;
    renderGuidePolyline(route.coords);
    const roadDistStr =
      route.distanceMeters < 1000
        ? `${Math.round(route.distanceMeters)} m`
        : `${(route.distanceMeters / 1000).toFixed(1)} km`;
    const roadMins = Math.max(1, Math.round(route.durationSec / 60));
    updateBannerUI(
      `Head ${compass} · ${roadDistStr}`,
      `~${roadMins} min · Walking route`,
      bearing,
    );
    showNavToast(
      "Navigating to Destination",
      `${roadDistStr} · ~${roadMins} min walking route`,
    );
  } catch {
    if (currentSignal && currentSignal.aborted) return;
    if (!isNavigatingToArrow) return;
    // Graceful offline fallback: keep direct guidance line
    renderGuidePolyline([start, dest]);
    updateBannerUI(
      `Head ${compass} · ${distStr}`,
      `~${estMins} min · Direct guideline`,
      bearing,
    );
    showNavToast("Navigating to Destination", `Direct guideline · ${distStr}`);
  }
};

export const showCurrentLocation = function (targetMap = map, options = {}) {
  const activeMap = targetMap || map;
  const locateBtns = [
    document.getElementById("btn-show-location"),
    document.getElementById("btn-complete-locate"),
  ].filter(Boolean);

  locateBtns.forEach((btn) => {
    btn.classList.add("is-locating");
    btn.setAttribute("aria-busy", "true");
  });

  updateGpsStatusBadge(true, "Acquiring current GPS fix...");

  const handleSuccess = function (coords, accuracy = 0) {
    locateBtns.forEach((btn) => {
      btn.classList.remove("is-locating");
      btn.removeAttribute("aria-busy");
    });

    const [lat, lng] = coords;
    setStorageItem(STORAGE_KEYS.LAST_LOCATION, coords);
    updateGpsStatusBadge(true, "Live GPS Active");

    if (activeMap) {
      if (typeof activeMap.flyTo === "function") {
        activeMap.flyTo([lat, lng], 17, { duration: 1 });
      } else if (typeof activeMap.setView === "function") {
        activeMap.setView([lat, lng], 17, { animate: true });
      }

      if (!currentMarker) {
        currentMarker = L.circleMarker([lat, lng], {
          radius: 9,
          color: "#060d0c",
          weight: 3,
          fillColor: "#00d9f5",
          fillOpacity: 1,
        }).addTo(activeMap);
      } else {
        currentMarker.setLatLng([lat, lng]);
        if (!activeMap.hasLayer(currentMarker)) {
          currentMarker.addTo(activeMap);
        }
      }

      // Add or update accuracy halo if accuracy is available
      if (accuracy > 0 && typeof L.circle === "function") {
        if (
          locationAccuracyCircle &&
          activeMap.hasLayer(locationAccuracyCircle)
        ) {
          activeMap.removeLayer(locationAccuracyCircle);
        }
        locationAccuracyCircle = L.circle([lat, lng], {
          radius: Math.min(accuracy, 200),
          color: "#00d9f5",
          weight: 1,
          opacity: 0.5,
          fillColor: "#00d9f5",
          fillOpacity: 0.08,
        }).addTo(activeMap);
      }
    }

    if (typeof options.onSuccess === "function") {
      options.onSuccess(coords, accuracy);
    }
  };

  const handleError = function (err) {
    locateBtns.forEach((btn) => {
      btn.classList.remove("is-locating");
      btn.removeAttribute("aria-busy");
    });

    const isTimeout = err && err.code === 3;
    const isDenied = err && err.code === 1;
    const reasonMsg = isDenied
      ? "Location permission denied"
      : isTimeout
        ? "GPS fix timed out"
        : "GPS unavailable";

    console.info(
      `Notice: ${reasonMsg}, displaying stored position:`,
      err ? err.message || err : "",
    );
    const fallbackCoords = getStoredLocation();

    updateGpsStatusBadge(false, `${reasonMsg} · Showing last known position`);

    if (activeMap) {
      if (typeof activeMap.flyTo === "function") {
        activeMap.flyTo(fallbackCoords, 16, { duration: 1 });
      } else if (typeof activeMap.setView === "function") {
        activeMap.setView(fallbackCoords, 16, { animate: true });
      }

      if (!currentMarker) {
        currentMarker = L.circleMarker(fallbackCoords, {
          radius: 9,
          color: "#060d0c",
          weight: 3,
          fillColor: "#00d9f5",
          fillOpacity: 1,
        }).addTo(activeMap);
      } else {
        currentMarker.setLatLng(fallbackCoords);
        if (!activeMap.hasLayer(currentMarker)) {
          currentMarker.addTo(activeMap);
        }
      }
    }

    if (typeof options.onError === "function") {
      options.onError(err);
    }
  };

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    // Attempt 1: High accuracy GPS fix (ideal for mobile devices & outdoors)
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        handleSuccess(
          [pos.coords.latitude, pos.coords.longitude],
          pos.coords.accuracy || 0,
        );
      },
      function (err) {
        // Attempt 2: If high-accuracy timed out (code 3) or unavailable (code 2),
        // fallback to standard network/Wi-Fi/IP location (vital for laptops/desktops and indoors)
        if (err && (err.code === 3 || err.code === 2)) {
          navigator.geolocation.getCurrentPosition(
            function (coarsePos) {
              handleSuccess(
                [coarsePos.coords.latitude, coarsePos.coords.longitude],
                coarsePos.coords.accuracy || 0,
              );
            },
            function () {
              handleError(err);
            },
            {
              enableHighAccuracy: false,
              timeout: 6000,
              maximumAge: 120000,
            },
          );
          return;
        }
        handleError(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 10000,
      },
    );
  } else {
    handleError(new Error("Geolocation unsupported"));
  }
};

const renderFallbackState = function (container, message) {
  if (map) return;
  container.innerHTML = `
    <div class="map-grid-layer"></div>
    <div class="map-hud-top">
      <div class="gps-badge">
        <span class="gps-indicator-dot"></span>
        <span class="gps-status-text"></span>
      </div>
    </div>
  `;
  const textSpan = container.querySelector(".gps-status-text");
  if (textSpan) {
    textSpan.textContent = String(message || "");
  }
};

const ensureMapInitialized = function (initialCoords) {
  const mapContainer = document.getElementById("map-viewport");
  if (!mapContainer || typeof L === "undefined") return null;

  if (!map) {
    mapContainer.innerHTML = `
      <div class="map-hud-top" id="map-hud-top">
        <div class="gps-badge ${routeCoords.length > 0 ? "active" : ""}" id="map-gps-badge">
          <span class="gps-indicator-dot"></span>
          <span id="map-gps-status">${routeCoords.length > 0 ? "Live GPS Active" : "Acquiring GPS signal..."}</span>
        </div>
        <div class="nav-directions-banner" id="map-directions-banner" style="display: none;" role="status" title="Navigation instructions">
          <div class="nav-directions-left">
            <div class="nav-bearing-icon" title="Compass heading">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 19 21 12 17 5 21 12 2"/>
              </svg>
            </div>
            <div class="nav-directions-text">
              <div class="nav-direction-title">Head North · 300 m</div>
              <div class="nav-direction-meta">~2 min · Route</div>
            </div>
          </div>
          <button type="button" class="nav-directions-close" id="btn-cancel-directions" title="Clear directions" aria-label="Clear directions">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="nav-moment-toast" id="map-nav-toast" style="display: none;" role="status">
        <div class="nav-moment-toast-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
        </div>
        <div class="nav-moment-toast-content">
          <div class="nav-moment-toast-title">Navigating to Destination</div>
          <div class="nav-moment-toast-sub">Follow the highlighted path on your map</div>
        </div>
      </div>
      <div class="map-controls-group">
        <button
          type="button"
          class="map-control-btn nav-target-btn"
          id="btn-navigate-arrow"
          title="Get directions to arrow"
          aria-label="Get directions to arrow"
          style="display: none;"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
        </button>
        <button
          type="button"
          class="map-control-btn"
          id="btn-show-location"
          title="Current location"
          aria-label="Current location"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="locate-icon">
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
          </svg>
        </button>
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

    // Attach locate current position button listener
    const locateFloatingBtn = mapContainer.querySelector("#btn-show-location");
    if (locateFloatingBtn) {
      locateFloatingBtn.addEventListener("click", function (evt) {
        evt.stopPropagation();
        showCurrentLocation(map);
      });
    }

    // Attach navigate to arrow button listener
    const navigateFloatingBtn = mapContainer.querySelector(
      "#btn-navigate-arrow",
    );
    if (navigateFloatingBtn) {
      navigateFloatingBtn.addEventListener("click", function (evt) {
        evt.stopPropagation();
        if (isNavigatingToArrow) {
          clearNavigation(map);
        } else {
          navigateToArrow(map);
        }
      });
    }

    // Attach dismiss directions banner button listener
    const cancelDirectionsBtn = mapContainer.querySelector(
      "#btn-cancel-directions",
    );
    if (cancelDirectionsBtn) {
      cancelDirectionsBtn.addEventListener("click", function (evt) {
        evt.stopPropagation();
        clearNavigation(map);
      });
    }

    // Tapping instructions banner re-displays momentary status toast on demand
    const directionsBannerEl = mapContainer.querySelector(
      "#map-directions-banner",
    );
    if (directionsBannerEl) {
      directionsBannerEl.addEventListener("click", function (evt) {
        if (evt.target.closest("#btn-cancel-directions")) return;
        const titleEl = directionsBannerEl.querySelector(
          ".nav-direction-title",
        );
        const metaEl = directionsBannerEl.querySelector(".nav-direction-meta");
        showNavToast(
          titleEl ? titleEl.textContent : "Navigating to Destination",
          metaEl ? metaEl.textContent : "Follow highlighted path on your map",
        );
      });
    }

    // Listen for click events anywhere on the map using Leaflet's .on() API
    map.on("click", function (e) {
      if (!e || !e.latlng) return;
      setOrMoveArrowMarker(map, e.latlng);
    });

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

const recordCoordinate = function (
  coords,
  accuracy = 0,
  nativeSpeed = null,
  timestamp = Date.now(),
) {
  if (isTrackingStopped) return;

  // Filter out wild satellite multipath spikes if accuracy is poor
  if (accuracy > MAX_ACCEPTABLE_ACCURACY_M && routeCoords.length > 0) {
    return;
  }

  const now = timestamp || Date.now();
  let measuredSpeed = 0;

  if (
    typeof nativeSpeed === "number" &&
    !isNaN(nativeSpeed) &&
    nativeSpeed >= 0
  ) {
    // W3C Geolocation API coords.speed is in m/s; convert to km/h
    measuredSpeed = nativeSpeed * 3.6;
  } else if (lastRecordedGpsCoord && lastRecordedGpsTime > 0) {
    const dtSeconds = (now - lastRecordedGpsTime) / 1000;
    const stepKm = calculateHaversineKm(lastRecordedGpsCoord, coords);
    if (dtSeconds >= 0.5 && dtSeconds <= 12 && stepKm < 0.25) {
      measuredSpeed = (stepKm / dtSeconds) * 3600;
    }
  }

  // Deadband threshold: stationary GPS jitter under 0.9 km/h is treated as stopped
  if (measuredSpeed < 0.9) {
    measuredSpeed = 0;
  } else {
    measuredSpeed =
      currentGpsSpeedKmh > 0
        ? currentGpsSpeedKmh * 0.35 + measuredSpeed * 0.65
        : measuredSpeed;
  }

  currentGpsSpeedKmh = Number(measuredSpeed.toFixed(1));
  lastRecordedGpsCoord = coords;
  lastRecordedGpsTime = now;

  // Stationary watchdog timer: if no new GPS motion occurs for 3.5s, report stopped
  if (stationaryWatchdogTimer) clearTimeout(stationaryWatchdogTimer);
  stationaryWatchdogTimer = setTimeout(() => {
    currentGpsSpeedKmh = 0;
    if (typeof onRouteUpdateCallback === "function" && !isTrackingStopped) {
      onRouteUpdateCallback({
        coords: [...routeCoords],
        distanceKm: totalTrackedDistanceKm,
        currentPosition: coords,
        speedKmh: 0,
        isMoving: false,
      });
    }
  }, 3500);

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

      // Decimate when excessively large to keep Leaflet polyline rendering smooth
      routeCoords = decimateRoute(routeCoords, 600);
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
      speedKmh: currentGpsSpeedKmh,
      isMoving: currentGpsSpeedKmh >= 0.9,
    });
  }

  // Live real-time directions update if athlete is navigating to the arrow
  if (isNavigatingToArrow && clickArrowMarker) {
    const targetLatLng = clickArrowMarker.getLatLng();
    const dest = [targetLatLng.lat, targetLatLng.lng];
    const remainingKm = calculateHaversineKm(coords, dest);

    // Keep navigation guidance polyline glued to the moving runner
    if (navGuidePolyline && typeof navGuidePolyline.getLatLngs === "function") {
      const currentPoints = navGuidePolyline.getLatLngs();
      if (Array.isArray(currentPoints) && currentPoints.length > 1) {
        currentPoints[0] = L.latLng ? L.latLng(coords[0], coords[1]) : coords;
        navGuidePolyline.setLatLngs(currentPoints);
        if (
          navGuideCasingPolyline &&
          typeof navGuideCasingPolyline.setLatLngs === "function"
        ) {
          navGuideCasingPolyline.setLatLngs(currentPoints);
        }
      }
    }

    if (remainingKm <= 0.015) {
      const banners = [
        document.getElementById("map-directions-banner"),
        document.getElementById("complete-directions-banner"),
      ].filter(Boolean);
      banners.forEach((banner) => {
        const titleEl = banner.querySelector(".nav-direction-title");
        const metaEl = banner.querySelector(".nav-direction-meta");
        if (titleEl) titleEl.textContent = "Target reached! 🎯";
        if (metaEl)
          metaEl.textContent = "You have arrived at your arrow location";
      });
      showNavToast(
        "Target reached! 🎯",
        "You have arrived at your arrow location",
      );
    } else {
      const bearing = calculateBearing(coords, dest);
      const compass = getCompassDirection(bearing);
      const distStr =
        remainingKm < 1
          ? `${Math.round(remainingKm * 1000)} m`
          : `${remainingKm.toFixed(1)} km`;
      const estMins = Math.max(1, Math.round((remainingKm / 11) * 60));

      const banners = [
        document.getElementById("map-directions-banner"),
        document.getElementById("complete-directions-banner"),
      ].filter(Boolean);
      banners.forEach((banner) => {
        const titleEl = banner.querySelector(".nav-direction-title");
        const metaEl = banner.querySelector(".nav-direction-meta");
        const arrowEl = banner.querySelector(".nav-bearing-icon");
        if (titleEl) titleEl.textContent = `Head ${compass} · ${distStr}`;
        if (metaEl) metaEl.textContent = `~${estMins} min remaining`;
        if (arrowEl) arrowEl.style.transform = `rotate(${bearing}deg)`;
      });
    }
  }
};

export const startRouteTracking = function (options = {}) {
  const {
    initialCoords = [],
    initialDistanceKm = 0,
    onUpdate = null,
  } = options;

  onRouteUpdateCallback = onUpdate;
  isTrackingStopped = false;

  if (
    Array.isArray(initialCoords) &&
    initialCoords.length > 0 &&
    routeCoords.length === 0
  ) {
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
      },
    );
  }

  // Tier 2: Continuous precision GPS tracking
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    function (position) {
      const { latitude, longitude, accuracy, speed } = position.coords;
      const timestamp = position.timestamp || Date.now();
      recordCoordinate([latitude, longitude], accuracy, speed, timestamp);
    },
    function () {
      const mapContainer = document.getElementById("map-viewport");
      if (!map && mapContainer) {
        renderFallbackState(
          mapContainer,
          "Location access unavailable · Showing simulated grid",
        );
      } else {
        updateGpsStatusBadge(false, "GPS signal lost · Retrying...");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    },
  );
};

export const stopRouteTracking = function () {
  isTrackingStopped = true;
  if (stationaryWatchdogTimer) {
    clearTimeout(stationaryWatchdogTimer);
    stationaryWatchdogTimer = null;
  }
  currentGpsSpeedKmh = 0;
  lastRecordedGpsCoord = null;
  lastRecordedGpsTime = 0;
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

/**
 * Clean up active Leaflet map instance and tracking state
 */
export const destroyMap = function () {
  if (navToastTimeout) {
    clearTimeout(navToastTimeout);
    navToastTimeout = null;
  }
  if (activeOsrmAbortController) {
    activeOsrmAbortController.abort();
    activeOsrmAbortController = null;
  }
  clearNavigation(map);
  stopRouteTracking();
  if (map) {
    try {
      [
        originMarker,
        currentMarker,
        locationAccuracyCircle,
        clickArrowMarker,
        routePolyline,
        routeCasingPolyline,
      ].forEach((layer) => {
        if (layer && typeof map.removeLayer === "function") {
          try {
            map.removeLayer(layer);
          } catch {}
        }
      });
      map.remove();
    } catch (err) {
      // Silently ignore teardown errors
    }
    map = null;
  }
  routePolyline = null;
  routeCasingPolyline = null;
  originMarker = null;
  currentMarker = null;
  clickArrowMarker = null;
  locationAccuracyCircle = null;
  routeCoords = [];
  totalTrackedDistanceKm = 0;
  onRouteUpdateCallback = null;
  isTrackingStopped = false;
};
