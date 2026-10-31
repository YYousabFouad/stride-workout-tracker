/**
 * Stride Workout Tracker — Local Development Server
 * Serves the repository over HTTP so native ES modules and fetch work.
 * No dependencies; `npm run dev` is enough.
 */

import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Strip trailing separators so containment checks (`relative`, `startsWith`)
// behave identically on POSIX and Windows path styles.
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(
  /[\\/]+$/,
  "",
);
const configuredPort = Number(process.env.PORT);
const PORT =
  process.env.PORT &&
  Number.isInteger(configuredPort) &&
  configuredPort >= 0 &&
  configuredPort <= 65535
    ? configuredPort
    : 4173;
const HOST = process.env.HOST || "127.0.0.1";

/**
 * Security headers applied to every served document. `frame-ancestors` only
 * works as an HTTP header (ignored in a <meta> tag), so the dev server also
 * emits it here.
 */
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://router.project-osrm.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Permissions-Policy":
    "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** Directory names never served, even when traversable through the repo. */
const BLOCKED_DIR_NAMES = new Set([
  ".git",
  ".github",
  ".vscode",
  "node_modules",
]);

/** @type {Record<string, string>} */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Map a request URL to a file inside the repository.
 * Rejects path escapes, dotfiles, hidden-dot directories (e.g. `.git`),
 * `node_modules`, and anything resolving through a symlink outside ROOT.
 * @param {string|undefined} requestUrl
 * @returns {Promise<string|null>} null for missing files and path escapes
 */
const resolveFilePath = async function (requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent((requestUrl || "/").split("?")[0]);
  } catch {
    return null;
  }

  const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
  const segments = relativePath ? relativePath.split(/[/\\]/) : ["index.html"];
  if (
    segments.some(
      (segment) => segment.startsWith(".") || BLOCKED_DIR_NAMES.has(segment),
    )
  ) {
    return null;
  }

  let filePath = join(ROOT, ...segments);
  if (isAbsolute(filePath) && relative(ROOT, filePath).startsWith("..")) {
    return null;
  }

  // Resolve symlinks so a link cannot serve files from outside ROOT.
  try {
    filePath = await realpath(filePath);
  } catch {
    return null;
  }
  if (
    filePath !== ROOT &&
    !filePath.startsWith(ROOT + sep) &&
    !filePath.startsWith(ROOT + "/")
  ) {
    return null;
  }

  const fileName = filePath.split(/[/\\]/).pop() || "";
  if (fileName.startsWith(".")) return null;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
      // The directory itself may be in ROOT while its index.html is a
      // symlink outside it. Resolve the final file too before serving it.
      filePath = await realpath(filePath);
      if (
        filePath !== ROOT &&
        !filePath.startsWith(ROOT + sep) &&
        !filePath.startsWith(ROOT + "/")
      ) {
        return null;
      }
      const indexFileName = filePath.split(/[/\\]/).pop() || "";
      if (indexFileName.startsWith(".")) return null;
    }
    const finalInfo = await stat(filePath);
    return finalInfo.isFile() ? filePath : null;
  } catch {
    return null;
  }
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const filePath = await resolveFilePath(request.url);
  if (!filePath) {
    response
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Not found");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Security-Policy": SECURITY_HEADERS["Content-Security-Policy"],
      "Permissions-Policy": SECURITY_HEADERS["Permissions-Policy"],
      "Referrer-Policy": SECURITY_HEADERS["Referrer-Policy"],
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (err) {
    console.error(`Failed to read requested file ${filePath}:`, err);
    response
      .writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`Stride dev server: http://${HOST}:${port}`);
});
