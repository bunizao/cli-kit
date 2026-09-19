import type { Argument, Command, Help, Option } from "commander";

import { painter, type Paint } from "./color.js";

const sections = new WeakMap<Command, string>();
const sectionOrder = new WeakMap<Command, string[]>();
const exampleLines = new WeakMap<Command, readonly string[]>();
const banners = new WeakMap<Command, string>();

/**
 * List a subcommand under `title` in its parent's help instead of the one flat list.
 * Sections appear in the order they were first named, so the caller decides that
 * "Reading" precedes "Setup" however the commands were registered.
 */
export function helpSection(command: Command, title: string): Command {
  sections.set(command, title);
  if (command.parent) {
    const order = sectionOrder.get(command.parent) ?? [];
    if (!order.includes(title)) sectionOrder.set(command.parent, [...order, title]);
  }
  return command;
}

/** A few invocations shown under "Try" in the command's help; text after `  # ` renders as a comment. */
export function examples(command: Command, lines: readonly string[]): Command {
  exampleLines.set(command, lines);
  return command;
}

/**
 * ASCII art shown above the root help page, but only to a person: a pipe and an agent
 * get the plain header, because art in a transcript is noise.
 */
export function banner(command: Command, art: string): Command {
  banners.set(command, art.replace(/^\n+|\s+$/gu, ""));
  return command;
}

interface HelpContext {
  readonly error?: boolean;
  readonly helpWidth?: number;
  readonly outputHasColors?: boolean;
}

type StyledHelper = Help & { hasColors?: boolean; terminal?: boolean };

/**
 * The help layout every CLI in the family shares: name and version, a usage line, the
 * commands grouped by section, then options and examples. Colour follows the output
 * stream, so a pipe and an agent get the same text without escape codes.
 */
export function styledHelp(): Partial<Help> {
  return {
    prepareContext(this: StyledHelper, context: HelpContext) {
      this.helpWidth = this.helpWidth ?? context.helpWidth ?? 80;
      this.hasColors = context.outputHasColors ?? false;
      // Commander reports a width only for a terminal; forced colour means a person asked for the styled page.
      this.terminal = typeof context.helpWidth === "number" || Boolean(context.outputHasColors);
    },
    formatHelp(this: StyledHelper, command: Command, helper: Help) {
      const styled = helper as StyledHelper;
      return formatHelp(command, helper, painter(Boolean(styled.hasColors)), Boolean(styled.terminal));
    },
  };
}

function formatHelp(command: Command, helper: Help, paint: Paint, terminal: boolean): string {
  const blocks: string[] = [];
  const width = helper.helpWidth ?? 80;
  const title = (text: string) => paint("bold", text);
  const list = (items: readonly { term: string; description: string }[]) => {
    const termWidth = Math.max(...items.map(item => helper.displayWidth(item.term)));
    return items.map(item => helper.formatItem(item.term, termWidth, tidy(item.description), helper));
  };

  const version = command.parent ? undefined : command.version();
  const art = command.parent ? undefined : banners.get(command);
  if (art && terminal) {
    // The wordmark is the name; the version rides on the description line instead of a second header.
    blocks.push(...art.split("\n").map(line => paint("cyan", line)), "");
    if (command.description()) blocks.push(`${helper.boxWrap(tidy(command.description()), width)}${version ? `  ${paint("dim", `v${version}`)}` : ""}`);
  } else {
    blocks.push(`${paint("bold", commandPath(command))}${version ? ` ${paint("dim", `v${version}`)}` : ""}`);
    if (command.description()) blocks.push(helper.boxWrap(tidy(command.description()), width));
  }
  blocks.push("");

  // Commander's own usage line repeats the aliases ("units|courses"); the path is enough.
  blocks.push(title("Usage"), `  ${styleUsage(`${commandPath(command)} ${command.usage()}`, paint)}`, "");

  const args = helper.visibleArguments(command);
  if (args.length) {
    blocks.push(title("Arguments"), ...list(args.map(argument => ({ term: paint("bold", helper.argumentTerm(argument)), description: helper.argumentDescription(argument) }))), "");
  }

  // The implicit help command is not one of `command.commands`; the footer already says how to get help.
  const commands = helper.visibleCommands(command).filter(child => command.commands.includes(child));
  const groups = new Map<string, Command[]>();
  for (const heading of sectionOrder.get(command) ?? []) groups.set(heading, []);
  for (const child of commands) {
    const heading = sections.get(child) ?? "Commands";
    groups.set(heading, [...(groups.get(heading) ?? []), child]);
  }
  const termWidth = commands.length ? Math.max(...commands.map(child => helper.displayWidth(subcommandTerm(child, paint)))) : 0;
  for (const [heading, children] of groups) {
    if (!children.length) continue;
    blocks.push(title(heading), ...children.map(child => helper.formatItem(subcommandTerm(child, paint), termWidth, tidy(helper.subcommandDescription(child)), helper)), "");
  }

  // A section holding nothing but --help says nothing.
  const options = helper.visibleOptions(command);
  if (options.some(option => option.long !== "--help")) {
    blocks.push(title("Options"), ...list(options.map(option => ({ term: paint("cyan", helper.optionTerm(option)), description: helper.optionDescription(option) }))), "");
  }

  const lines = exampleLines.get(command);
  if (lines?.length) {
    blocks.push(title("Try"), ...lines.map(line => `  ${styleExample(line, paint)}`), "");
  }

  // Root options apply after any subcommand too; a subcommand page names them once, without repeating the table.
  const root = rootOf(command);
  const globals = command.parent ? helper.visibleOptions(root).filter(option => option.long !== "--help" && option.long !== "--version") : [];
  if (globals.length) {
    blocks.push(title("Global options"), ...wrapItems(globals.map(longFlag), width - 2).map(line => `  ${paint("dim", line)}`), "");
  }

  if (commands.length) blocks.push(paint("dim", `Run '${commandPath(command)} <command> --help' for details on a command.`), "");

  return `${blocks.join("\n").trimEnd()}\n`;
}

