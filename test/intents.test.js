import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SHARED_NOUNS, checkIntentCommands, createProgram, toolDescription } from "../dist/index.js";

function demo() {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  const courses = program.command("courses").aliases(["units", "projects"]);
  courses.command("list").option("--archived", "Include archived courses");
  courses.command("show <course>");
  program.command("grades").command("list [course]").option("--mode <mode>", "Which rows");
  program.command("download <ref>").alias("dl").option("--to <dir>", "Destination");
  return program;
}

const nouns = [SHARED_NOUNS.courses, { ...SHARED_NOUNS.grades, valueFlags: ["--mode"] }];

test("toolDescription reads as prose and skips missing fields", () => {
  assert.equal(
    toolDescription({ when: "my grades", what: "Graded items per course", refs: "course code or id", cost: "small" }),
    'Graded items per course. Use when the user says "my grades". Input: course code or id. Cost: small.',
  );
});

test("checkIntentCommands accepts commands that parse, with defaults, aliases and placeholders", () => {
  assert.doesNotThrow(() => checkIntentCommands(demo(), nouns, [
    { when: "my courses", what: "Courses.", command: "demo courses --archived" },
    { when: "one course", what: "A course.", command: "`demo units UNIT`" },
    { when: "grades", what: "Grades.", command: "demo grades [UNIT] --mode all --json" },
    { when: "a file", what: "A file.", command: 'demo dl "UNIT TASK" --to DIR [--dry-run]' },
    { when: "MCP only", what: "A widget.", tool: "show_widget" },
  ]));
});

test("checkIntentCommands reports renamed commands, removed options and the wrong binary", () => {
  assert.throws(
    () => checkIntentCommands(demo(), nouns, [
      { when: "a", what: "A.", command: "demo lessons UNIT" },
      { when: "b", what: "B.", command: "demo courses list --state active" },
      { when: "c", what: "C.", command: "other courses" },
    ]),
    (error) => {
      assert.match(error.message, /demo lessons UNIT: "lessons" is not a command of "demo"/);
      assert.match(error.message, /demo courses list --state active: unknown option "--state"/);
      assert.match(error.message, /other courses: starts with "other", not "demo"/);
      return true;
    },
  );
});

test("the intents entry point imports nothing but nouns, so a Worker can bundle it", async () => {
  const intents = await import("@bunizao/cli-kit/intents");
  assert.equal(typeof intents.toolDescription, "function");
  const imports = (file) => [...readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
  assert.deepEqual(imports("intents.js"), ["./nouns.js"]);
  assert.deepEqual(imports("nouns.js"), []);
});
