import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { CliError, createProgram, createUi, parseWithPrompts } from "../dist/index.js";

const DOWN = "[B";
const ENTER = "\r";

function press(input, keys, delay = 0) {
  setTimeout(() => input.write(keys), delay);
}

function build(calls) {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo" });
  const units = program.command("units");
  units.command("show").argument("<unit>", "Unit code").action(unit => calls.push(["show", unit]));
  const tasks = program.command("tasks");
  tasks.command("show").argument("<unit>", "Unit code").argument("<task>", "Task id").action((unit, task) => calls.push(["task", unit, task]));
  program.command("search").argument("<unit>", "Unit code").argument("<query...>", "Words").action((unit, query) => calls.push(["search", unit, query]));
  program.command("completion").addArgument(program.createArgument("<shell>", "Shell").choices(["bash", "zsh"])).action(shell => calls.push(["completion", shell]));
  program.command("post").argument("<unit>", "Unit code").requiredOption("--title <title>", "Thread title").action((unit, options) => calls.push(["post", unit, options.title]));
  return program;
}

test("without a terminal a missing positional stays a usage error, now carrying the usage line", async () => {
  const calls = [];
  const ui = createUi({ input: new PassThrough(), output: new PassThrough(), interactive: false });
  await assert.rejects(
    () => parseWithPrompts(() => build(calls), ["units", "show"], { ui }),
    error => error instanceof CliError && error.code === "usage"
      && error.message === "missing required argument 'unit'"
      && error.hint === "Usage: demo units show [options] <unit>\n  unit  Unit code",
  );
  await assert.rejects(
    () => parseWithPrompts(() => build(calls), ["post", "UNIT"], { ui }),
    error => error.message === "required option '--title <title>' not specified"
      && error.hint === "Usage: demo post [options] <unit>\n  unit  Unit code\n  --title <title>  Thread title",
  );
  assert.deepEqual(calls, []);
});

test("a person is asked for the missing positional through the filler, then the command runs", async () => {
  const calls = [];
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  const contexts = [];
  const fillers = {
    unit: async context => {
      contexts.push(context.provided);
      return context.ui.select("Which unit?", [{ value: "UNIT1", label: "Algebra" }, { value: "UNIT2", label: "Biology" }]);
    },
  };
  press(input, DOWN, 20);
  press(input, ENTER, 40);
  await parseWithPrompts(() => build(calls), ["units", "show"], { ui, fillers });
  assert.deepEqual(calls, [["show", "UNIT2"]]);
  assert.deepEqual(contexts, [{}]);
});

test("later positionals see the earlier answers, and a typed one is never asked again", async () => {
  const calls = [];
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  const fillers = {
    task: async context => `${context.provided.unit}-task`,
  };
  await parseWithPrompts(() => build(calls), ["tasks", "show", "UNIT1"], { ui, fillers });
  assert.deepEqual(calls, [["task", "UNIT1", "UNIT1-task"]]);
});

test("without a filler the person types the value, and a variadic answer splits into tokens", async () => {
  const calls = [];
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  press(input, "UNIT1", 20);
  press(input, ENTER, 40);
  press(input, "lab report", 80);
  press(input, ENTER, 100);
  await parseWithPrompts(() => build(calls), ["search"], { ui });
  assert.deepEqual(calls, [["search", "UNIT1", ["lab", "report"]]]);
});

test("declared choices become a picker", async () => {
  const calls = [];
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  press(input, DOWN, 20);
  press(input, ENTER, 40);
  await parseWithPrompts(() => build(calls), ["completion"], { ui });
  assert.deepEqual(calls, [["completion", "zsh"]]);
});

test("a required option is asked for too", async () => {
  const calls = [];
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  press(input, "Week 3 question", 20);
  press(input, ENTER, 40);
  await parseWithPrompts(() => build(calls), ["post", "UNIT1"], { ui });
  assert.deepEqual(calls, [["post", "UNIT1", "Week 3 question"]]);
});

test("other errors pass through untouched", async () => {
  const calls = [];
  const ui = createUi({ input: new PassThrough(), output: new PassThrough(), interactive: true });
  await assert.rejects(
    () => parseWithPrompts(() => build(calls), ["units", "nope"], { ui }),
    error => error.code === "commander.unknownCommand",
  );
});
