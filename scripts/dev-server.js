/**
 * Stride Workout Tracker — Local Development Server
 * Serves the repository over HTTP so native ES modules and fetch work.
 * No dependencies; `npm run dev` is enough.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

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
  let filePath = join(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + "/")) return null;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
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
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response
      .writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Stride dev server: http://${HOST}:${PORT}`);
});
