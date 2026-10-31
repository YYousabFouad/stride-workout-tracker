import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Start `scripts/dev-server.js` on an OS-assigned ephemeral port and wait for
 * its ready line, so every request below hits real disk/network behavior.
 * @returns {Promise<{ child: import("node:child_process").ChildProcess, baseUrl: string }>}
 */
const startServer = async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const child = spawn(process.execPath, ["scripts/dev-server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`dev server did not report ready; stderr: ${stderr}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/Stride dev server: http:\/\/[^:]+:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `dev server exited early with code ${code}; stderr: ${stderr}`,
        ),
      );
    });
  });

  return { child, baseUrl: `http://127.0.0.1:${port}` };
};

/** Stop the child and wait for its listening socket to be released. */
const stopServer = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
};

test("serves the root document and key static assets", async () => {
  const { child, baseUrl } = await startServer();
  try {
    const cases = [
      { path: "/", expectedStatus: 200 },
      { path: "/index.html", expectedStatus: 200 },
      { path: "/css/styles.css", expectedStatus: 200 },
      { path: "/js/main.js", expectedStatus: 200 },
      { path: "/js/core/storage.js", expectedStatus: 200 },
      // Hidden directories and dependency folders stay denied. Note: `..`
      // escapes cannot be tested through `fetch` because the client itself
      // normalizes them away before the request is sent.
      { path: "/.git/config", expectedStatus: 404 },
      { path: "/node_modules/eslint/package.json", expectedStatus: 404 },
      { path: "/missing-file.html", expectedStatus: 404 },
    ];
    for (const { path, expectedStatus } of cases) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(
        response.status,
        expectedStatus,
        `GET ${path} expected ${expectedStatus}`,
      );
      if (path === "/") {
        assert.match(
          response.headers.get("content-security-policy") || "",
          /frame-ancestors 'none'/,
        );
        assert.doesNotMatch(
          response.headers.get("content-security-policy") || "",
          /upgrade-insecure-requests/,
        );
        assert.equal(response.headers.get("x-frame-options"), "DENY");
      }
      await response.arrayBuffer();
    }
  } finally {
    await stopServer(child);
  }
});

test("rejects non-GET/HEAD requests", async () => {
  const { child, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/`, { method: "POST" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    await response.arrayBuffer();
  } finally {
    await stopServer(child);
  }
});

test("does not serve a directory index symlink that escapes the repository", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let serverFixtureRoot;
  let externalFixtureRoot;
  let child;
  try {
    serverFixtureRoot = await mkdtemp(join(root, "server-fixture-"));
    externalFixtureRoot = await mkdtemp(join(tmpdir(), "server-outside-"));
    const indexDirectory = join(serverFixtureRoot, "nested");
    const externalIndex = join(externalFixtureRoot, "index.html");

    await mkdir(indexDirectory);
    await writeFile(externalIndex, "outside repository");
    await symlink(externalIndex, join(indexDirectory, "index.html"));

    const relativeFixturePath = relative(resolve(root), indexDirectory)
      .split("\\")
      .join("/");
    const server = await startServer();
    child = server.child;
    const { baseUrl } = server;
    const response = await fetch(`${baseUrl}/${relativeFixturePath}/`);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  } finally {
    try {
      if (child) await stopServer(child);
    } finally {
      await Promise.all([
        ...(serverFixtureRoot
          ? [rm(serverFixtureRoot, { recursive: true, force: true })]
          : []),
        ...(externalFixtureRoot
          ? [rm(externalFixtureRoot, { recursive: true, force: true })]
          : []),
      ]);
    }
  }
});
