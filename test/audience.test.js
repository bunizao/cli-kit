import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createUi, detectAudience, isAgentEnvironment } from "../dist/index.js";

const tty = { isTTY: true };
const pipe = { isTTY: false };

test("a person at a terminal asking for a table is human", () => {
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: {}, format: "table" }), "human");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: {} }), "human");
});

test("machine output, a pipe on either side, or an agent marker means agent", () => {
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: {}, format: "json" }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: {}, format: "yaml" }), "agent");
  assert.equal(detectAudience({ stdin: pipe, stdout: tty, env: {} }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: pipe, env: {} }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: { CI: "true" } }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: { CLI_AGENT: "1" } }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: { CLAUDECODE: "1" } }), "agent");
  assert.equal(detectAudience({ stdin: tty, stdout: tty, env: { TERM_PROGRAM: "claude-desktop" } }), "human");
});

test("an agent marker set to an off value does not count", () => {
  assert.equal(isAgentEnvironment({ CI: "" }), false);
  assert.equal(isAgentEnvironment({ CI: "0" }), false);
  assert.equal(isAgentEnvironment({ CLI_AGENT: "false" }), false);
  assert.equal(isAgentEnvironment({ CLI_AGENT: "yes" }), true);
});

test("the ui never prompts in an agent environment even with terminals", () => {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  assert.equal(createUi({ input, output, env: { CLI_AGENT: "1" } }).interactive, false);
  assert.equal(createUi({ input, output, env: {} }).interactive, true);
});
