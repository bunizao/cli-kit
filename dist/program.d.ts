import { Command } from "commander";
export declare const VERBS: readonly ["list", "show", "read", "get", "search", "send", "submit", "set", "mark-read"];
export interface CommandDescription {
    readonly name: string;
    readonly noun?: string;
    readonly verb?: string;
    readonly aliases: readonly string[];
    readonly description: string;
    readonly positionals: readonly PositionalDescription[];
    readonly options: readonly OptionDescription[];
    readonly mutating: boolean;
    readonly commands: readonly CommandDescription[];
}
export interface PositionalDescription {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
    readonly variadic: boolean;
    readonly enumValues?: readonly string[];
}
export interface OptionDescription {
    readonly flags: string;
    readonly description: string;
    readonly required: boolean;
    readonly variadic: boolean;
    readonly enumValues?: readonly string[];
}
export interface ProgramDescription {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly commands: readonly CommandDescription[];
}
export declare function createProgram(meta: {
    name: string;
    version: string;
    description: string;
}): Command;
export declare function mutating(command: Command): Command;
export declare function commandsJson(program: Command): ProgramDescription;
