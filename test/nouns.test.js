import assert from "node:assert/strict";
import test from "node:test";

import { insertDefaultVerb } from "../dist/index.js";

const nouns = [
  {
    name: "courses",
    aliases: ["units", "projects"],
    verbs: ["list", "show", "get"],
    defaultByArity: { 0: "list", 1: "show" },
  },
  {
    name: "tasks",
    verbs: ["list", "show", "read"],
    defaultByArity: { 1: "list", 2: "show" },
    valueFlags: ["--status"],
  },
];

const cases = [
  ["zero arguments", [], []],
  ["zero-arity noun", ["courses"], ["courses", "list"]],
  ["alias resolution", ["units", "FIT1045"], ["courses", "show", "FIT1045"]],
  ["explicit verb", ["projects", "get", "FIT1045"], ["courses", "get", "FIT1045"]],
  ["long help", ["units", "--help"], ["courses", "--help"]],
  ["short help", ["projects", "-h"], ["courses", "-h"]],
  ["interleaved flags", ["tasks", "FIT1045", "--json"], ["tasks", "list", "FIT1045", "--json"]],
  ["command option value", ["tasks", "FIT1045", "--status", "rediscuss"], ["tasks", "list", "FIT1045", "--status", "rediscuss"]],
  ["unknown arity", ["courses", "FIT1045", "extra"], ["courses", "FIT1045", "extra"]],
  ["terminator", ["tasks", "FIT1045", "--", "-1"], ["tasks", "show", "FIT1045", "--", "-1"]],
  ["global flag before noun", ["--json", "courses"], ["--json", "courses", "list"]],
  ["global option before noun", ["--fields", "id,name", "courses"], ["--fields", "id,name", "courses", "list"]],
  ["unknown noun", ["widgets"], ["widgets"]],
];

for (const [name, argv, expected] of cases) {
  test(`insertDefaultVerb: ${name}`, () => {
    assert.deepEqual(insertDefaultVerb(argv, nouns), expected);
  });
}
