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

// Workout Setup Elements
const workoutForm = document.querySelector(".workout-form");
const targetInput = document.getElementById("target-input");
const targetUnitLabel = document.getElementById("target-unit-label");

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

const switchSegmentedBtn = function (clickedBtn) {
  if (clickedBtn.classList.contains("active")) return;

  const parentControl = clickedBtn.closest(".segmented-control");
  if (!parentControl) return;

  parentControl.querySelectorAll(".segmented-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  clickedBtn.classList.add("active");

  updateGoalType(clickedBtn);
};

const updateGoalType = function (clickedBtn) {
  if (clickedBtn.dataset.group !== "goal") return;
  if (!targetUnitLabel || !targetInput) return;

  if (clickedBtn.dataset.value === "distance") {
    targetUnitLabel.textContent = "km";
    targetInput.value = "5.0";
    targetInput.step = "0.5";
    targetInput.min = "0.5";
  } else if (clickedBtn.dataset.value === "time") {
    targetUnitLabel.textContent = "min";
    targetInput.value = "30";
    targetInput.step = "1";
    targetInput.min = "1";
  }
};

// Event Listeners
if (navContainer) {
  navContainer.addEventListener("click", function (e) {
    const clickedBtn = e.target.closest(".view-btn");
    if (!clickedBtn) return;

    removeActive();
    clickedBtn.classList.add("active");

    navigateTo(clickedBtn);
  });
}

if (workoutForm) {
  workoutForm.addEventListener("click", function (e) {
    const clickedBtn = e.target.closest(".segmented-btn");
    if (!clickedBtn) return;

    switchSegmentedBtn(clickedBtn);
  });
}

