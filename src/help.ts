import type { Argument, Command, Help } from "commander";

import { painter, type Paint } from "./color.js";

const sections = new WeakMap<Command, string>();
const exampleLines = new WeakMap<Command, readonly string[]>();

/**
 * List a subcommand under `title` in its parent's help instead of the one flat list.
 * Sections appear in the order their first command was registered.
 */
export function helpSection(command: Command, title: string): Command {
  sections.set(command, title);
  return command;
}

/** Invocations shown under "Examples" in the command's help; text after `  # ` renders as a comment. */
export function examples(command: Command, lines: readonly string[]): Command {
  exampleLines.set(command, lines);
  return command;
}

interface HelpContext {
  readonly error?: boolean;
  readonly helpWidth?: number;
  readonly outputHasColors?: boolean;
}

type StyledHelper = Help & { hasColors?: boolean };

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
    },
    formatHelp(this: StyledHelper, command: Command, helper: Help) {
      return formatHelp(command, helper, painter(Boolean((helper as StyledHelper).hasColors)));
    },
  };
}

function formatHelp(command: Command, helper: Help, paint: Paint): string {
  const blocks: string[] = [];
  const title = (text: string) => paint("bold", text);
  const list = (items: readonly { term: string; description: string }[]) => {
    const width = Math.max(...items.map(item => helper.displayWidth(item.term)));
    return items.map(item => helper.formatItem(item.term, width, item.description, helper));
  };

  const version = command.parent ? undefined : command.version();
  blocks.push(`${paint("bold", commandPath(command))}${version ? ` ${paint("dim", `v${version}`)}` : ""}`);
  if (command.description()) blocks.push(helper.boxWrap(command.description(), helper.helpWidth ?? 80));
  blocks.push("");

  // Commander's own usage line repeats the aliases ("units|courses"); the path is enough.
  blocks.push(title("Usage"), `  ${styleUsage(`${commandPath(command)} ${command.usage()}`, paint)}`, "");

  const args = helper.visibleArguments(command);
  if (args.length) {
    blocks.push(title("Arguments"), ...list(args.map(argument => ({ term: paint("bold", helper.argumentTerm(argument)), description: helper.argumentDescription(argument) }))), "");
  }

  const commands = helper.visibleCommands(command);
  const grouped = commands.some(child => sections.has(child));
  const groups = new Map<string, Command[]>();
  for (const child of commands) {
    // Once commands are sectioned the implicit help command is noise; the footer covers it.
    if (grouped && child.name() === "help" && !child.parent) continue;
    const heading = sections.get(child) ?? "Commands";
    groups.set(heading, [...(groups.get(heading) ?? []), child]);
  }
  const rows = commands.map(child => ({ term: subcommandTerm(child, paint), description: helper.subcommandDescription(child) }));
  const width = rows.length ? Math.max(...rows.map(row => helper.displayWidth(row.term))) : 0;
  for (const [heading, children] of groups) {
    blocks.push(title(heading), ...children.map(child => helper.formatItem(subcommandTerm(child, paint), width, helper.subcommandDescription(child), helper)), "");
  }

  const options = helper.visibleOptions(command);
  if (options.length) {
    blocks.push(title("Options"), ...list(options.map(option => ({ term: paint("cyan", helper.optionTerm(option)), description: helper.optionDescription(option) }))), "");
  }

  const lines = exampleLines.get(command);
  if (lines?.length) {
    blocks.push(title("Examples"), ...lines.map(line => `  ${styleExample(line, paint)}`), "");
  }

  if (commands.length) blocks.push(paint("dim", `Run '${commandPath(command)} <command> --help' for details on a command.`), "");

  return `${blocks.join("\n").trimEnd()}\n`;
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
