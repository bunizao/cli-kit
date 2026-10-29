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
  SHARED_NOUNS,
  type NounSpec,
} from "@bunizao/cli-kit";

const program = createProgram({
  name: "example",
  version: "1.0.0",
  description: "Example CLI",
});

const courses = program.command("courses").aliases(["units", "projects"]);
courses.command("list").action(listCourses);
courses.command("show <course>").action(showCourse);
const tasks = program.command("tasks");
tasks.command("list <course>").action(listTasks);
mutating(tasks.command("set <course> <task> <state>")).action(setTaskState);

const nouns: readonly NounSpec[] = [
  SHARED_NOUNS.courses,
  {
    name: "tasks",
    verbs: ["list", "set"],
    defaultByArity: { 1: "list" },
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

A top-level command named after a shared noun's alias throws, and so does a verb that shared noun
does not offer.

The exit-code table, error vocabulary, verb set, and shared nouns are public versioned API. Changing
one requires a major package release.

The conformance suite is isolated under `conformance/`. Until all three CLIs have published their
normalized releases, missing binaries are reported as skipped tests. Its CI workflow installs the
published packages before running the suite.

## Shared nouns

`SHARED_NOUNS` holds the nouns every CLI names the same way. A CLI that offers one uses its spec
as is, or with fewer verbs and its own `valueFlags`; domain nouns such as `tasks` or `lessons`
stay with each CLI.

| Noun | Aliases | Verbs | Default by arity |
|---|---|---|---|
| `courses` | `units`, `projects` | list, show, get | 0 list, 1 show |
| `grades` | | list | 0 list, 1 list |

`courses` is canonical because Ed and Moodle both call them courses; `units` is an Australian usage.

Each `grades` row carries `grade` and `max` as numbers or `null`, and a `status` from
`GRADE_STATUSES`: `graded`, `ungraded`, `unreleased` (marked but not released to the student),
`not_submitted`, or `unavailable` (the platform refused or failed for that row). Display strings
such as a letter grade or a range are optional extra fields.

## Intents, skills and plugins

An `Intent` maps what a person says to the command and the MCP tool that answer it. One list of
intents is the single source for the skill, the MCP tool descriptions and the agent packaging:

```ts
const INTENTS: readonly Intent[] = [
  {
    when: "my grades / what did I get",
    what: "Graded items per course with grade, max and status.",
    command: "example grades [COURSE]",
    tool: "list_grades",
    refs: "course code, name or id",
    then: "show the item for feedback",
    cost: "small",
  },
];

server.registerTool("list_grades", { description: toolDescription(INTENTS[0]) /* , schema */ }, handler);

const files = agentFiles({
  skill: { name: "example-cli", description, title: "Example CLI", intents: INTENTS, program: commandsJson(program) },
  version,
  repository: "https://github.com/example/example-cli",
  author: { name: "example" },
  mcpServers: { example: { command: "npx", args: ["-y", "example-cli", "mcp"] } },
});
writeAgentFiles(process.cwd(), files); // { check: true } returns stale paths for CI
```

`agentFiles` returns, by path from the repository root:

- `SKILL.md`, for `npx skills add owner/repo`. An agent loads it whole, so it stays short: the
  intent table, which MCP tool answers what, the shared rules plus the CLI's own, the setup and the
  exit codes. Each tool's full description stays with the MCP server.
- `references/commands.md`: every command with its arguments, options and whether it mutates.
  `SKILL.md` links to it.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`: the repository is a Claude
  Code plugin whose one skill is `SKILL.md`, and its own marketplace. Install with
  `claude plugin marketplace add owner/repo`, then `claude plugin install example-cli@example-cli`.
  A repository with a root `CLAUDE.md` gets one validator warning, since that file is not plugin
  context; `claude plugin validate .` passes, `--strict` does not.
- `agents/openai.yaml`, when `openai` metadata is given.

An MCP server that runs on Cloudflare Workers imports `toolDescription` from
`@bunizao/cli-kit/intents`, which pulls in neither commander nor Node builtins.

`checkIntentCommands(program, nouns, intents)` throws when an intent's command no longer parses:
a renamed noun or verb, a removed option, or the wrong binary name. Call it from the CLI's tests
so the skill and the MCP descriptions cannot drift from the command tree.

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

`select` switches to type-to-filter above `AUTOCOMPLETE_FROM` choices, or always with
`{ search: true }`; every typed word must appear in the label or hint, in any order.
`{ initial }` highlights a row. A multi-step picker passes `{ back: true }` and gets `BACK`
when the person presses Escape. Ctrl+C inside a prompt throws a `cancelled` error (exit 130). `confirm(plan, options)` is built on the same
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
