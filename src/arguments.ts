import type { Argument, Command, Option } from "commander";

import { CliError } from "./errors.js";
import type { Ui } from "./ui.js";

export interface FillContext {
  readonly command: Command;
  /** Positionals the person already typed, by argument name, including earlier answers. */
  readonly provided: Readonly<Record<string, string>>;
  readonly ui: Ui;
}

/** Produces the value for one missing positional. A variadic one may return several tokens. */
export type ArgumentFiller = (context: FillContext) => Promise<string | readonly string[]>;

export interface PromptParseOptions {
  readonly ui: Ui;
  /** Fillers by argument name (`unit`), consulted before the generic choice or text prompt. */
  readonly fillers?: Readonly<Record<string, ArgumentFiller>>;
}

// Every round appends at least one token, so this only guards a filler that keeps failing.
const MAX_ROUNDS = 8;

/**
 * Parse argv with a freshly built program. When a person at a terminal left out trailing
 * positionals or a required option, ask for them and parse again with the answers appended,
 * so `moodle activities list` becomes a unit picker instead of a usage error. Anyone else
 * gets the usage error, with the command's usage line as the hint.
 */
export async function parseWithPrompts(build: () => Command, argv: readonly string[], options: PromptParseOptions): Promise<void> {
  let args = [...argv];
  for (let round = 0; ; round += 1) {
    const program = build();
    annotate(program);
    try {
      await program.parseAsync(args, { from: "user" });
      return;
    } catch (error) {
      const failing = failingCommand(error);
      if (!failing) throw error;
      if (!options.ui.interactive) throw withUsageHint(error, failing.command);
      if (round >= MAX_ROUNDS) throw error;
      const answers = await answersFor(failing.command, failing.code, options);
      if (!answers.length) throw error;
      args = [...args, ...answers];
    }
  }
}

interface FailingCommand {
  readonly command: Command;
  readonly code: string;
}

const FILLABLE = new Set(["commander.missingArgument", "commander.missingMandatoryOptionValue"]);

// Commander reports a missing argument without saying which command wanted it, so every
// command rethrows its own exit with itself attached.
function annotate(command: Command): void {
  command.exitOverride(error => {
    throw Object.assign(error, { command });
  });
  for (const child of command.commands) annotate(child);
}

function failingCommand(error: unknown): FailingCommand | undefined {
  if (!error || typeof error !== "object") return undefined;
  const { code, command } = error as { code?: unknown; command?: unknown };
  if (typeof code !== "string" || !FILLABLE.has(code) || !command) return undefined;
  return { command: command as Command, code };
}

async function answersFor(command: Command, code: string, options: PromptParseOptions): Promise<string[]> {
  if (code === "commander.missingArgument") return fillPositionals(command, options);
  return fillOption(command, options.ui);
}

async function fillPositionals(command: Command, options: PromptParseOptions): Promise<string[]> {
  const typed = command.args;
  const provided: Record<string, string> = {};
  command.registeredArguments.forEach((argument, index) => {
    const value = typed[index];
    if (value !== undefined) provided[argument.name()] = value;
  });

  const answers: string[] = [];
  for (const argument of command.registeredArguments.slice(typed.length)) {
    // Commander requires the required positionals to come first, so the first optional one ends the asking.
    if (!argument.required) break;
    const answer = await answerFor(argument, { command, provided: { ...provided }, ui: options.ui }, options.fillers?.[argument.name()]);
    const tokens = typeof answer === "string" ? (argument.variadic ? answer.split(/\s+/u) : [answer.trim()]).filter(Boolean) : [...answer];
    if (!tokens.length) throw new CliError("usage", `${argument.name()} is required.`);
    provided[argument.name()] = tokens.join(" ");
    answers.push(...tokens);
  }
  return answers;
}

function answerFor(argument: Argument, context: FillContext, filler: ArgumentFiller | undefined): Promise<string | readonly string[]> {
  if (filler) return filler(context);
  const message = argument.description || argument.name();
  if (argument.argChoices) return context.ui.select(message, argument.argChoices.map(value => ({ value, label: value })));
  return context.ui.text(message, { validate: value => (value.trim() ? undefined : "Required.") });
}

async function fillOption(command: Command, ui: Ui): Promise<string[]> {
  const option = command.options.find(candidate => candidate.mandatory && command.getOptionValue(candidate.attributeName()) === undefined);
  const flag = option?.long ?? option?.short;
  if (!option || !flag) return [];
  const message = option.description || flag;
  if (!option.required && !option.optional) return (await ui.confirm(message)) ? [flag] : [];
  const value = option.argChoices
    ? await ui.select(message, option.argChoices.map(choice => ({ value: choice, label: choice })))
    : await ui.text(message, { validate: text => (text.trim() ? undefined : "Required.") });
  return [flag, value.trim()];
}

/** The same usage error, plus the usage line an agent needs to correct the call. */
function withUsageHint(error: unknown, command: Command): unknown {
  if (!(error instanceof Error)) return error;
  const names: string[] = [];
  for (let current: Command | null = command; current; current = current.parent) names.unshift(current.name());
  const describe = (item: Argument | Option, term: string) => (item.description ? `  ${term}  ${item.description}` : undefined);
  const lines = [
    `Usage: ${names.join(" ")} ${command.usage()}`,
    ...command.registeredArguments.map(argument => describe(argument, argument.name())),
    ...command.options.filter(option => option.mandatory).map(option => describe(option, option.flags)),
  ].filter((line): line is string => Boolean(line));
  return new CliError("usage", error.message.replace(/^error:\s*/iu, ""), lines.join("\n"));
}
