import type { Intent } from "./intents.js";
import type { ProgramDescription } from "./program.js";
export interface SkillOptions {
    /** The skill and plugin name, e.g. "edstem-cli". */
    readonly name: string;
    /** What the skill does, in the third person. It is also the plugin's description. */
    readonly description: string;
    /**
     * When an agent should load the skill, rendered after the description as "Use when …". Name the
     * site and quote what people say; agents undertrigger, so list more phrases rather than fewer.
     */
    readonly useWhen: string;
    readonly title: string;
    /** Markdown between the title and the intent table: the surfaces and the reference vocabulary. */
    readonly intro?: string;
    readonly intents: readonly Intent[];
    /** The MCP server name tools are qualified with: "moodle" renders `moodle:due`. Required when an intent has a tool. */
    readonly mcpServer?: string;
    /** Multi-step tasks rendered as checklists, after the shared one for mutating commands. */
    readonly workflows?: readonly Workflow[];
    /** Rules for this CLI only; the shared contract rules are always included. */
    readonly rules?: readonly string[];
    /** Markdown for the Setup section. */
    readonly setup?: string;
    /** `commandsJson(program)` output. */
    readonly program: ProgramDescription;
}
export interface Workflow {
    /** An imperative title, e.g. "Submit an assignment". */
    readonly title: string;
    /** In order; end with a step that checks the result. */
    readonly steps: readonly string[];
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
    /** Codex skill metadata, written to agents/openai.yaml in the skill folder. */
    readonly openai?: {
        readonly displayName: string;
        readonly shortDescription: string;
        readonly defaultPrompt: string;
    };
    /** Hand-written reference pages by file name, written next to the command reference. */
    readonly references?: Readonly<Record<string, string>>;
}
/** Where agentFiles puts the full command tree, relative to the skill folder; SKILL.md links to it. */
export declare const COMMAND_REFERENCE = "references/commands.md";
/** The frontmatter description: what the skill does, then when to use it. */
export declare function skillDescription(options: Pick<SkillOptions, "description" | "useWhen">): string;
/**
 * SKILL.md for one CLI: what people say, what to run, the workflows, the rules and the setup.
 * An agent loads it whole, so the command tree lives in COMMAND_REFERENCE and each MCP tool's
 * full description stays with the server. Throws when the name or description breaks the
 * Agent Skills limits.
 */
export declare function renderSkill(options: SkillOptions): string;
/** The full command tree and the exit codes, written to COMMAND_REFERENCE. */
export declare function renderCommandReference(program: ProgramDescription): string;
/**
 * Every agent packaging file for one CLI repository, keyed by path from the repository root:
 * the skill folder skills/<name>/ (SKILL.md, its references and Codex's agents/openai.yaml), which
 * `npx skills add` and Claude Code both find, plus the Claude Code plugin and its single-plugin
 * marketplace.
 */
export declare function agentFiles(options: AgentFilesOptions): Record<string, string>;
/**
 * Write generated files under root. With `check`, write nothing and return the paths whose
 * content differs, so CI can fail on a stale commit.
 */
export declare function writeAgentFiles(root: string, files: Readonly<Record<string, string>>, options?: {
    check?: boolean;
}): string[];
