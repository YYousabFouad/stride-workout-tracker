# 🏃 Stride — Workout Tracker

A modern, responsive web application for planning, tracking, and reviewing running and cycling workouts. Built with vanilla HTML5, modular CSS, and native JavaScript ES modules following strict **DRY** (Don't Repeat Yourself) and **KISS** (Keep It Simple, Stupid) engineering standards.

---

## ✨ Features

- **🎯 Screen 1: Plan Workout (`index.html`)**
  - Choose between **Running** and **Riding (Cycling)**.
  - Set custom workout targets by **Distance** (km) or **Time** (minutes).
  - Domain boundary validation and smart unit switching.
- **⏱️ Screen 2: In Progress (`progress.html`)**
  - **🏃 3D Cyberpunk Runner Visualizer**: Fully interactive 3D runner powered by **Three.js** with procedural kinematic rigging (pelvic bounce, leg drive, elbow swing), speed warp particle field, and **Vanta-inspired** dynamic undulating wave terrain.
  - **🎥 Cinematic Camera Presets**: Smooth camera angle switching (`Perspective`, `Side`, `Follow`) with **Anime.js** tween transitions and mouse/touch 360° orbit controls.
  - **⚡ Live Biomechanical Telemetry**: Real-time HUD displaying pace-synchronized cadence (SPM) and speed (km/h).
  - **🗺️ GPS Route Map Toggle**: Seamless one-click switching between the 3D Runner and the GPS route tracking map.
  - Live elapsed time counter and dynamic target progress percentage.
  - Real-time progress bar with goal milestone alerts.
- **🏆 Screen 3: Complete (`complete.html`)**
  - Detailed workout summary displaying final distance and elapsed duration.
  - Automatic streak incrementation and streak celebration banner.
  - One-click workout saving to local workout history.
- **📊 Screen 4: History (`history.html`)**
  - Chronological activity log showing all past workout sessions.
  - Sport-specific icons (Running vs. Riding badges), dates, distances, and times.
- **👤 Global Account & Modal Controller**
  - Accessible modal dialog for user account creation.
  - Full keyboard support (Escape key close) and backdrop click handling.
  - Global navigation bar with active screen indicators and streak badge counter.

---

## 🏗️ Architecture & Project Structure

The project adheres to modular separation of concerns without heavy framework overhead:

```text
stride-workout-tracker/
├── index.html                 # Screen 1: Plan Workout setup
├── progress.html              # Screen 2: Active workout tracking
├── complete.html              # Screen 3: Workout summary & streak awards
├── history.html               # Screen 4: Activity log & history
│
├── css/                       # Modular CSS Architecture
│   ├── variables.css          # Design tokens (colors, spacing, typography, radii)
│   ├── base.css               # CSS resets, root defaults, and typography
│   ├── layout.css             # Grid systems, containers, navbar, view-switcher
│   ├── components.css         # Buttons, cards, segmented controls, forms
│   ├── map.css                # Map canvas, route paths, and control overlays
│   ├── runner-3d.css          # 3D viewport, HUD telemetry badges, camera presets
│   ├── modal.css              # Modal dialogs, backdrop animations, and forms
│   └── styles.css             # Main stylesheet entrypoint aggregating layers
│
├── js/                        # Layered Native JavaScript (ES Modules)
│   ├── core/                  # Domain Logic & Persistence Layer
│   │   ├── storage.js         # LocalStorage helpers, domain constants, and sanitizers
│   │   └── streak.js          # Streak counter and UI badge synchronization
│   ├── ui/                    # Global Shell & Shared UI Layer
│   │   ├── shell.js           # Single-source navbar, mobile nav, and modal hydration
│   │   ├── navigation.js      # Screen switcher and client-side routing
│   │   ├── dialog.js          # Shared dialog focus trap, Escape, and focus restore
│   │   └── modal.js           # Account modal controller and event listeners
│   ├── screens/               # Lazy-Loaded Screen Controllers
│   │   ├── plan.js            # Plan workout screen form controller
│   │   ├── progress.js        # Active workout timer loop and metrics tracker
│   │   ├── complete.js        # Summary card controller and idempotent save handlers
│   │   └── history.js         # Historical workout renderer
│   ├── visualizers/           # On-Demand 3D & Map Engines
│   │   ├── runner-3d.js       # Three.js 3D runner, kinematics, Vanta wave mesh
│   │   └── map.js             # Leaflet GPS route map & graceful offline fallback
│   ├── vendor/                # Vendored libraries (Three.js v128, Anime.js v3.2.2)
│   └── main.js                # Main application entrypoint & dynamic module bootstrapper
│
├── scripts/
│   └── dev-server.js          # Zero-dependency static server used by `npm run dev`
├── tests/                     # Node test suites (storage, streak, a11y, dialog)
├── .github/workflows/ci.yml   # Lint, format, and test pipeline
└── README.md                  # Architecture & usage documentation
```

---

## 💾 LocalStorage Data Schema

All workout state is persisted client-side in the browser:

| Key                           | Purpose                                              | Structure                                                                                                               |
| :---------------------------- | :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `stride_active_workout`       | Currently active session                             | `{ id, sport, sportLabel, goal, targetValue, targetUnit, startTime, status, routeCoords }`                              |
| `stride_completed_workout`    | Most recent finished session                         | `{ ...activeWorkout, endTime, elapsedSeconds, finalDuration, finalDistance, targetReached, saved, status: "complete" }` |
| `stride_history`              | Completed sessions, schema v1 (max 50)               | `[ { id, title, sport, startedAtMs, dateLabel, distanceKm, elapsedSeconds, efficiencyValue, efficiencyLabel }, ... ]`   |
| `stride_streak`               | Earned streak days (derived on read)                 | `number` (e.g. `6`)                                                                                                     |
| `stride_streak_last_activity` | Local day key of the last recorded workout           | `"YYYY-MM-DD"`                                                                                                          |
| `stride_schema_version`       | Persisted data shape version                         | `number` (currently `1`)                                                                                                |
| `stride_user`                 | Local athlete profile (not an authenticated account) | `{ username, email, createdAt, updatedAt }`                                                                             |
| `stride_last_location`        | Last known athlete GPS fix                           | `[ latitude, longitude ]`                                                                                               |

---

## 🚀 Getting Started

Because Stride uses **native JavaScript ES Modules** (`<script type="module">`), it must be served over HTTP rather than opened directly via the `file://` protocol.

### Option 1: Project dev server (recommended)

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173). Set `PORT` or `HOST`
to change the address (for example `HOST=0.0.0.0 npm run dev` when testing from
a phone on the same network).

