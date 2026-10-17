"use strict";

// Buttons and Links
const navContainer = document.querySelector(".view-switcher");
const navLinks = document.querySelectorAll(".view-btn");

// Functions
const removeActive = function () {
  navLinks.forEach((el) => {
    el.classList.remove("active");
  });
};

// Event Listener
if (navContainer) {
  navContainer.addEventListener("click", function (e) {
    const clickedBtn = e.target.closest(".view-btn");
    if (!clickedBtn) return;

    removeActive();
    clickedBtn.classList.add("active");
  });
}

