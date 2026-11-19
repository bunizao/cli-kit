import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { CONSENT_HEADERS, consentPage, knownClient, messagePage, SCRIPT_HASH } from "../dist/consent.js";

const base = {
  app: "OnTrack",
  client: "Claude",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  access: ["Read your units and tasks"],
  action: "/authorize",
};

test("a public https redirect names the client by its host, not its declared name", () => {
  assert.equal(knownClient("Claude", "https://claude.ai/api/mcp/auth_callback")?.name, "Claude");
  assert.equal(knownClient("anything", "https://chatgpt.com/connector_platform_oauth_redirect")?.name, "ChatGPT");
  assert.equal(knownClient("Claude", "https://claude.ai.evil.example/callback"), undefined);
  assert.equal(knownClient("Claude", "https://evil.example/callback"), undefined);
  assert.equal(knownClient("Claude", "http://evil.example/callback"), undefined);
  assert.equal(knownClient("Claude", "not a url"), undefined);
});

test("a loopback or app-scheme redirect falls back to the declared name or scheme", () => {
  assert.equal(knownClient("Claude Code", "http://localhost:33418/callback")?.name, "Claude Code");
  assert.equal(knownClient("Claude Desktop", "http://127.0.0.1:5000/cb")?.name, "Claude");
  assert.equal(knownClient("MCP client", "cursor://anysphere.cursor-retrieval/oauth/callback")?.name, "Cursor");
  assert.equal(knownClient("Visual Studio Code", "http://127.0.0.1:33418/")?.name, "VS Code");
  assert.equal(knownClient("Some tool", "http://localhost:9/cb"), undefined);
});

test("the consent page escapes what the client declared and shows where tokens go", () => {
  const html = consentPage({ ...base, client: "<script>x</script>", redirectUri: "https://evil.example/cb" });
  assert.ok(!html.includes("<script>x"));
  assert.match(html, /Allow &#60;script&#62;x&#60;\/script&#62; to use your OnTrack\?/u);
  assert.match(html, /Access goes to <b>evil\.example<\/b>/u);
  assert.match(html, /<b>&#60;<\/b>/u);
});

test("a client that claims a known name but sends tokens elsewhere is called out", () => {
  assert.match(consentPage({ ...base, redirectUri: "https://evil.example/cb" }), /calls itself Claude, but its access does not go to Claude/u);
  assert.match(consentPage({ ...base, client: "Codex", redirectUri: "https://evil.example/cb" }), /calls itself Codex/u);
  assert.doesNotMatch(consentPage(base), /calls itself/u);
  assert.doesNotMatch(consentPage({ ...base, client: "Claude Code", redirectUri: "http://localhost:1/cb" }), /calls itself/u);
});

test("the consent page posts the decision, hidden fields and the owner secret", () => {
  const html = consentPage({
    ...base,
    fields: { handle: "h\"1" },
    secret: { name: "owner_token", label: "Owner token", hint: "ontrack mcp status prints it" },
    error: "That token is wrong.",
  });
  assert.match(html, /<input type="hidden" name="handle" value="h&#34;1">/u);
  assert.match(html, /<input type="password" autocomplete="current-password" name="owner_token" id="f-owner_token" required/u);
  assert.match(html, /<label for="f-owner_token">Owner token<\/label>/u);
  assert.match(html, /name="decision" value="deny"[^>]* formnovalidate/u);
  assert.match(html, /name="decision" value="approve"/u);
  assert.match(html, /role="alert">.*That token is wrong\./u);
  assert.match(html, /<svg aria-hidden="true"/u);
});

test("a pairing code field shows what is typed and suggests one-time codes", () => {
  const html = consentPage({ ...base, secret: { name: "pairing_code", label: "Pairing code", kind: "code" } });
  assert.match(html, /<input type="text" autocomplete="one-time-code"[^>]* name="pairing_code" id="f-pairing_code" required/u);
});

test("an app-scheme redirect names the app that receives the tokens", () => {
  assert.match(consentPage({ ...base, client: "Cursor", redirectUri: "cursor://anysphere.cursor-retrieval/cb" }), /Access goes to the <b>Cursor<\/b> app/u);
  assert.match(consentPage({ ...base, client: "Tool", redirectUri: "tool://cb" }), /the app that opens <b>tool:\/\/<\/b> links/u);
  assert.match(consentPage({ ...base, client: "Claude Code", redirectUri: "http://localhost:1/cb" }), /Access stays on <b>this computer<\/b>/u);
});

test("backticked commands become chips that copy, and limits get their own list", () => {
  const html = consentPage({
    ...base,
    access: ["Read `a \"b\"`"],
    limits: ["Submit work"],
    secret: { name: "pairing_code", label: "Pairing code", kind: "code", hint: "Run `ontrack mcp pair` on your computer." },
  });
  assert.match(html, /<button type="button" class="cmd" data-copy="ontrack mcp pair" title="Copy"><code>ontrack mcp pair<\/code>/u);
  assert.match(html, /data-copy="a &#34;b&#34;"/u);
  assert.match(html, /It can't<\/p><ul><li class="cannot">.*Submit work/u);
  assert.doesNotMatch(consentPage(base), /It can't/u);
  assert.doesNotMatch(consentPage({ ...base, client: "`x`" }), /class="cmd"/u);
});

test("the message page and headers stay self-contained", () => {
  assert.match(messagePage("Cannot connect", "Bad <request>"), /Bad &#60;request&#62;/u);
  assert.match(messagePage("x", "Run `ontrack mcp pair`."), /data-copy="ontrack mcp pair"/u);
  const links = [...messagePage("x", "y").matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(links, ["https://unicorn.tuuhub.com", "https://github.com/TuuHub/unicorn", "https://github.com/bunizao"]);
  assert.match(CONSENT_HEADERS["content-security-policy"], /default-src 'none'/u);
  assert.doesNotMatch(CONSENT_HEADERS["content-security-policy"], /form-action/u);
});

test("the CSP allows exactly the inline copy script", () => {
  const script = /<script>(.*)<\/script>/u.exec(messagePage("x", "y"))[1];
  assert.equal(SCRIPT_HASH, `sha256-${createHash("sha256").update(script).digest("base64")}`);
  assert.ok(CONSENT_HEADERS["content-security-policy"].includes(`script-src '${SCRIPT_HASH}'`));
});
