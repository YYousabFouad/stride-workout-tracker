"use strict";

// Buttons and Links
const navContainer = document.querySelector(".view-switcher");
const navLinks = document.querySelectorAll(".view-btn");

// Navigation routes
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

// Functions
const removeActive = function () {
  navLinks.forEach((el) => {
    el.classList.remove("active");
  });
};

const navigateTo = function (clickedBtn) {
  const btnText = clickedBtn.textContent.trim();
  const btnIndex = Array.from(navLinks).indexOf(clickedBtn);
  const targetPage = routesByTitle[btnText] || routeList[btnIndex];

  if (!targetPage) return;

  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  if (currentPath !== targetPage) {
    window.location.href = targetPage;
  }
};

// Event Listener
if (navContainer) {
  navContainer.addEventListener("click", function (e) {
    const clickedBtn = e.target.closest(".view-btn");
    if (!clickedBtn) return;

    removeActive();
    clickedBtn.classList.add("active");

    navigateTo(clickedBtn);
  });
}


