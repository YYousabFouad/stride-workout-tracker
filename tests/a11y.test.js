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

test("screen CSP policies do not upgrade local HTTP assets", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    const policy =
      html.match(
        /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
      )?.[1] || "";

    assert.ok(policy, `CSP policy should exist on ${page}`);
    assert.doesNotMatch(policy, /upgrade-insecure-requests/, page);
  }
});

test("plan segments expose radiogroup semantics with a roving tab stop", async () => {
  const html = await read("index.html");
  const buttons = (html.match(/<button[\s\S]*?<\/button>/g) || []).filter(
    (button) => button.includes("data-group="),
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

test("visualizer switches update the hidden state of both panels", async () => {
  const html = await read("progress.html");
  const source = await readFile(
    new URL("../js/screens/progress.js", import.meta.url),
    "utf8",
  );

  assert.match(html, /id="btn-mode-3d"[^>]*role="tab"[^>]*tabindex="0"/s);
  assert.match(html, /id="btn-mode-map"[^>]*role="tab"[^>]*tabindex="-1"/s);
  assert.match(html, /aria-controls="runner-3d-viewport"/);
  assert.match(html, /aria-controls="map-viewport"/);
  assert.match(html, /id="runner-3d-viewport"[^>]*role="tabpanel"/s);
  assert.match(html, /id="map-viewport"[^>]*role="tabpanel"/s);
  assert.match(source, /btnMode3d\.tabIndex = 0/);
  assert.match(source, /btnMode3d\.tabIndex = -1/);
  assert.match(source, /btnModeMap\.tabIndex = 0/);
  assert.match(source, /btnModeMap\.tabIndex = -1/);
  assert.match(source, /runnerViewport\.hidden = false/);
  assert.match(source, /runnerViewport\.hidden = true/);
  assert.match(source, /mapViewport\.hidden = false/);
  assert.match(source, /mapViewport\.hidden = true/);
  assert.match(source, /mapViewport && !mapViewport\.hidden/);
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

test("storage failures have an accessible announcement on plan and completion", async () => {
  for (const [page, id] of [
    ["index.html", "storage-error"],
    ["progress.html", "completion-storage-error"],
    ["complete.html", "save-workout-error"],
  ]) {
    const html = await read(page);
    const errorRegion = html.match(
      new RegExp(`<p[^>]*id="${id}"[^>]*>`, "s"),
    )?.[0];

    assert.ok(errorRegion, `${id} should exist on ${page}`);
    assert.match(errorRegion, /role="alert"/);
    assert.match(errorRegion, /u-hidden/);
  }
});

test("generated map navigation controls start hidden with one class attribute", async () => {
  const sources = [
    {
      path: "../js/visualizers/map.js",
      id: "btn-navigate-arrow",
    },
    {
      path: "../js/screens/complete.js",
      id: "btn-complete-navigate",
    },
  ];

  for (const { path, id } of sources) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const idIndex = source.indexOf(`id="${id}"`);
    assert.notEqual(idIndex, -1, `${id} should exist`);
    const buttonStart = source.lastIndexOf("<button", idIndex);
    const buttonEnd = source.indexOf(">", idIndex);
    const openingTag = source.slice(buttonStart, buttonEnd + 1);

    assert.equal((openingTag.match(/\bclass=/g) || []).length, 1, id);
    assert.match(openingTag, /class="[^"]*\bu-hidden\b/, id);
  }
});

test("base styles honour reduced motion and keep a visible keyboard focus ring", async () => {
  const css = await read("css/base.css");

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link/);
});
