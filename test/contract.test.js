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

test("a table keeps every column, including those the first row omits", () => {
  const rows = [{ id: 1, title: "first" }, { id: 2, title: "second", due: "2026-09-20" }];
  const lines = render(rows, { format: "table" }).trimEnd().split("\n");
  assert.equal(lines[0], "id  title   due");
  assert.equal(lines[1], "1   first");
  assert.equal(lines[2], "2   second  2026-09-20");
});

test("a table fits the terminal width by truncating, never by dropping a column", () => {
  const rows = [{ id: 1, body: "x".repeat(120), tail: "keep" }];
  const lines = render(rows, { format: "table", width: 40 }).trimEnd().split("\n");
  for (const line of lines) assert.ok(line.length <= 40, `"${line}" is ${line.length} wide`);
  assert.ok(lines[0].includes("tail"));
  assert.ok(lines[1].endsWith("keep"));
  assert.ok(lines[1].includes("…"));
});

test("a table flattens nested values instead of printing JSON in a cell", () => {
  const rows = [{ flags: ["pinned", "answered"], counts: { votes: 1, views: 171, stars: null } }];
  const body = render(rows, { format: "table" }).trimEnd().split("\n")[1];
  assert.equal(body, "pinned, answered  votes=1 views=171");
});

test("render emits compact JSON when the caller is not a terminal", () => {
  assert.equal(render([{ id: 1 }], { format: "json", pretty: false }), '[{"id":1}]\n');
});
