import assert from "node:assert/strict";
import test from "node:test";

import { commandsJson, createProgram, mutating } from "../dist/index.js";

test("commandsJson describes commands and marks mutations", () => {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  const tasks = program.command("tasks").alias("assignments");
  tasks.command("list").option("--state <state>", "Filter state").addOption(
    tasks.createOption("--kind <kind>", "Filter kind").choices(["core", "elective"]),
  );
  mutating(tasks.command("set <task> <state>").description("Change state"));

  const value = commandsJson(program);

  assert.equal(value.name, "demo");
  assert.equal(value.version, "1.2.3");
  assert.deepEqual(value.commands[0], {
    name: "tasks",
    noun: "tasks",
    aliases: ["assignments"],
    description: "",
    positionals: [],
    options: [],
    mutating: false,
    commands: [
      {
        name: "list",
        noun: "tasks",
        verb: "list",
        aliases: [],
        description: "",
        positionals: [],
        options: [
          { flags: "--state <state>", description: "Filter state", required: true, variadic: false },
          {
            flags: "--kind <kind>",
            description: "Filter kind",
            required: true,
            variadic: false,
            enumValues: ["core", "elective"],
          },
        ],
        mutating: false,
        commands: [],
      },
      {
        name: "set",
        noun: "tasks",
        verb: "set",
        aliases: [],
        description: "Change state",
        positionals: [
          { name: "task", description: "", required: true, variadic: false },
          { name: "state", description: "", required: true, variadic: false },
        ],
        options: [],
        mutating: true,
        commands: [],
      },
    ],
  });
});

test("commandsJson leaves hidden options out", () => {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  const list = program.command("tasks").command("list").option("--limit <n>", "Maximum rows");
  list.addOption(list.createOption("--max <n>").hideHelp());

  const [tasks] = commandsJson(program).commands;

  assert.deepEqual(tasks.commands[0].options.map((option) => option.flags), ["--limit <n>"]);
});

test("commandsJson rejects a verb outside the contract", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("tasks").command("destroy <task>");

  assert.throws(() => commandsJson(program), /Unsupported verb "destroy"/);
});

test("commandsJson accepts shared nouns under their canonical names", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("courses").aliases(["units", "projects"]).command("list");
  program.command("grades").command("list [course]");

  assert.deepEqual(commandsJson(program).commands.map((command) => command.name), ["courses", "grades"]);
});

test("commandsJson rejects a shared alias used as the command name", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("units").alias("courses").command("list");

  assert.throws(() => commandsJson(program), /"units" belongs to the shared noun "courses"; name that command "courses"/);
});

test("commandsJson rejects a shared name or alias on another command", () => {
  for (const alias of ["units", "grades"]) {
    const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
    program.command("tasks").alias(alias).command("list");

    assert.throws(() => commandsJson(program), new RegExp(`"${alias}" belongs to the shared noun`));
  }
});

test("commandsJson rejects a contract verb a shared noun does not offer", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("grades").command("set <grade>");

  assert.throws(() => commandsJson(program), /Unsupported verb "set" on shared noun "grades"/);
});

test("commandsJson rejects an unknown action in an exceptional group", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("auth").command("bananas");

  assert.throws(() => commandsJson(program), /Unsupported action "bananas" on group "auth"/);
});

test("help and version throw a zero-exit signal under exitOverride", async () => {
  for (const args of [["--help"], ["-h"], ["-V"]]) {
    const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
    program.configureOutput({ writeOut: () => undefined });
    await assert.rejects(program.parseAsync(args, { from: "user" }), (error) => {
      assert.equal(error.exitCode, 0);
      return true;
    });
  }
});

test("commander usage failures still throw once", async () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  await assert.rejects(program.parseAsync(["bogus"], { from: "user" }), (error) => {
    assert.match(error.code, /^commander\./);
    assert.equal(error.exitCode, 1);
    return true;
  });
});
