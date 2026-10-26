"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const APP_ROUTES = new Set(["/", "/feed", "/admin", "/report"]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function hasRestrictedSegment(segments) {
  return segments.some((segment) => segment.startsWith(".") || segment.toLowerCase() === "node_modules");
}

/** A small local development server. It deliberately binds to localhost in the CLI. */
function createServer({ root = __dirname } = {}) {
  const absoluteRoot = path.resolve(root);
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Cache-Control", "no-store");

    function send(status, body) {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : body);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return send(405, "Method not allowed");
    }

    let pathname;
    try {
      // Keep the raw path until validation: URL parsing would normalize away ../.
      pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    } catch {
      return send(400, "Invalid URL");
    }
    if (!pathname.startsWith("/") || /[\x00-\x1f\\]/.test(pathname)) {
      return send(400, "Invalid path");
    }
    const segments = pathname.split("/");
    if (hasRestrictedSegment(segments)) {
      return send(403, "Forbidden");
    }

    const route = pathname.replace(/\/+$/, "") || "/";
    if (APP_ROUTES.has(route) && pathname !== route) {
      // Canonical paths keep ./styles.css and script URLs relative to the root.
      const queryIndex = (request.url || "").indexOf("?");
      const query = queryIndex === -1 ? "" : request.url.slice(queryIndex);
      response.writeHead(308, { Location: route + query });
      return response.end();
    }
    const relativeFile = APP_ROUTES.has(route) ? "index.html" : pathname.slice(1);
    const requestedFile = path.resolve(absoluteRoot, relativeFile);
    if (!isInside(absoluteRoot, requestedFile)) return send(403, "Forbidden");

    try {
      const [realRoot, realFile] = await Promise.all([fs.realpath(absoluteRoot), fs.realpath(requestedFile)]);
      if (!isInside(realRoot, realFile)) return send(403, "Forbidden");
      if (hasRestrictedSegment(path.relative(realRoot, realFile).split(path.sep))) return send(403, "Forbidden");
      const stat = await fs.stat(realFile);
      if (!stat.isFile()) return send(404, "Not found");
      const body = await fs.readFile(realFile);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(realFile).toLowerCase()] || "application/octet-stream",
        "Content-Length": body.length,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") return send(404, "Not found");
      console.error("Could not serve a local file:", error.message);
      return send(500, "Could not read file");
    }
  });
}

function parsePort(args) {
  if (args.length === 0) return 4173;
  if (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1])) {
    throw new Error("Usage: node server.cjs [--port 4173]");
  }
  const port = Number(args[1]);
  if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
  return port;
}

if (require.main === module) {
  try {
    const port = parsePort(process.argv.slice(2));
    const server = createServer();
    server.on("error", (error) => {
      console.error(error.code === "EADDRINUSE" ? `Port ${port} is busy. Try: npm start -- --port ${port + 1}` : error.message);
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () => {
      console.log(`CampusFix is running at http://127.0.0.1:${port}`);
      console.log("Press Ctrl+C to stop.");
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createServer, parsePort };
