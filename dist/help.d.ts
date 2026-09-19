import type { Command, Help } from "commander";
/**
 * List a subcommand under `title` in its parent's help instead of the one flat list.
 * Sections appear in the order they were first named and commands in the order they
 * were placed, so the caller decides what comes first however the tree was registered.
 */
export declare function helpSection(command: Command, title: string): Command;
/** A few invocations shown under "Try" in the command's help; text after `  # ` renders as a comment. */
export declare function examples(command: Command, lines: readonly string[]): Command;
/**
 * ASCII art shown above the root help page, but only to a person: a pipe and an agent
 * get the plain header, because art in a transcript is noise.
 */
export declare function banner(command: Command, art: string): Command;
/**
 * The help layout every CLI in the family shares: name and version, a usage line, the
 * commands grouped by section, then options and examples. Colour follows the output
 * stream, so a pipe and an agent get the same text without escape codes.
 */
export declare function styledHelp(): Partial<Help>;
