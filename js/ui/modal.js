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
import { createDialog } from "./dialog.js";

let isAccountModalInitialized = false;

export const initAccountModal = function () {
  const modal = document.getElementById("modal-account");
  const openBtn = document.getElementById("btn-open-account");
  if (!modal) return;

  const usernameInput = /** @type {HTMLInputElement|null} */ (
    document.getElementById("input-username")
  );
  const emailInput = /** @type {HTMLInputElement|null} */ (
    document.getElementById("input-email")
  );
  const storageError = modal.querySelector("#account-storage-error");
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

  if (isAccountModalInitialized) return;
  isAccountModalInitialized = true;

  modal.setAttribute("aria-labelledby", "account-modal-title");
  modal.setAttribute("aria-describedby", "account-modal-subtitle");

  const dialog = createDialog(modal, {
    initialFocus: () => usernameInput,
    onEscape: () => {
      document.dispatchEvent(new CustomEvent("stride:account-cancelled"));
    },
  });
  if (!dialog) return;

  const closeModal = function (accountCreated = false) {
    dialog.close();
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
    dialog.open();
  };

  if (openBtn) {
    openBtn.addEventListener("click", openModal);
  }

  // Screens ask for the account dialog through an event so every opening path
  // goes through the same focus management.
  document.addEventListener("stride:open-account", openModal);

  // Close triggers: close button and Cancel button
  modal.querySelectorAll("button").forEach((btn) => {
    if (!btn.matches(".modal-close-btn, .btn-outline")) return;
    btn.addEventListener("click", () => closeModal(false));
  });

  // Close on backdrop click
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal(false);
  });

  // Account creation handling
  const form = document.getElementById("form-create-account");
  const submitBtn = /** @type {HTMLButtonElement|null} */ (
    modal.querySelector(".modal-footer .btn-primary")
  );

  const handleAccountCreate = function () {
    const rawUsername = usernameInput ? usernameInput.value : "";
    const username = sanitizeString(rawUsername, 50) || "Athlete";

    const rawEmail = emailInput ? emailInput.value.trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail) || rawEmail.length > 100) {
      if (emailInput) emailInput.focus();
      return;
    }
    const email = rawEmail;
    const existingUser = getStorageItem(STORAGE_KEYS.USER);

    const userProfile = {
      username,
      email,
      createdAt: existingUser?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (!setStorageItem(STORAGE_KEYS.USER, userProfile)) {
      if (storageError) {
        storageError.textContent =
          "Browser storage couldn't save your profile. Enable site storage and try again.";
        storageError.classList.remove("u-hidden");
      }
      return;
    }
    if (storageError) storageError.classList.add("u-hidden");
    syncAccountNavButton();
    closeModal(true);
    document.dispatchEvent(
      new CustomEvent("stride:account-created", { detail: userProfile }),
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
