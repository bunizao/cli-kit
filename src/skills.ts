import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { stringify } from "yaml";

import { EXIT_CODES } from "./errors.js";
import type { Intent } from "./intents.js";
import type { CommandDescription, ProgramDescription } from "./program.js";

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
export type McpServer =
  | { readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>> }
  | { readonly type: "http"; readonly url: string; readonly headers?: Readonly<Record<string, string>> };

export interface AgentFilesOptions {
  readonly skill: SkillOptions;
  readonly version: string;
  /** The GitHub repository URL; it is also the plugin's homepage. */
  readonly repository: string;
  readonly author: { readonly name: string; readonly url?: string };
  readonly license?: string;
  readonly keywords?: readonly string[];
  /** MCP servers the Claude Code plugin starts, keyed by server name. */
  readonly mcpServers?: Readonly<Record<string, McpServer>>;
  /** Codex skill metadata, written to agents/openai.yaml. */
  readonly openai?: { readonly displayName: string; readonly shortDescription: string; readonly defaultPrompt: string };
}

/** Where agentFiles puts the full command tree; SKILL.md links to it so the skill stays small. */
export const COMMAND_REFERENCE = "references/commands.md";

const READ_RULE = "`read` prints Markdown and never changes anything upstream.";
const SHARED_RULES = [
  "Run the narrowest command or tool that answers the request; one call per intent.",
  "Piped output is JSON and a terminal gets a table. `--fields a,b` keeps only the listed top-level fields.",
  "Run a mutating command only when the user asked for it. It needs a confirmation or `--yes`; `--dry-run` prints the plan first.",
  "Never print, log or store tokens, cookies or session files.",
];

/**
 * SKILL.md for one CLI: what people say, what to run, the rules and the setup. An agent loads
 * it whole, so the command tree lives in COMMAND_REFERENCE and each MCP tool's full description
 * stays with the server.
 */
export function renderSkill(options: SkillOptions): string {
  const binary = options.program.name;
  const commandIntents = options.intents.filter((intent) => intent.command);
  const toolIntents = options.intents.filter((intent) => intent.tool);
  const hasRead = options.program.commands.some(function reads(command): boolean {
    return command.verb === "read" || command.commands.some(reads);
  });
  const exitCodes = Object.entries(EXIT_CODES)
    .map(([code, exit]) => `${exit} ${code}`)
    .join(", ");

  return [
    stringifyFrontmatter({ name: options.name, description: options.description }),
    `# ${options.title}`,
    options.intro,
    "## What the user says, and what to run",
    markdownTable(
      ["The user says", "Run", "Then"],
      commandIntents.map((intent) => [intent.when, `\`${intent.command}\``, intent.then ?? ""]),
    ),
    toolIntents.length
      ? ["## MCP tools", markdownTable(["The user says", "Tool"], toolIntents.map((intent) => [intent.when, `\`${intent.tool}\``]))].join("\n\n")
      : undefined,
    "## Rules",
    [
      SHARED_RULES[0],
      SHARED_RULES[1],
      ...(hasRead ? [READ_RULE] : []),
      ...SHARED_RULES.slice(2),
      ...(options.rules ?? []),
      `Every command, argument and option is in [${COMMAND_REFERENCE}](${COMMAND_REFERENCE}); \`${binary} commands --json\` is the source of truth.`,
    ]
      .map((rule) => `- ${rule}`)
      .join("\n"),
    options.setup ? `## Setup\n\n${options.setup}` : undefined,
    "## Errors",
    `Errors are printed once on stderr. Exit codes: 0 success, ${exitCodes}.`,
  ].filter((section): section is string => Boolean(section)).join("\n\n") + "\n";
}

/** The full command tree as a Markdown table, written to COMMAND_REFERENCE. */
export function renderCommandReference(program: ProgramDescription): string {
  return [
    `# ${program.name} commands`,
    `Generated from \`${program.name} commands --json\` for version ${program.version}.`,
    markdownTable(
      ["Command", "Description", "Arguments", "Options", "Mutating"],
      program.commands.flatMap((command) => commandRows(program.name, command)),
    ),
  ].join("\n\n") + "\n";
}

/**
 * Every agent packaging file for one CLI repository, keyed by path from the repository root:
 * SKILL.md for `npx skills add` with its command reference, the Claude Code plugin and its single-plugin marketplace, and
 * agents/openai.yaml when Codex metadata is given.
 */
export function agentFiles(options: AgentFilesOptions): Record<string, string> {
  const { skill } = options;
  const files: Record<string, string> = {
    "SKILL.md": renderSkill(skill),
    [COMMAND_REFERENCE]: renderCommandReference(skill.program),
    ".claude-plugin/plugin.json": json({
      name: skill.name,
      version: options.version,
      description: skill.description,
      author: options.author,
      homepage: options.repository,
      repository: options.repository,
      ...(options.license ? { license: options.license } : {}),
      ...(options.keywords?.length ? { keywords: options.keywords } : {}),
      // The repository root is the plugin root, and its SKILL.md is the plugin's one skill.
      skills: "./",
      ...(options.mcpServers ? { mcpServers: options.mcpServers } : {}),
    }),
    ".claude-plugin/marketplace.json": json({
      name: skill.name,
      description: skill.description,
      owner: options.author,
      plugins: [{ name: skill.name, source: "./", description: skill.description }],
    }),
  };
  if (options.openai) {
    files["agents/openai.yaml"] = stringify(
      {
        interface: {
          display_name: options.openai.displayName,
          short_description: options.openai.shortDescription,
          default_prompt: options.openai.defaultPrompt,
        },
      },
      { lineWidth: 0 },
    );
  }
  return files;
}

/**
 * Write generated files under root. With `check`, write nothing and return the paths whose
 * content differs, so CI can fail on a stale commit.
 */
export function writeAgentFiles(root: string, files: Readonly<Record<string, string>>, options: { check?: boolean } = {}): string[] {
  const stale = Object.entries(files)
    .filter(([path, content]) => readOrEmpty(join(root, path)) !== content)
    .map(([path]) => path);
  if (options.check) return stale;
  for (const path of stale) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), files[path] as string, "utf8");
  }
  return stale;
}

function commandRows(binary: string, command: CommandDescription, parents: readonly string[] = []): string[][] {
  const path = [...parents, command.name];
  const row = [
    `\`${[binary, ...path].join(" ")}\``,
    command.description,
    command.positionals.map((argument) => {
      const name = argument.variadic ? `${argument.name}...` : argument.name;
      return argument.required ? `<${name}>` : `[${name}]`;
    }).join(" "),
    command.options.map((option) => option.flags).join("<br>"),
    command.mutating ? "yes" : "no",
  ];
  return [row, ...command.commands.flatMap((child) => commandRows(binary, child, path))];
}

function stringifyFrontmatter(fields: Readonly<Record<string, string>>): string {
  return `---\n${stringify(fields, { lineWidth: 0 })}---`;
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
