import assert from "node:assert/strict";
import test from "node:test";
import { iconLinks, siteIcon } from "../dist/site-icon.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');

function site(routes, redirects = {}) {
  const seen = [];
  const fetch = async (url) => {
    seen.push(String(url));
    const final = redirects[String(url)] ?? String(url);
    const body = routes[final];
    if (body === undefined) return new Response("not found", { status: 404 });
    const response = new Response(body);
    Object.defineProperty(response, "url", { value: final });
    return response;
  };
  return { fetch, seen };
}

test("icon links rank SVG first, then the largest, and skip mask icons", () => {
  const html = `<link rel="icon" sizes="16x16" href="/16.png"><link rel='mask-icon' href='/mask.svg'>
<link href="/i.svg" rel="icon"><link rel="apple-touch-icon" href="https://cdn.example/touch.png"><link rel="icon" sizes="64x64" href="/64.png?a=1&amp;b=2">`;
  assert.deepEqual(iconLinks(html, "https://site.example/login"), [
    "https://site.example/i.svg",
    "https://cdn.example/touch.png",
    "https://site.example/64.png?a=1&b=2",
    "https://site.example/16.png",
  ]);
  assert.deepEqual(iconLinks('<link rel="stylesheet" href="/a.css"><link rel="icon" href="javascript:x">', "https://a.example/"), []);
});

test("site icons come back as data URIs typed from their bytes", async () => {
  const { fetch } = site({
    "https://one.example/": '<link rel="icon" href="/logo.svg">',
    "https://one.example/logo.svg": SVG,
  });
  assert.equal(await siteIcon("https://one.example/login?x=1", { fetch }), `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`);
});

test("a site that serves HTML as its icon falls back to /favicon.ico", async () => {
  const { fetch, seen } = site({
    "https://two.example/": '<link rel="icon" href="/missing.png"><link rel="apple-touch-icon" href="/html.png">',
    "https://two.example/html.png": "<!doctype html><p>login</p>",
    "https://two.example/favicon.ico": PNG,
  });
  assert.equal(await siteIcon("https://two.example", { fetch }), `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  assert.deepEqual(seen.slice(1), ["https://two.example/html.png", "https://two.example/missing.png", "https://two.example/favicon.ico"]);
});

test("a home page that redirects to another host only lends its /favicon.ico", async () => {
  const { fetch, seen } = site(
    { "https://sso.example/login": '<link rel="icon" href="/sso.png">', "https://sso.example/sso.png": PNG, "https://lms.example/favicon.ico": PNG },
    { "https://lms.example/": "https://sso.example/login" },
  );
  assert.match(await siteIcon("https://lms.example", { fetch }), /^data:image\/png;base64,/u);
  assert.deepEqual(seen, ["https://lms.example/", "https://lms.example/favicon.ico"]);
});

test("a site without an icon gives undefined and is not fetched again right away", async () => {
  const { fetch, seen } = site({ "https://three.example/": "<p>no icons</p>" });
  assert.equal(await siteIcon("https://three.example", { fetch }), undefined);
  assert.equal(await siteIcon("https://three.example/", { fetch }), undefined);
  assert.equal(seen.length, 2);
});

test("an oversized icon is refused", async () => {
  const big = new Uint8Array(200 * 1024);
  big.set(PNG);
  const { fetch } = site({ "https://four.example/": "", "https://four.example/favicon.ico": big });
  assert.equal(await siteIcon("https://four.example", { fetch }), undefined);
});
