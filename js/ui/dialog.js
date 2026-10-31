/**
 * Stride Workout Tracker — Shared Dialog Behavior
 * Focus management shared by the account and achievement dialogs: initial
 * focus, Tab containment, Escape handling, and focus restoration on close.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** @param {Element} element @returns {element is HTMLElement} */
const isVisible = function (element) {
  if (!(element instanceof HTMLElement)) return false;
  return element.getClientRects().length > 0;
};

/**
 * Wire dialog keyboard/focus semantics onto an existing overlay element.
 * The overlay must toggle the `active` class, as the stylesheet expects.
 * @param {HTMLElement|null} modal
 * @param {{ onEscape?: () => void, initialFocus?: () => HTMLElement|null }} [options]
 * @returns {{ open: () => void, close: () => void } | null} null when there is no modal
 */
export const createDialog = function (modal, options = {}) {
  if (!modal) return null;

  const { onEscape, initialFocus } = options;
  /** @type {HTMLElement|null} */
  let restoreTarget = null;

  const getFocusable = function () {
    return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      isVisible,
    );
  };

  const close = function () {
    // Move focus out before hiding: browsers reject `aria-hidden` on a subtree
    // that still contains the focused element.
    if (restoreTarget?.isConnected) {
      restoreTarget.focus();
    }
    if (
      document.activeElement instanceof HTMLElement &&
      modal.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    restoreTarget = null;
  };

  const open = function () {
    const target = initialFocus?.() || getFocusable()[0] || modal;

    // Re-opening an already visible dialog must not capture a focus target
    // from inside itself, or closing would restore focus into a hidden dialog.
    if (modal.classList.contains("active")) {
      target.focus();
      return;
    }

    const active = document.activeElement;
    restoreTarget = active instanceof HTMLElement ? active : null;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    if (target === modal && !modal.hasAttribute("tabindex")) {
      modal.setAttribute("tabindex", "-1");
    }
    target.focus();
  };

  // Dialogs stay in the DOM between openings; hide them from assistive tech
  // until they are actually shown.
  modal.setAttribute("aria-hidden", "true");

  // Escape lives on the document: clicking the backdrop can move focus out of
  // the dialog while it is still open.
  document.addEventListener("keydown", function (event) {
    if (!modal.classList.contains("active")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      onEscape?.();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const activeIndex =
      activeElement instanceof HTMLElement
        ? focusable.indexOf(activeElement)
        : -1;

    if (
      event.shiftKey &&
      (document.activeElement === first || activeIndex === -1)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || activeIndex === -1)
    ) {
      event.preventDefault();
      first.focus();
    }
  });

  return { open, close };
};
