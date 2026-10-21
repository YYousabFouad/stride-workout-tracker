/**
 * Stride Workout Tracker — Shared Application Shell
 * Single source of truth for the global navbar, mobile bottom navigation, and account modal.
 */

const NAV_ITEMS = [
  {
    href: "index.html",
    desktopLabel: "1. Plan Workout",
    mobileLabel: "Plan",
    mobileIcon: `
      <circle cx="12" cy="12" r="10"></circle>
      <polygon points="12 8 8 12 12 16 12 8"></polygon>
      <line x1="12" y1="16" x2="16" y2="12"></line>
    `,
  },
  {
    href: "progress.html",
    desktopLabel: "2. In Progress",
    mobileLabel: "Active",
    mobileIcon: `
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    `,
  },
  {
    href: "complete.html",
    desktopLabel: "3. Complete",
    mobileLabel: "Summary",
    mobileIcon: `
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
      <path d="M4 22h16"></path>
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-2.34"></path>
      <path d="M14 14.66V17c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.34"></path>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
    `,
  },
  {
    href: "history.html",
    desktopLabel: "4. History",
    mobileLabel: "History",
    mobileIcon: `
      <path d="M12 20v-6M6 20V10M18 20V4"></path>
    `,
  },
];

const FLAME_ICON_PATH =
  "M12.87 2.5a.75.75 0 0 0-1.28-.53 10.3 10.3 0 0 0-3.3 6.64 6.72 6.72 0 0 0-2.43 1.94A7.47 7.47 0 0 0 4.5 15a7.5 7.5 0 0 0 15 0c0-3.16-1.95-5.91-4.78-7.06a.75.75 0 0 0-.96.95 4.8 4.8 0 0 1 .24 1.51c0 1.25-.6 2.37-1.53 3.08-.24.18-.57.1-.7-.16a7.27 7.27 0 0 0 .1-2.82 8.76 8.76 0 0 0-2-4.5 8.78 8.78 0 0 0-3.7-2.73.75.75 0 0 0-.3.23z";

const getCurrentPage = function () {
  const filename = window.location.pathname.split("/").pop();
  return filename && filename.endsWith(".html") ? filename : "index.html";
};

const renderNavbar = function (currentPage) {
  const desktopPills = NAV_ITEMS.map((item) => {
    const activeClass = item.href === currentPage ? " active" : "";
    return `<a href="${item.href}" class="view-btn${activeClass}">${item.desktopLabel}</a>`;
  }).join("\n          ");

  return `
      <div class="navbar-container">
        <a href="index.html" class="brand">
          <svg
            class="brand-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span class="brand-name">STRIDE<span>.</span></span>
        </a>

        <nav class="view-switcher" aria-label="Screens">
          ${desktopPills}
        </nav>

        <div class="nav-actions">
          <div class="nav-streak">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="${FLAME_ICON_PATH}" />
            </svg>
            <span class="streak-days-val">5 days</span>
          </div>
          <button type="button" class="nav-user-btn" id="btn-open-account">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>Account</span>
          </button>
        </div>
      </div>`;
};

const renderMobileNav = function (currentPage) {
  return NAV_ITEMS.map((item) => {
    const activeClass = item.href === currentPage ? " active" : "";
    return `
      <a href="${item.href}" class="mobile-nav-item${activeClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${item.mobileIcon}
        </svg>
        <span>${item.mobileLabel}</span>
      </a>`;
  }).join("\n");
};

const renderAccountModal = function () {
  return `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title-group">
            <h3 class="modal-title">Create Account</h3>
            <p class="modal-subtitle">
              Create an account to start and save workouts
            </p>
          </div>
          <button type="button" class="modal-close-btn" aria-label="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <form id="form-create-account">
          <div class="modal-body">
            <div class="feature-box">
              <div class="feature-box-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect
                    x="3"
                    y="11"
                    width="18"
                    height="11"
                    rx="2"
                    ry="2"
                  ></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <div class="feature-box-text">
                <strong>Offline-First & Local:</strong> Your workouts and streak
                are stored privately on this device via browser LocalStorage.
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="input-username">Athlete Name / Handle</label>
              <input
                type="text"
                id="input-username"
                class="form-input"
                placeholder="e.g. Alex Runner"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-email">Email Address</label>
              <input
                type="email"
                id="input-email"
                class="form-input"
                placeholder="alex@stride.app"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-password">Password</label>
              <input
                type="password"
                id="input-password"
                class="form-input"
                placeholder="••••••••••••"
                minlength="8"
                required
              />
            </div>
          </div>

          <div class="modal-footer">
            <button type="submit" class="btn btn-primary btn-block">
              <span>Save Athlete Profile</span>
            </button>
            <button type="button" class="btn btn-outline btn-block">
              <span>Cancel</span>
            </button>
          </div>
        </form>
      </div>`;
};

export const initAppShell = function () {
  const currentPage = getCurrentPage();

  const headerEl = document.querySelector("header.navbar");
  if (headerEl) {
    headerEl.innerHTML = renderNavbar(currentPage);
  }

  const mobileNavEl = document.querySelector("nav.mobile-bottom-nav");
  if (mobileNavEl) {
    mobileNavEl.innerHTML = renderMobileNav(currentPage);
  }

  let accountModalEl = document.getElementById("modal-account");
  if (!accountModalEl) {
    accountModalEl = document.createElement("div");
    accountModalEl.className = "modal-overlay";
    accountModalEl.id = "modal-account";
    accountModalEl.setAttribute("role", "dialog");
    accountModalEl.setAttribute("aria-modal", "true");
    document.body.appendChild(accountModalEl);
  }
  accountModalEl.innerHTML = renderAccountModal();
};
