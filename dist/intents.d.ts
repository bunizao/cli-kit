import type { Command } from "commander";
import { type NounSpec } from "./nouns.js";
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
export declare function toolDescription(intent: Intent): string;
/**
 * Throw when an intent's command no longer parses against the program: a renamed noun or verb,
 * a wrong binary name, or an option that was removed. Run it in the CLI's tests.
 */
export declare function checkIntentCommands(program: Command, nouns: readonly NounSpec[], intents: readonly Intent[]): void;