// "-o, --output <file>" reads as "--output <file>": the long flag with its own placeholder.
function longFlag(option: Option): string {
  return option.flags.split(/,\s*/u).find(part => part.startsWith("--")) ?? option.flags;
}

// Wrap flag by flag, so "--limit <number>" never splits across lines the way word wrapping would.
function wrapItems(items: readonly string[], width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const joined = line ? `${line}, ${item}` : item;
    if (line && joined.length > width) {
      lines.push(`${line},`);
      line = item;
    } else {
      line = joined;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rootOf(command: Command): Command {
  let current = command;
  while (current.parent) current = current.parent;
  return current;
}

const EXTRAS = /( \((?:choices|default|env|preset):[^]*\))$/u;

/** A one-sentence description reads as a man page does, without its full stop; prose keeps it. */
function tidy(description: string): string {
  const match = EXTRAS.exec(description);
  const body = match ? description.slice(0, match.index) : description;
  const single = !/[.!?]\s+\S/u.test(body);
  return `${single ? body.replace(/\.$/u, "") : body}${match ? match[1] : ""}`;
}

function commandPath(command: Command): string {
  const names: string[] = [];
  for (let current: Command | null = command; current; current = current.parent) names.unshift(current.name());
  return names.join(" ");
}

function subcommandTerm(command: Command, paint: Paint): string {
  const aliases = command.aliases().length ? paint("dim", `, ${command.aliases().join(", ")}`) : "";
  const args = command.registeredArguments.map(argument => ` ${paint("dim", argumentTerm(argument))}`).join("");
  return `${paint("bold", command.name())}${aliases}${args}`;
}

function argumentTerm(argument: Argument): string {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;
  return argument.required ? `<${name}>` : `[${name}]`;
}

function styleUsage(usage: string, paint: Paint): string {
  // "moodle activities list [options] <unit>": the command words in bold, the rest dimmed.
  const words = usage.split(" ");
  const first = words.findIndex(word => word.startsWith("[") || word.startsWith("<"));
  const names = first === -1 ? words : words.slice(0, first);
  const rest = first === -1 ? [] : words.slice(first);
  return [paint("bold", names.join(" ")), ...rest.map(word => paint("dim", word))].join(" ");
}

function styleExample(line: string, paint: Paint): string {
  const comment = line.indexOf("  # ");
  if (comment === -1) return line;
  return `${line.slice(0, comment)}  ${paint("dim", line.slice(comment + 2))}`;
}
