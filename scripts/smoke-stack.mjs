import assert from "node:assert/strict";

// Run against the production compose stack through Caddy (see .github/ci/compose.stack.yaml).
// Caddy's Via header once switched Nginx gzip off, so compression is checked behind the proxy, not on Nginx alone.
const site = process.env.SITE_URL || "https://localhost:8443";
const plainSite = process.env.SITE_HTTP_URL || "http://localhost:8088";
const shown = (response) => `${response.status} ${JSON.stringify(Object.fromEntries(response.headers), null, 1)}`;
const get = async (path) => {
  const response = await fetch(site + path, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(response.status, 200, `GET ${path}: ${shown(response)}`);
  return response;
};

const entry = await get("/");
assert.match(entry.headers.get("strict-transport-security") ?? "", /max-age=/, `Caddy HSTS missing: ${shown(entry)}`);
assert.ok(entry.headers.get("content-security-policy"), `Nginx security headers missing: ${shown(entry)}`);
const script = (await entry.text()).match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
assert.ok(script, "index.html must load a hashed /assets/*.js entry");
for (const path of ["/", "/index.html", "/spa/route/fallback"]) {
  const page = path === "/" ? entry : await get(path);
  assert.equal(page.headers.get("cache-control"), "no-cache", `${path} must revalidate index.html: ${shown(page)}`);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/, `${path}: ${shown(page)}`);
}
for (const path of [script, "/data/map/boundaries.json"]) {
  const response = await get(path);
  assert.equal(response.headers.get("content-encoding"), "gzip", `${path} must be gzipped behind Caddy: ${shown(response)}`);
  assert.match(response.headers.get("vary") ?? "", /accept-encoding/i, `${path}: ${shown(response)}`);
  if (path === script) assert.match(response.headers.get("cache-control") ?? "", /immutable/, `${path}: ${shown(response)}`);
  await response.arrayBuffer();
}
const redirect = await fetch(plainSite + "/", { redirect: "manual" });
assert.equal(redirect.status, 308, `HTTP must redirect to HTTPS: ${shown(redirect)}`);
assert.match(redirect.headers.get("location") ?? "", /^https:\/\//, `HTTP redirect target: ${shown(redirect)}`);
console.log(`PASS: gzip behind Caddy (${script}, map boundaries), index.html/SPA no-cache, hashed asset immutable, HSTS + CSP, HTTP→HTTPS 308`);
