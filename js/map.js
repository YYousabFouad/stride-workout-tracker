/**
 * Stride Workout Tracker — GPS Route Map
 * Renders live geolocation map using Leaflet and the Geolocation API.
 */

let map = null;
let isLoading = false;

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
    console.error("Leaflet library (L) is not loaded");
    return;
  }

  if (navigator.geolocation) {
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

        map = L.map("map-viewport").setView(coords, 13);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.marker(coords)
          .addTo(map)
          .bindPopup("A pretty CSS popup.<br> Easily customizable.")
          .openPopup();

        setTimeout(() => {
          map.invalidateSize();
        }, 100);
      },
      function () {
        isLoading = false;
        alert("We could not find you current position");
      }
    );
  }
};

export const initMap = loadMap;
