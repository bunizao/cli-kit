import assert from "node:assert/strict";
import test from "node:test";

import { createProgram, examples, helpSection } from "../dist/index.js";

function demo() {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI." });
  // Registered out of section order on purpose: the first helpSection call for a title fixes its place.
  const submit = program.command("submit").description("Upload files.").argument("<ref>").argument("[files...]");
  helpSection(program.command("due").description("Items due soon.").argument("[unit]", "Unit code"), "Reading");
  const units = helpSection(program.command("units").aliases(["courses"]).description("Enrolled units."), "Reading");
  units.command("show").description("One unit. Sections included.").argument("<unit>", "Unit code").option("--brief", "Names only.");
  helpSection(submit, "Writing");
  program.command("doctor").description("Diagnose the setup.");
  examples(program, ["demo due", "demo units  # every unit"]);
  return program;
}

function helpOf(program, { colors = false, width = 80 } = {}) {
  let text = "";
  program.configureOutput({ writeOut: chunk => { text += chunk; }, getOutHasColors: () => colors, getOutHelpWidth: () => width });
  program.outputHelp();
  return text;
}

test("root help lists sections in registration order, then options and examples", () => {
  const text = helpOf(demo());
  assert.equal(text, [
    "demo v1.2.3",
    "Demo CLI",
    "",
    "Usage",
    "  demo [options] [command]",
    "",
    "Reading",
    "  due [unit]               Items due soon",
    "  units, courses           Enrolled units",
    "",
    "Writing",
    "  submit <ref> [files...]  Upload files",
    "",
    "Commands",
    "  doctor                   Diagnose the setup",
    "",
    "Options",
    "  -V, --version        Show the version",
    "  --json               Emit JSON",
    "  --yaml               Emit YAML",
    "  --table              Emit a human-readable table",
    "  --fields <fields>    Select top-level fields",
    "  -o, --output <file>  Write output to a file",
    "  --verbose            Enable debug logging",
    "  --no-color           Disable color output",
    "  -y, --yes            Confirm mutations non-interactively",
    "  --dry-run            Print the mutation plan without applying it",
    "  -h, --help           Show help",
    "",
    "Examples",
    "  demo due",
    "  demo units  # every unit",
    "",
    "Run 'demo <command> --help' for details on a command.",
    "",
  ].join("\n"));
});

test("subcommand help shows its path, usage and arguments, hides the implicit help command and a help-only Options, and names the global options", () => {
  const program = demo();
  const units = program.commands.find(command => command.name() === "units");
  assert.equal(helpOf(units), [
    "demo units",
    "Enrolled units",
    "",
    "Usage",
    "  demo units [options] [command]",
    "",
    "Commands",
    "  show <unit>  One unit. Sections included.",
    "",
    "Global options",
    "  --json, --yaml, --table, --fields <fields>, --output <file>, --verbose,",
    "  --no-color, --yes, --dry-run",
    "",
    "Run 'demo units <command> --help' for details on a command.",
    "",
  ].join("\n"));

  // Two sentences keep their full stops; the one-sentence option loses its own.
  const show = units.commands.find(command => command.name() === "show");
  assert.equal(helpOf(show), [
    "demo units show",
    "One unit. Sections included.",
    "",
    "Usage",
    "  demo units show [options] <unit>",
    "",
    "Arguments",
    "  unit  Unit code",
    "",
    "Options",
    "  --brief     Names only",
    "  -h, --help  Show help",
    "",
    "Global options",
    "  --json, --yaml, --table, --fields <fields>, --output <file>, --verbose,",
    "  --no-color, --yes, --dry-run",
    "",
  ].join("\n"));
});

test("a trailing full stop is dropped before Commander's choices and default extras", () => {
  const program = createProgram({ name: "demo", version: "1.0.0", description: "Demo" });
  program.command("post").addOption(program.createOption("--type <type>", "Thread type.").choices(["question", "post"]).default("question"));
  assert.match(helpOf(program.commands[0]), /--type <type>  Thread type \(choices: "question", "post", default: "question"\)/u);
});

test("help is coloured only when the output stream has colours, and widths ignore the escape codes", () => {
  const colored = helpOf(demo(), { colors: true });
  assert.match(colored, /\[1mUsage\[22m/u);
  assert.match(colored, /\[1mdue\[22m \[2m\[unit\]\[22m\s+Items due soon\n/u);
  assert.match(colored, /\[36m--json\[39m\s+Emit JSON/u);
  assert.match(colored, /demo units  \[2m# every unit\[22m/u);
  assert.doesNotMatch(helpOf(demo()), //u);
});

test("--no-color turns help colour off even on a colour terminal", async () => {
  const program = demo();
  let text = "";
  program.configureOutput({ writeOut: chunk => { text += chunk; } });
  process.env.FORCE_COLOR = "1";
  try {
    await program.parseAsync(["--no-color", "--help"], { from: "user" }).catch(error => {
      if (error.code !== "commander.helpDisplayed") throw error;
    });
  } finally {
    delete process.env.FORCE_COLOR;
  }
  assert.doesNotMatch(text, //u);
  assert.match(text, /^demo v1\.2\.3\n/u);
});
