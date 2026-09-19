import type { Command } from "commander";
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
/**
 * Parse argv with a freshly built program. When a person at a terminal left out trailing
 * positionals or a required option, ask for them and parse again with the answers appended,
 * so `moodle activities list` becomes a unit picker instead of a usage error. Anyone else
 * gets the usage error, with the command's usage line as the hint.
 */
export declare function parseWithPrompts(build: () => Command, argv: readonly string[], options: PromptParseOptions): Promise<void>;
