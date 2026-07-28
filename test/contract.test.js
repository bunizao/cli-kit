import assert from "node:assert/strict";
import test from "node:test";

import {
  CliError,
  ERROR_CODES,
  EXIT_CODES,
  VERBS,
  exitCodeFor,
  normalizeError,
  render,
  reportError,
  resolveFormat,
} from "../dist/index.js";

test("exports the versioned CLI contract", () => {
  assert.deepEqual(VERBS, ["list", "show", "read", "get", "search", "send", "submit", "set", "mark-read"]);
  assert.deepEqual(ERROR_CODES, ["usage", "auth", "config", "not_found", "upstream", "network", "cancelled", "unexpected"]);
  assert.deepEqual(EXIT_CODES, { usage: 2, auth: 3, config: 1, not_found: 4, upstream: 5, network: 1, cancelled: 130, unexpected: 1 });
  assert.equal(exitCodeFor("auth"), 3);
});

test("resolveFormat applies explicit flags and TTY defaults", () => {
  assert.equal(resolveFormat({}, true), "table");
  assert.equal(resolveFormat({}, false), "json");
  assert.equal(resolveFormat({ yaml: true }, true), "yaml");
  assert.throws(() => resolveFormat({ json: true, table: true }, true), /mutually exclusive/);
});

test("render filters top-level fields", () => {
  assert.equal(render([{ id: 1, name: "Ada", secret: true }], { format: "json", fields: ["id", "name"] }), '[\n  {\n    "id": 1,\n    "name": "Ada"\n  }\n]\n');
});

test("reportError renders one structured envelope", () => {
  const result = reportError(new CliError("auth", "Session expired.", "Log in again."), "json");
  assert.equal(result.exitCode, 3);
  assert.deepEqual(JSON.parse(result.text), {
    ok: false,
    error: { code: "auth", message: "Session expired.", hint: "Log in again." },
    exit_code: 3,
  });
});

test("normalizeError maps commander failures to usage", () => {
  const error = Object.assign(new Error("error: unknown command 'wat'"), { code: "commander.unknownCommand" });
  assert.deepEqual(normalizeError(error), new CliError("usage", "unknown command 'wat'"));
});
