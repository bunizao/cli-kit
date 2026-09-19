import type { Command, Help } from "commander";
/**
 * List a subcommand under `title` in its parent's help instead of the one flat list.
 * Sections appear in the order they were first named, so the caller decides that
 * "Reading" precedes "Setup" however the commands were registered.
 */
export declare function helpSection(command: Command, title: string): Command;
/** Invocations shown under "Examples" in the command's help; text after `  # ` renders as a comment. */
export declare function examples(command: Command, lines: readonly string[]): Command;
/**
 * The help layout every CLI in the family shares: name and version, a usage line, the
 * commands grouped by section, then options and examples. Colour follows the output
 * stream, so a pipe and an agent get the same text without escape codes.
 */
export declare function styledHelp(): Partial<Help>;
