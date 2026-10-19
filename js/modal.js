/**
 * Stride Workout Tracker — Modal Controller
 * Manages modal dialogues, backdrop clicks, Escape key, and account creation.
 */

import { STORAGE_KEYS, setStorageItem } from "./storage.js";

export const initAccountModal = function () {
  const modal = document.getElementById("modal-account");
  const openBtn = document.getElementById("btn-open-account");
  if (!modal) return;

  const closeModal = function () {
    modal.classList.remove("active");
  };

  const openModal = function () {
    modal.classList.add("active");
  };

  if (openBtn) {
    openBtn.addEventListener("click", openModal);
  }

  // Close triggers: close button and Cancel button
  modal.querySelectorAll(".modal-close-btn, .btn-outline").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });

  // Close on backdrop click
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });

  // Close on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // Account creation handling
  const form = document.getElementById("form-create-account");
  const submitBtn = modal.querySelector(".modal-footer .btn-primary");

  const handleAccountCreate = function () {
    const usernameInput = document.getElementById("input-username");
    const emailInput = document.getElementById("input-email");
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";

    const userProfile = {
      username: username || "Athlete",
      email: email || "athlete@stride.app",
      createdAt: Date.now(),
    };

    setStorageItem(STORAGE_KEYS.USER, userProfile);
    closeModal();
  };

  if (submitBtn) {
    submitBtn.addEventListener("click", handleAccountCreate);
  }
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      handleAccountCreate();
    });
  }
};
