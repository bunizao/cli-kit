import assert from "node:assert/strict";
import test from "node:test";

import { commandsJson, createProgram, mutating } from "../dist/index.js";

test("commandsJson describes commands and marks mutations", () => {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  const units = program.command("units").alias("courses");
  units.command("list").option("--state <state>", "Filter state").addOption(
    units.createOption("--kind <kind>", "Filter kind").choices(["core", "elective"]),
  );
  mutating(units.command("set <unit> <state>").description("Change state"));

  const value = commandsJson(program);

  assert.equal(value.name, "demo");
  assert.equal(value.version, "1.2.3");
  assert.deepEqual(value.commands[0], {
    name: "units",
    noun: "units",
    aliases: ["courses"],
    description: "",
    positionals: [],
    options: [],
    mutating: false,
    commands: [
      {
        name: "list",
        noun: "units",
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
        noun: "units",
        verb: "set",
        aliases: [],
        description: "Change state",
        positionals: [
          { name: "unit", description: "", required: true, variadic: false },
          { name: "state", description: "", required: true, variadic: false },
        ],
        options: [],
        mutating: true,
        commands: [],
      },
    ],
  });
});

test("commandsJson rejects a verb outside the contract", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo CLI" });
  program.command("units").command("destroy <unit>");

  assert.throws(() => commandsJson(program), /Unsupported verb "destroy"/);
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
