import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalLeaflet = Object.getOwnPropertyDescriptor(globalThis, "L");
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");

afterEach(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    delete globalThis.document;
  }
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete globalThis.navigator;
  }
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
  if (originalLeaflet) {
    Object.defineProperty(globalThis, "L", originalLeaflet);
  } else {
    delete globalThis.L;
  }
  if (originalFetch) {
    Object.defineProperty(globalThis, "fetch", originalFetch);
  } else {
    delete globalThis.fetch;
  }
});

test("reports when geolocation is unavailable instead of silently idling", async () => {
  const gpsStatus = { textContent: "" };
  const mapContainer = {
    innerHTML: "",
    querySelector: (selector) =>
      selector === ".gps-status-text" ? gpsStatus : null,
  };
  const targetHint = { textContent: "" };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id) =>
        id === "map-viewport"
          ? mapContainer
          : id === "live-target-hint"
            ? targetHint
            : null,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });

  const { startRouteTracking, stopRouteTracking } = await import(
    `../js/visualizers/map.js?test=${Date.now()}-${Math.random()}`
  );

  startRouteTracking();
  assert.equal(gpsStatus.textContent, "Location tracking unavailable");
  assert.match(
    targetHint.textContent,
    /Distance goals cannot progress without GPS/,
  );
  assert.doesNotThrow(() => stopRouteTracking());
});

test("does not persist a coarse GPS result after tracking stops", async () => {
  let resolveCoarseLocation;
  const persisted = new Map();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => persisted.set(key, String(value)),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (resolve) => {
          resolveCoarseLocation = resolve;
        },
        watchPosition: () => 1,
        clearWatch: () => {},
      },
    },
  });

  const { destroyMap, startRouteTracking, stopRouteTracking } = await import(
    `../js/visualizers/map.js?late-location-test=${Date.now()}-${Math.random()}`
  );

  startRouteTracking();
  stopRouteTracking();
  destroyMap();
  resolveCoarseLocation({ coords: { latitude: 30, longitude: 31 } });

  assert.equal(persisted.has("stride_last_location"), false);
});

test("does not persist a fresh location from the completed workout map", async () => {
  const persisted = new Map([
    [
      "stride_active_workout",
      JSON.stringify({
        status: "complete",
        startTime: 1000,
        sport: "run",
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => persisted.set(key, String(value)),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (resolve) =>
          resolve({ coords: { latitude: 30, longitude: 31, accuracy: 5 } }),
      },
    },
  });

  const { showCurrentLocation } = await import(
    `../js/visualizers/map.js?completed-location-test=${Date.now()}-${Math.random()}`
  );

  showCurrentLocation();

  assert.equal(persisted.has("stride_last_location"), false);
});

test("ignores a non-finite native GPS speed", async () => {
  let onPosition;
  const updates = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: (success) => {
          onPosition = success;
          return 7;
        },
        clearWatch: () => {},
      },
    },
  });

  const { startRouteTracking, stopRouteTracking } = await import(
    `../js/visualizers/map.js?non-finite-speed=${Date.now()}-${Math.random()}`
  );
  startRouteTracking({ onUpdate: (update) => updates.push(update) });
  onPosition({
    coords: { latitude: 30, longitude: 31, accuracy: 5, speed: 0 },
    timestamp: 1000,
  });
  onPosition({
    coords: { latitude: 30, longitude: 31, accuracy: 5, speed: Infinity },
    timestamp: 2000,
  });
  stopRouteTracking();

  assert.equal(updates.at(-1).speedKmh, 0);
});

test("does not use a low-accuracy first GPS fix as the route origin", async () => {
  let onPosition;
  const updates = [];
  const persisted = new Map();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => persisted.set(key, String(value)),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: (success) => {
          onPosition = success;
          return 8;
        },
        clearWatch: () => {},
      },
    },
  });

  const { startRouteTracking, stopRouteTracking, getRouteData } = await import(
    `../js/visualizers/map.js?accuracy-origin-test=${Date.now()}-${Math.random()}`
  );
  startRouteTracking({ onUpdate: (update) => updates.push(update) });
  onPosition({
    coords: { latitude: 30, longitude: 31, accuracy: 120, speed: null },
    timestamp: 1000,
  });
  assert.equal(getRouteData().coords.length, 0);
  assert.equal(updates.length, 0);

  onPosition({
    coords: { latitude: 30.001, longitude: 31.001, accuracy: 5, speed: null },
    timestamp: 2000,
  });
  stopRouteTracking();

  assert.equal(getRouteData().coords.length, 1);
  assert.equal(getRouteData().distanceKm, 0);
  assert.equal(updates.length, 1);
});

test("does not initialize the map or request tiles while the 3D view is active", async () => {
  let onPosition;
  let mapInitializationCount = 0;
  const mapContainer = { hidden: true };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id) => (id === "map-viewport" ? mapContainer : null),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: (success) => {
          onPosition = success;
          return 9;
        },
        clearWatch: () => {},
      },
    },
  });
  Object.defineProperty(globalThis, "L", {
    configurable: true,
    value: {
      map: () => {
        mapInitializationCount += 1;
        throw new Error("hidden map should not initialize");
      },
    },
  });

  const { startRouteTracking, stopRouteTracking } = await import(
    `../js/visualizers/map.js?hidden-map-test=${Date.now()}-${Math.random()}`
  );
  startRouteTracking();
  onPosition({
    coords: { latitude: 30, longitude: 31, accuracy: 5, speed: null },
    timestamp: 1000,
  });
  stopRouteTracking();

  assert.equal(mapInitializationCount, 0);
});

test("validates OSRM route coordinates and metrics before returning them", async () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => ({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [31.2, 30.1],
                [31.3, 30.2],
              ],
            },
            distance: 1250,
            duration: 600,
          },
        ],
      }),
    }),
  });

  const { fetchOsrmRoute } = await import(
    `../js/visualizers/map.js?osrm-valid-test=${Date.now()}-${Math.random()}`
  );
  const route = await fetchOsrmRoute([30.1, 31.2], [30.2, 31.3]);

  assert.deepEqual(route, {
    coords: [
      [30.1, 31.2],
      [30.2, 31.3],
    ],
    distanceMeters: 1250,
    durationSec: 600,
  });
});

test("rejects malformed OSRM metrics and coordinates", async (t) => {
  const invalidRoutes = [
    {
      geometry: { coordinates: [[31.2, 30.1]] },
      distance: Number.NaN,
      duration: 600,
    },
    {
      geometry: { coordinates: [[181, 30.1]] },
      distance: 1250,
      duration: 600,
    },
    {
      geometry: { coordinates: [[31.2, 91]] },
      distance: 1250,
      duration: 600,
    },
    {
      geometry: { coordinates: [] },
      distance: 1250,
      duration: 600,
    },
  ];
  const { fetchOsrmRoute } = await import(
    `../js/visualizers/map.js?osrm-invalid-test=${Date.now()}-${Math.random()}`
  );

  for (const route of invalidRoutes) {
    await t.test(JSON.stringify(route), async () => {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
          ok: true,
          json: async () => ({ code: "Ok", routes: [route] }),
        }),
      });
      await assert.rejects(
        fetchOsrmRoute([30.1, 31.2], [30.2, 31.3]),
        /Invalid route data|Invalid route coordinate|Route has no coordinates/,
      );
    });
  }
});
