/**
 * Stride Workout Tracker — Navigation Controller
 * Handles screen switching across anchor links and buttons reliably.
 */

const ALLOWED_PAGES = new Set([
  "index.html",
  "progress.html",
  "complete.html",
  "history.html",
]);

let isNavInitialized = false;

export const initNavigation = function () {
  if (isNavInitialized) return;
  isNavInitialized = true;
  const routesByTitle = {
    "1. Plan Workout": "index.html",
    "2. In Progress": "progress.html",
    "3. Complete": "complete.html",
    "4. History": "history.html",
  };

  const routeList = [
    "index.html",
    "progress.html",
    "complete.html",
    "history.html",
  ];

  document.addEventListener("click", function (e) {
    const navBtn = e.target.closest(".view-btn, .mobile-nav-item");
    if (!navBtn) return;

    const href = navBtn.getAttribute("href");
    const btnText = navBtn.textContent.trim();
    const allBtns = Array.from(
      document.querySelectorAll(".view-switcher .view-btn"),
    );
    const btnIndex = allBtns.indexOf(navBtn);
    const targetPage = href || routesByTitle[btnText] || routeList[btnIndex];

    if (!targetPage) return;

    let cleanTarget = targetPage;
    if (cleanTarget.includes("/")) {
      cleanTarget = cleanTarget.split("/").pop();
    }
    if (cleanTarget.includes("?")) {
      cleanTarget = cleanTarget.split("?")[0];
    }
    if (cleanTarget.includes("#")) {
      cleanTarget = cleanTarget.split("#")[0];
    }

    if (!ALLOWED_PAGES.has(cleanTarget)) {
      e.preventDefault();
      return;
    }

    const currentPath =
      window.location.pathname.split("/").pop() || "index.html";
    if (currentPath === cleanTarget) {
      e.preventDefault();
      return;
    }

    if (!href) {
      window.location.href = cleanTarget;
    }
  });
};
