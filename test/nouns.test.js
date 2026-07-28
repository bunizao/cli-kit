import assert from "node:assert/strict";
import test from "node:test";

import { insertDefaultVerb } from "../dist/index.js";

const nouns = [
  {
    name: "units",
    aliases: ["courses", "projects"],
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
  ["zero-arity noun", ["units"], ["units", "list"]],
  ["alias resolution", ["courses", "FIT1045"], ["units", "show", "FIT1045"]],
  ["explicit verb", ["projects", "get", "FIT1045"], ["units", "get", "FIT1045"]],
  ["long help", ["courses", "--help"], ["units", "--help"]],
  ["short help", ["projects", "-h"], ["units", "-h"]],
  ["interleaved flags", ["tasks", "FIT1045", "--json"], ["tasks", "list", "FIT1045", "--json"]],
  ["command option value", ["tasks", "FIT1045", "--status", "rediscuss"], ["tasks", "list", "FIT1045", "--status", "rediscuss"]],
  ["unknown arity", ["units", "FIT1045", "extra"], ["units", "FIT1045", "extra"]],
  ["terminator", ["tasks", "FIT1045", "--", "-1"], ["tasks", "show", "FIT1045", "--", "-1"]],
  ["global flag before noun", ["--json", "units"], ["--json", "units", "list"]],
  ["global option before noun", ["--fields", "id,name", "units"], ["--fields", "id,name", "units", "list"]],
  ["unknown noun", ["widgets"], ["widgets"]],
];

for (const [name, argv, expected] of cases) {
  test(`insertDefaultVerb: ${name}`, () => {
    assert.deepEqual(insertDefaultVerb(argv, nouns), expected);
  });
}
