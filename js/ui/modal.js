/**
 * Stride Workout Tracker — Modal Controller
 * Manages modal dialogues and a local-only athlete profile.
 */

import {
  STORAGE_KEYS,
  getStorageItem,
  sanitizeString,
  setStorageItem,
} from "../core/storage.js";

export const initAccountModal = function () {
  const modal = document.getElementById("modal-account");
  const openBtn = document.getElementById("btn-open-account");
  if (!modal) return;

  const usernameInput = document.getElementById("input-username");
  const emailInput = document.getElementById("input-email");
  const titleEl = modal.querySelector(".modal-title");
  const subtitleEl = modal.querySelector(".modal-subtitle");

  const syncAccountNavButton = function () {
    const savedUser = getStorageItem(STORAGE_KEYS.USER);
    if (!savedUser || !openBtn) return;
    const labelSpan = openBtn.querySelector("span");
    if (labelSpan && savedUser.username) {
      labelSpan.textContent = savedUser.username;
    }
  };

  syncAccountNavButton();

  const closeModal = function (accountCreated = false) {
    modal.classList.remove("active");
    if (!accountCreated) {
      document.dispatchEvent(new CustomEvent("stride:account-cancelled"));
    }
  };

  const openModal = function () {
    const savedUser = getStorageItem(STORAGE_KEYS.USER);
    if (savedUser) {
      if (titleEl) titleEl.textContent = "Athlete Profile";
      if (subtitleEl) {
        subtitleEl.textContent = "Update your profile details";
      }
      if (usernameInput && savedUser.username) {
        usernameInput.value = savedUser.username;
      }
      if (emailInput && savedUser.email) {
        emailInput.value = savedUser.email;
      }
    } else {
      if (titleEl) titleEl.textContent = "Create Account";
      if (subtitleEl) {
        subtitleEl.textContent = "Create an account to start and save workouts";
      }
    }
    modal.classList.add("active");
  };

  if (openBtn) {
    openBtn.addEventListener("click", openModal);
  }

  // Close triggers: close button and Cancel button
  modal.querySelectorAll(".modal-close-btn, .btn-outline").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(false));
  });

  // Close on backdrop click
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal(false);
  });

  // Close any active modal on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.active").forEach((activeModal) => {
      activeModal.classList.remove("active");
      if (activeModal.id === "modal-account") {
        document.dispatchEvent(new CustomEvent("stride:account-cancelled"));
      }
    });
  });

  // Account creation handling
  const form = document.getElementById("form-create-account");
  const submitBtn = modal.querySelector(".modal-footer .btn-primary");

  const handleAccountCreate = async function () {
    const rawUsername = usernameInput ? usernameInput.value : "";
    const username = sanitizeString(rawUsername, 50) || "Athlete";

    const rawEmail = emailInput ? emailInput.value.trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail) || rawEmail.length > 100) {
      if (emailInput) emailInput.focus();
      return;
    }
    const email = rawEmail;
    const existingUser = getStorageItem(STORAGE_KEYS.USER) || {};

    const userProfile = {
      username,
      email,
      createdAt: existingUser.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    setStorageItem(STORAGE_KEYS.USER, userProfile);
    syncAccountNavButton();
    closeModal(true);
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
