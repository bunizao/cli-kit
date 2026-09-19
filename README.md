# @bunizao/cli-kit

Small shared primitives for the `ontrack`, `moodle`, and `edstem` command-line tools. The package
owns their stable command contract: verbs, error codes, exit codes, output formats, mutation
confirmation, and command self-description.

## Install

```sh
npm install https://codeload.github.com/bunizao/cli-kit/tar.gz/refs/tags/v0.1.0 commander
```

After the registry release, consumers can switch to the versioned package:

```sh
npm install @bunizao/cli-kit commander
```

Node.js 18 or newer is supported. Individual CLIs may require a newer runtime.

## Program setup

```ts
import {
  commandsJson,
  createProgram,
  insertDefaultVerb,
  mutating,
  type NounSpec,
} from "@bunizao/cli-kit";

const program = createProgram({
  name: "example",
  version: "1.0.0",
  description: "Example CLI",
});

const units = program.command("units").aliases(["courses", "projects"]);
units.command("list").action(listUnits);
units.command("show <unit>").action(showUnit);
mutating(units.command("set <unit> <state>")).action(setUnitState);

const nouns: readonly NounSpec[] = [
  {
    name: "units",
    aliases: ["courses", "projects"],
    verbs: ["list", "show", "set"],
    defaultByArity: { 0: "list", 1: "show" },
    valueFlags: [],
  },
];

const args = insertDefaultVerb(process.argv.slice(2), nouns);
await program.parseAsync(args, { from: "user" });
```

`insertDefaultVerb` accepts user arguments, not the Node executable and script prefix. It is a
pure transform and does not mutate the provided array.

List option flags that consume a separate value in `valueFlags`. This lets the arity counter ignore
option values when flags are interleaved with positionals. Boolean flags and `--flag=value` do not
need to be listed.

## Output and errors

`resolveFormat` applies explicit `--json`, `--yaml`, or `--table` flags, then defaults to `table`
for a TTY and `json` for a pipe. `render` serializes a value and can select top-level fields.
`writeOutput` writes to stdout or a file and treats a closed stdout pipe as successful.

Catch errors at the executable boundary and render them once:

```ts
const format = resolveFormat(program.opts(), process.stdout.isTTY === true);

try {
  await program.parseAsync(args, { from: "user" });
} catch (error) {
  const isNormalExit = typeof error === "object" && error && "exitCode" in error && error.exitCode === 0;
  if (!isNormalExit) {
    const reported = reportError(error, format);
    process.stderr.write(reported.text);
    process.exitCode = reported.exitCode;
  }
}
```

Commander error text is suppressed by `createProgram`, so the shared reporter is the only error
renderer. Help and version requests render normally, then throw Commander's zero-exit signal;
preserve that status without reporting it. Usage failures throw for the boundary to report once.

## Mutations

Call `mutating(command)` for `send`, `submit`, `set`, and `mark-read` commands. The marker is
included by `commandsJson`. Command actions call `confirm` before making an upstream request:

```ts
const shouldApply = await confirm(
  { summary: "Set FIT1045 task 1.1 to complete" },
  { yes: options.yes, dryRun: options.dryRun, interactive: process.stdin.isTTY === true },
);

if (!shouldApply) return;
```

The plan and prompt are written to stderr. A non-interactive mutation without `--yes` throws a
`usage` error. A dry run prints its plan and returns `false`.

## Command description

`commandsJson(program)` returns the program metadata and full command tree. Every node includes
aliases, positional arguments, options, enum values, nested commands, and `mutating`. Domain
commands at noun depth must use a verb exported in `VERBS`; unsupported verbs throw. `auth` and
`skills` are action groups rather than domain nouns and are not assigned a `verb` field.

The exit-code table, error vocabulary, and verb set are public versioned API. Changing one requires
a major package release.

The conformance suite is isolated under `conformance/`. Until all three CLIs have published their
normalized releases, missing binaries are reported as skipped tests. Its CI workflow installs the
published packages before running the suite.

## Prompts and progress

`createUi` gives every CLI the same interactive surface, drawn with `@clack/prompts` on
stderr so `--json` output on stdout stays clean. It only prompts when both stdin and the
output are terminals; in a pipe, log calls print plain completed lines, spinners print
their outcome, and every prompt throws a `usage` error that says what to pass instead.

```ts
const ui = createUi();
ui.intro("moodle submit");
const unit = await ui.select("Which unit?", candidates.map((c) => ({ value: c.id, label: c.name, hint: c.code })));
const spin = ui.spinner();
spin.start("Uploading 2 files");
spin.stop("Uploaded 2 files");
ui.outro("Done");
```

`select` switches to type-to-filter above `AUTOCOMPLETE_FROM` choices. Ctrl+C inside a
prompt throws a `cancelled` error (exit 130). `confirm(plan, options)` is built on the same
layer and keeps its contract: `--dry-run` prints the plan, `--yes` skips the question, a pipe
without `--yes` is a usage error.
