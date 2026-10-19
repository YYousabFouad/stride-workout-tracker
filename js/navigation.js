/**
 * Stride Workout Tracker — Navigation Controller
 * Handles screen switching across anchor links and buttons reliably.
 */

export const initNavigation = function () {
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

    // Check href attribute first if it's an anchor tag
    const href = navBtn.getAttribute("href");
    const btnText = navBtn.textContent.trim();
    const allBtns = Array.from(document.querySelectorAll(".view-switcher .view-btn"));
    const btnIndex = allBtns.indexOf(navBtn);
    const targetPage = href || routesByTitle[btnText] || routeList[btnIndex];

    if (!targetPage) return;

    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    if (currentPath !== targetPage) {
      window.location.href = targetPage;
    }
  });
};
