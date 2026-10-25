import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const PAGES = ["index.html", "progress.html", "complete.html", "history.html"];

const read = function (path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
};

test("every screen opens with a skip link and a focusable main landmark", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    const mainTag = html.match(/<main[^>]*>/)?.[0] || "";

    assert.match(html, /<a class="skip-link" href="#main-content"/, page);
    assert.match(mainTag, /id="main-content"/, page);
    assert.match(mainTag, /tabindex="-1"/, page);
  }
});

test("plan segments expose radiogroup semantics with a roving tab stop", async () => {
  const html = await read("index.html");
  const buttons = (html.match(/<button[\s\S]*?<\/button>/g) || []).filter(
    (button) => button.includes("data-group=")
  );

  assert.equal((html.match(/role="radiogroup"/g) || []).length, 2);
  assert.equal(buttons.length, 4);

  for (const button of buttons) {
    assert.match(button, /role="radio"/);
    assert.match(button, /aria-checked="(true|false)"/);
    assert.match(button, /tabindex="(0|-1)"/);
  }

  assert.equal((html.match(/aria-checked="true"/g) || []).length, 2);
  assert.equal((html.match(/aria-checked="false"/g) || []).length, 2);
});

test("the live progress bar reports its value to assistive tech", async () => {
  const html = await read("progress.html");
  const bar = html.match(/<div[^>]*role="progressbar"[^>]*>/)?.[0] || "";

  assert.match(bar, /aria-labelledby="live-progress-label"/);
  assert.match(bar, /aria-valuemin="0"/);
  assert.match(bar, /aria-valuemax="100"/);
  assert.match(bar, /aria-valuenow="0"/);
  assert.match(html, /id="live-progress-label"/);
});

test("the achievement dialog is labelled by its own heading", async () => {
  const html = await read("complete.html");
  const dialog = html.match(/<div[^>]*id="modal-alert"[^>]*>/)?.[0] || "";

  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-labelledby="alert-modal-title"/);
  assert.match(dialog, /aria-describedby="alert-modal-subtitle"/);
  assert.match(html, /id="alert-modal-title"/);
  assert.match(html, /id="alert-modal-subtitle"/);
});

test("base styles honour reduced motion and keep a visible keyboard focus ring", async () => {
  const css = await read("css/base.css");

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link/);
});
