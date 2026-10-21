/**
 * Stride Workout Tracker — GPS Route Map
 * Renders live geolocation map using Leaflet and the Geolocation API.
 */

let map = null;
let isLoading = false;

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

export const loadMap = function () {
  const mapContainer = document.getElementById("map-viewport");
  if (!mapContainer) return;

  if (map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return;
  }

  if (isLoading) return;

  if (typeof L === "undefined") {
    renderFallbackState(mapContainer, "Map library unavailable offline");
    return;
  }

  if (!navigator.geolocation) {
    renderFallbackState(mapContainer, "Geolocation not supported by browser");
    return;
  }

  isLoading = true;
  navigator.geolocation.getCurrentPosition(
    function (position) {
      isLoading = false;
      const { latitude, longitude } = position.coords;
      const coords = [latitude, longitude];

      if (map) {
        map.invalidateSize();
        return;
      }

      mapContainer.innerHTML = "";
      map = L.map("map-viewport").setView(coords, 14);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      L.marker(coords)
        .addTo(map)
        .bindPopup("Live GPS Position · Active Route")
        .openPopup();

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    },
    function () {
      isLoading = false;
      renderFallbackState(
        mapContainer,
        "Location access unavailable · Showing simulated grid"
      );
    }
  );
};

export const initMap = loadMap;
