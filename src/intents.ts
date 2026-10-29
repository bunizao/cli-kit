import type { Command, Option } from "commander";

import { insertDefaultVerb, type NounSpec } from "./nouns.js";

/**
 * One thing a person asks for, mapped to the CLI command and the MCP tool that answer it.
 * The skill, the MCP tool descriptions and the help text all render from these fields.
 */
export interface Intent {
  /** What the person says, e.g. "my grades / what did I get". */
  readonly when: string;
  /** What comes back, as a sentence. */
  readonly what: string;
  /** The command as typed, with placeholders such as UNIT; omitted for an MCP-only tool. */
  readonly command?: string;
  /** The MCP tool for the same request; omitted for a CLI-only command. */
  readonly tool?: string;
  /** Where nearby requests go instead, e.g. "get_thread for thread bodies". */
  readonly instead?: string;
  /** The references and arguments it accepts. */
  readonly refs?: string;
  /** The usual next step. */
  readonly then?: string;
  /** Rough response size. */
  readonly cost?: string;
}

/** The MCP tool description for an intent: prose, because a model reads it. */
export function toolDescription(intent: Intent): string {
  return [
    sentence(intent.what),
    sentence(`Use when the user says "${intent.when}"`),
    intent.instead && sentence(`Instead: ${intent.instead}`),
    intent.refs && sentence(`Input: ${intent.refs}`),
    intent.then && sentence(`Then: ${intent.then}`),
    intent.cost && sentence(`Cost: ${intent.cost}`),
  ].filter(Boolean).join(" ");
}

/**
 * Throw when an intent's command no longer parses against the program: a renamed noun or verb,
 * a wrong binary name, or an option that was removed. Run it in the CLI's tests.
 */
export function checkIntentCommands(program: Command, nouns: readonly NounSpec[], intents: readonly Intent[]): void {
  const problems = intents.flatMap((intent) => (intent.command ? commandProblems(program, nouns, intent.command) : []));
  if (problems.length) throw new Error(`Intent commands out of date:\n${problems.join("\n")}`);
}

const ALWAYS_ACCEPTED = new Set(["-h", "--help", "-V", "--version"]);

function commandProblems(program: Command, nouns: readonly NounSpec[], text: string): string[] {
  const [binary, ...rest] = words(text);
  if (binary !== program.name()) return [`${text}: starts with "${binary}", not "${program.name()}"`];

  const argv = insertDefaultVerb(rest.map(unwrapOptionalFlag), nouns);
  const path = [program];
  let unmatched: string | undefined;
  for (const token of argv) {
    if (token.startsWith("-")) continue;
    const current = path.at(-1) as Command;
    const child = current.commands.find((command) => command.name() === token || command.aliases().includes(token));
    if (!child) {
      unmatched = token;
      break;
    }
    path.push(child);
  }

  const problems: string[] = [];
  const resolved = path.at(-1) as Command;
  // A group that takes no arguments of its own must be followed by one of its commands.
  if (unmatched !== undefined && resolved.commands.length && !resolved.registeredArguments.length) {
    problems.push(`${text}: "${unmatched}" is not a command of "${path.map((command) => command.name()).join(" ")}"`);
  }

  const options = new Set(path.flatMap((command) => command.options.flatMap(optionNames)));
  for (const token of argv) {
    const flag = token.split("=")[0] ?? token;
    if (flag.startsWith("-") && !ALWAYS_ACCEPTED.has(flag) && !options.has(flag)) {
      problems.push(`${text}: unknown option "${flag}"`);
    }
  }
  return problems;
}

// Quoted strings and bracketed placeholders such as <lesson id> stay one word.
function words(text: string): string[] {
  return text.replace(/^`|`$/g, "").match(/"[^"]*"|'[^']*'|<[^>]*>|\[[^\]]*\]|\S+/g) ?? [];
}

// `[--final]` documents an optional flag; check it like `--final`.
function unwrapOptionalFlag(token: string): string {
  const inner = /^\[(-[^\s\]]+)/.exec(token);
  return inner?.[1] ?? token;
}

function optionNames(option: Option): string[] {
  return [option.long, option.short].filter((name): name is string => Boolean(name));
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
