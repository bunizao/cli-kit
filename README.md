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

Prefer `parseWithPrompts` over calling `parseAsync` yourself. It builds the program, parses,
and when a person at a terminal left out a trailing positional or a required option, asks for
it and parses again with the answer appended. `moodle activities list` becomes a unit picker
instead of `missing required argument 'unit'`. Without a terminal the usage error is thrown
unchanged, with the command's usage line and argument descriptions as its hint.

```ts
await parseWithPrompts(() => buildProgram(), args, {
  ui,
  fillers: {
    unit: async ({ ui }) => ui.select("Which unit?", await unitChoices()),
    task: async ({ provided, ui }) => ui.select("Which task?", await taskChoices(provided.unit)),
  },
});
```

A filler is looked up by argument name; without one, an argument with `.choices()` becomes a
picker and anything else a text prompt labelled with its description. Fillers see the
positionals typed so far, including earlier answers, so a task picker can load the chosen
unit. The factory is called once per round because Commander programs do not parse twice.

## Help

`createProgram` installs one help layout for the family: name and version, usage, the
commands, options, and a short "Try" list, coloured on a terminal and plain in a pipe.
`--no-color`, `NO_COLOR` and `FORCE_COLOR` are honoured. Group top-level commands with
`helpSection` the way `gh` does (core commands first, then the rest), add two or three
invocations with `examples` (text after two spaces and `#` renders as a comment), and
give the root a wordmark with `banner`; the art shows only to a person at a terminal.

```ts
helpSection(program.command("submit"), "Core commands");
examples(program, ["example units", "example submit UNIT report.pdf  # asks before uploading"]);
banner(program, EXAMPLE_WORDMARK);
```

## Theme

`createTheme(enabled)` paints the roles every CLI's human output shares, so a person
learns once what each colour means: `key` (cyan) is something they can type back, such
as a unit code or task number; `subject` (bold) is what they gave, such as files or a
message; `target` (bold cyan) is where it goes; `dim` is a secondary fact; `status`
colours a word by its `toneOf`, the vocabulary learning sites share ("overdue" is
danger, "graded" success, "not started" muted, "announcement" accent). Pass the theme
to `render` and a table gets a dim header, a keyed first column and toned status
columns; pass `tones` for words the shared list would misread. `ui.banner(art, tagline)`
opens an onboarding flow with the wordmark.

`isInformationalExit(error)` is true for the help and version exits Commander throws under
`exitOverride`, including a bare noun with no verb, so the run loop can return 0 for them.

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

## Human or agent

`detectAudience({ stdin, stdout, env, format })` returns `"human"` only for a person at a
terminal reading a table: both streams are TTYs, the format is not JSON or YAML, and none
of `AGENT_ENV_VARS` (`CLI_AGENT`, `CLAUDECODE`, `CI`) is set. Everyone else is an agent and
gets machine output, no prompts, and errors that name the flag to pass. `createUi` applies
the same environment rule on its own, so an agent that allocates a pty still never sees a
prompt. Agents that run commands in a terminal should export `CLI_AGENT=1`.

`ui.password` masks a secret; without a terminal it throws so the caller can point at a
`--token-stdin` style flag instead. `ui.editor` collects several lines in `$VISUAL` or
`$EDITOR` the way git collects a commit message, and throws without a terminal so the
caller can point at a `--body-file` style flag.
