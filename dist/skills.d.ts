import type { Intent } from "./intents.js";
import type { ProgramDescription } from "./program.js";
export interface SkillOptions {
    /** The skill and plugin name, e.g. "edstem-cli". */
    readonly name: string;
    /** When to use the skill; put the trigger first, hosts truncate long descriptions. */
    readonly description: string;
    readonly title: string;
    /** Markdown between the title and the intent table: the surfaces and the reference vocabulary. */
    readonly intro?: string;
    readonly intents: readonly Intent[];
    /** Rules for this CLI only; the shared contract rules are always included. */
    readonly rules?: readonly string[];
    /** Markdown for the Setup section. */
    readonly setup?: string;
    /** `commandsJson(program)` output. */
    readonly program: ProgramDescription;
}
/** A local stdio server, or a hosted Streamable HTTP server. */
export type McpServer = {
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
} | {
    readonly type: "http";
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
};
export interface AgentFilesOptions {
    readonly skill: SkillOptions;
    readonly version: string;
    /** The GitHub repository URL; it is also the plugin's homepage. */
    readonly repository: string;
    readonly author: {
        readonly name: string;
        readonly url?: string;
    };
    readonly license?: string;
    readonly keywords?: readonly string[];
    /** MCP servers the Claude Code plugin starts, keyed by server name. */
    readonly mcpServers?: Readonly<Record<string, McpServer>>;
    /** Codex skill metadata, written to agents/openai.yaml. */
    readonly openai?: {
        readonly displayName: string;
        readonly shortDescription: string;
        readonly defaultPrompt: string;
    };
}
/** Where agentFiles puts the full command tree; SKILL.md links to it so the skill stays small. */
export declare const COMMAND_REFERENCE = "references/commands.md";
/**
 * SKILL.md for one CLI: what people say, what to run, the rules and the setup. An agent loads
 * it whole, so the command tree lives in COMMAND_REFERENCE and each MCP tool's full description
 * stays with the server.
 */
export declare function renderSkill(options: SkillOptions): string;
/** The full command tree as a Markdown table, written to COMMAND_REFERENCE. */
export declare function renderCommandReference(program: ProgramDescription): string;
/**
 * Every agent packaging file for one CLI repository, keyed by path from the repository root:
 * SKILL.md for `npx skills add` with its command reference, the Claude Code plugin and its single-plugin marketplace, and
 * agents/openai.yaml when Codex metadata is given.
 */
export declare function agentFiles(options: AgentFilesOptions): Record<string, string>;
/**
 * Write generated files under root. With `check`, write nothing and return the paths whose
 * content differs, so CI can fail on a stale commit.
 */
export declare function writeAgentFiles(root: string, files: Readonly<Record<string, string>>, options?: {
    check?: boolean;
}): string[];
