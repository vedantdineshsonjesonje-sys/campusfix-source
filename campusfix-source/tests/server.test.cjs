"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createServer, parsePort } = require("../server.cjs");

test("local server serves pages and assets without exposing restricted paths", async (t) => {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryDirectory, "campusfix-server-test-"));
  await Promise.all([
    fs.writeFile(path.join(root, "index.html"), "<!doctype html><title>CampusFix</title>"),
    fs.writeFile(path.join(root, "styles.css"), "body{color:black}"),
    fs.writeFile(path.join(root, "app.js"), "console.log('CampusFix')"),
    fs.writeFile(path.join(root, ".env"), "PRIVATE=never-serve"),
    fs.mkdir(path.join(root, "node_modules")),
  ]);
  await fs.writeFile(path.join(root, "node_modules", "secret.js"), "private");
  const server = createServer({ root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Only remove the temporary fixture directory this test created.
    const resolvedRoot = await fs.realpath(root);
    assert.equal(path.dirname(resolvedRoot).toLowerCase(), temporaryDirectory.toLowerCase());
    assert.ok(path.basename(resolvedRoot).startsWith("campusfix-server-test-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const port = server.address().port;

  function request(requestPath, method = "GET") {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, method }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  for (const route of ["/", "/feed", "/report", "/admin", "/report?from=feed"]) {
    const result = await request(route);
    assert.equal(result.status, 200, route);
    assert.match(result.headers["content-type"], /^text\/html/);
    assert.match(result.body, /CampusFix/);
  }
  for (const [route, canonical] of [["/admin/", "/admin"], ["/feed/", "/feed"], ["/report///?from=feed", "/report?from=feed"]]) {
    const result = await request(route);
    assert.equal(result.status, 308);
    assert.equal(result.headers.location, canonical);
    const landing = await request(result.headers.location);
    assert.equal(landing.status, 200);
    // Relative source URLs must still resolve to root assets after the redirect.
    const cssUrl = new URL("./styles.css", "http://localhost" + result.headers.location);
    assert.equal(cssUrl.pathname, "/styles.css");
    assert.equal((await request(cssUrl.pathname)).status, 200);
  }
  for (const [file, mime] of [["styles.css", "text/css"], ["app.js", "text/javascript"]]) {
    const result = await request("/" + file);
    assert.equal(result.status, 200);
    assert.ok(result.headers["content-type"].startsWith(mime));
    assert.equal(result.headers["x-content-type-options"], "nosniff");
  }
  const head = await request("/", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.ok(Number(head.headers["content-length"]) > 0);
  assert.equal((await request("/unknown.js")).status, 404);
  assert.equal((await request("/unknown-page")).status, 404);
  assert.equal((await request("/", "POST")).status, 405);
  for (const blocked of ["/.env", "/%2eenv", "/.git/config", "/node_modules/secret.js", "/%2e%2e/secret", "/safe/%2e%2e/.env"]) {
    const result = await request(blocked);
    assert.equal(result.status, 403, blocked);
    assert.doesNotMatch(result.body, /never-serve/);
  }
  assert.equal((await request("/%00")).status, 400);
  assert.equal((await request("/%E0%A4%A")).status, 400);
});

test("CLI port parsing accepts a valid custom port and rejects invalid input", () => {
  assert.equal(parsePort([]), 4173);
  assert.equal(parsePort(["--port", "4200"]), 4200);
  for (const args of [["--port", "0"], ["--port", "65536"], ["--port", "abc"], ["--other", "4200"], ["--port"]]) {
    assert.throws(() => parsePort(args));
  }
});