### Option 2: Using `npx serve`

```bash
npx serve .
```

### Option 3: Using Python 3 Built-in HTTP Server

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 4: VS Code / Antigravity Live Server Extension

Right-click `index.html` and select **"Open with Live Server"**.

### Available scripts

| Command                | Purpose                                  |
| :--------------------- | :--------------------------------------- |
| `npm run dev`          | Serve the app at `http://127.0.0.1:4173` |
| `npm test`             | Run the Node test suite                  |
| `npm run lint`         | Lint JavaScript with ESLint              |
| `npm run format`       | Format the repository with Prettier      |
| `npm run format:check` | Verify formatting without writing        |

Every push to `main` and every pull request runs the same lint, format, and test
steps through `.github/workflows/ci.yml`.

---

## 📐 Engineering Principles

- **DRY (Don't Repeat Yourself)**: Shared utilities (time formatting, input sanitization, storage keys) are defined in `storage.js` as single sources of truth.
- **KISS (Keep It Simple, Stupid)**: Linear, understandable vanilla JavaScript with no bloated external build steps or heavy framework runtime.
- **Accessibility (a11y)**: Semantic HTML5 landmarks, skip links, `aria-current` navigation, labelled dialogs with focus trapping and restoration, radiogroup keyboard navigation, live `progressbar` semantics, visible focus rings, and `prefers-reduced-motion` support.
- **Responsive Design**: Mobile-first design that scales smoothly from smartphones to desktop screens.

---

## 🔒 Security Engineering & Privacy Controls

- **Content Security Policy (CSP)**: Each HTML shell limits resource origins and blocks plugins and base URL changes. The current policy trusts scripts from unpkg and allows inline styles for Leaflet; deployments should also send CSP and other security headers as HTTP response headers.
- **No Client-Side Credential Collection**: The app is offline-first and has no authentication service. The local athlete profile collects no password; a browser-side hash would not provide authentication or protect against localStorage access.
- **Zero Trust Input Validation**: Sports and goal parameters are whitelisted against immutable enums, while text inputs are sanitized to strip control characters and bounded in length (CWE-20).
- **Storage Quota & DoS Hardening**: Bounded workout history size (max 50 sessions) and decimation of GPS polyline coordinates prevent client-side `QuotaExceededError` and memory exhaustion (CWE-400).
- **Reverse Tabnabbing Mitigation**: External links include `target="_blank" rel="noopener noreferrer"` to prevent window opener hijacking.
