/**
 * Stride Workout Tracker — Modal Controller
 * Manages modal dialogues, backdrop clicks, Escape key, and account creation.
 */

import { STORAGE_KEYS, getStorageItem, setStorageItem } from "../core/storage.js";

export const initAccountModal = function () {
  const modal = document.getElementById("modal-account");
  const openBtn = document.getElementById("btn-open-account");
  if (!modal) return;

  const usernameInput = document.getElementById("input-username");
  const emailInput = document.getElementById("input-email");

  const syncAccountNavButton = function () {
    const savedUser = getStorageItem(STORAGE_KEYS.USER);
    if (!savedUser || !openBtn) return;
    const labelSpan = openBtn.querySelector("span");
    if (labelSpan && savedUser.username) {
      labelSpan.textContent = savedUser.username;
    }
  };

  syncAccountNavButton();

  const closeModal = function () {
    modal.classList.remove("active");
  };

  const openModal = function () {
    const savedUser = getStorageItem(STORAGE_KEYS.USER);
    if (savedUser) {
      if (usernameInput && savedUser.username) {
        usernameInput.value = savedUser.username;
      }
      if (emailInput && savedUser.email) {
        emailInput.value = savedUser.email;
      }
    }
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

  // Close any active modal on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.active").forEach((activeModal) => {
      activeModal.classList.remove("active");
    });
  });

  // Account creation handling
  const form = document.getElementById("form-create-account");
  const submitBtn = modal.querySelector(".modal-footer .btn-primary");

  const handleAccountCreate = function () {
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";

    const userProfile = {
      username: username || "Athlete",
      email: email || "athlete@stride.app",
      createdAt: Date.now(),
    };

    setStorageItem(STORAGE_KEYS.USER, userProfile);
    syncAccountNavButton();
    closeModal();
    document.dispatchEvent(
      new CustomEvent("stride:account-created", { detail: userProfile })
    );
  };

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      handleAccountCreate();
    });
  }
  if (submitBtn && submitBtn.type !== "submit") {
    submitBtn.addEventListener("click", handleAccountCreate);
  }
};
