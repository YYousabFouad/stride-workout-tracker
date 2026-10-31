import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalLeaflet = Object.getOwnPropertyDescriptor(globalThis, "L");

afterEach(() => {
  for (const [key, descriptor] of [
    ["document", originalDocument],
    ["window", originalWindow],
    ["navigator", originalNavigator],
    ["localStorage", originalLocalStorage],
    ["L", originalLeaflet],
  ]) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  }
});

test("a completion-slot update stops a stale tab when active persistence failed", async () => {
  const workout = {
    id: "workout-shared",
    sport: "run",
    sportLabel: "Running",
    goal: "distance",
    targetValue: 5,
    targetUnit: "km",
    startTime: Date.now() - 1000,
    status: "in_progress",
    saved: false,
    routeCoords: [],
    gpsDistanceKm: 0,
  };
  const completedWorkout = {
    ...workout,
    status: "complete",
    endTime: Date.now(),
    elapsedSeconds: 1,
    distanceKm: 0,
  };
  const persisted = new Map([
    ["stride_active_workout", JSON.stringify(workout)],
    ["stride_completed_workout", JSON.stringify(completedWorkout)],
  ]);
  let storageListener;
  const targetHint = { textContent: "" };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => persisted.get(key) ?? null },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "" },
      addEventListener: (type, listener) => {
        if (type === "storage") storageListener = listener;
      },
      removeEventListener: () => {},
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      visibilityState: "visible",
      getElementById: (id) =>
        id === "view-progress"
          ? {}
          : id === "live-target-hint"
            ? targetHint
            : null,
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });

  const { initProgressScreen } = await import(
    `../js/screens/progress.js?storage-race-test=${Date.now()}-${Math.random()}`
  );
  initProgressScreen();

  assert.equal(typeof storageListener, "function");
  storageListener({ key: "stride_completed_workout" });

  assert.equal(window.location.href, "complete.html");
});

test("map mode in preview does not initialize a map or request GPS", async () => {
  let mapInitializationCount = 0;
  let watchPositionCount = 0;
  let modeMapClickPromise;
  const makeButton = () => {
    const listeners = new Map();
    return {
      classList: { add: () => {}, remove: () => {} },
      addEventListener: (type, listener) => listeners.set(type, listener),
      click: () => {
        modeMapClickPromise = listeners.get("click")?.({});
        return modeMapClickPromise;
      },
      setAttribute: () => {},
    };
  };
  const mode3dButton = makeButton();
  const modeMapButton = makeButton();
  const runnerViewport = { hidden: false };
  const mapViewport = {
    hidden: true,
    querySelector: () => null,
    replaceChildren: (...children) => {
      mapViewport.children = children;
    },
  };
  const elements = new Map([
    ["view-progress", {}],
    ["btn-mode-3d", mode3dButton],
    ["btn-mode-map", modeMapButton],
    ["runner-3d-viewport", runnerViewport],
    ["map-viewport", mapViewport],
  ]);

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: () => {
          watchPositionCount += 1;
          return 1;
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
        throw new Error("preview mode should not initialize Leaflet");
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "?mode=map", hash: "" },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id) => elements.get(id) || null,
      createElement: () => ({ className: "", textContent: "" }),
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });

  const { initProgressScreen } = await import(
    `../js/screens/progress.js?preview-map-test=${Date.now()}-${Math.random()}`
  );
  assert.doesNotThrow(() => initProgressScreen());
  await assert.doesNotReject(modeMapClickPromise);

  assert.equal(mapInitializationCount, 0);
  assert.equal(watchPositionCount, 0);
  assert.equal(mapViewport.hidden, false);
  assert.equal(
    mapViewport.children[0].textContent,
    "Start a workout to track a GPS route.",
  );
});
