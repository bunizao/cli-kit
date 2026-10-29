import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { score } from "../evals/trigger.mjs";

const SKILLS = ["moodle-cli", "ontrack-cli"];
const run = (query, expected, picked) => ({ query, expected, picked });

test("trigger eval scores the majority pick per query and each skill's binary view", () => {
  const { queries, perSkill, routed } = score([
    run("what's due", "moodle-cli", "moodle-cli"),
    run("what's due", "moodle-cli", "moodle-cli"),
    run("what's due", "moodle-cli", "ontrack-cli"),
    run("overdue tasks", "ontrack-cli", "moodle-cli"),
    run("overdue tasks", "ontrack-cli", "moodle-cli"),
    run("overdue tasks", "ontrack-cli", "ontrack-cli"),
    run("study timetable", "none", "other"),
    run("study timetable", "none", "none"),
  ], SKILLS);

  assert.deepEqual(queries.map(({ top, ok }) => [top, ok]), [["moodle-cli", true], ["moodle-cli", false], ["other", true]]);
  assert.equal(routed, 2);
  assert.deepEqual(perSkill["moodle-cli"], { shouldTrigger: [1, 1], shouldNot: [1, 2] });
  assert.deepEqual(perSkill["ontrack-cli"], { shouldTrigger: [0, 1], shouldNot: [2, 2] });
});

test("trigger pool names no institution's unit codes", () => {
  const pool = JSON.parse(readFileSync(new URL("../evals/trigger-pool.json", import.meta.url), "utf8"));
  assert.ok(pool.length > 0);
  for (const { query, expected } of pool) {
    assert.equal(typeof query, "string");
    assert.equal(typeof expected, "string");
    assert.doesNotMatch(query, /\b[A-Z]{3}\d{4}\b/);
  }
});
