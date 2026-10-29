import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { EXIT_CODES } from "./errors.js";
import { toolDescription } from "./intents.js";
const SHARED_RULES = [
    "Run the narrowest command or tool that answers the request; one call per intent.",
    "Piped output is JSON and a terminal gets a table. `--fields a,b` keeps only the listed top-level fields.",
    "`read` prints Markdown and never changes anything upstream.",
    "Run a mutating command only when the user asked for it. It needs a confirmation or `--yes`; `--dry-run` prints the plan first.",
    "Never print, log or store tokens, cookies or session files.",
];
/** SKILL.md for one CLI: what people say, what to run, the rules, and the full command tree. */
export function renderSkill(options) {
    const binary = options.program.name;
    const commandIntents = options.intents.filter((intent) => intent.command);
    const toolIntents = options.intents.filter((intent) => intent.tool);
    const exitCodes = Object.entries(EXIT_CODES)
        .map(([code, exit]) => `${exit} ${code}`)
        .join(", ");
    return [
        stringifyFrontmatter({ name: options.name, description: options.description }),
        `# ${options.title}`,
        options.intro,
        "## What the user says, and what to run",
        markdownTable(["The user says", "Run", "Then"], commandIntents.map((intent) => [intent.when, `\`${intent.command}\``, intent.then ?? ""])),
        toolIntents.length
            ? ["## MCP tools", markdownTable(["Tool", "Description"], toolIntents.map((intent) => [`\`${intent.tool}\``, toolDescription(intent)]))].join("\n\n")
            : undefined,
        "## Rules",
        [...SHARED_RULES, ...(options.rules ?? []), `\`${binary} commands --json\` is the source of truth for the command tree.`]
            .map((rule) => `- ${rule}`)
            .join("\n"),
        options.setup ? `## Setup\n\n${options.setup}` : undefined,
        "## Commands",
        markdownTable(["Command", "Description", "Arguments", "Options", "Mutating"], options.program.commands.flatMap((command) => commandRows(binary, command))),
        "## Errors",
        `Errors are printed once on stderr. Exit codes: 0 success, ${exitCodes}.`,
    ].filter((section) => Boolean(section)).join("\n\n") + "\n";
}
/**
 * Every agent packaging file for one CLI repository, keyed by path from the repository root:
 * SKILL.md for `npx skills add`, the Claude Code plugin and its single-plugin marketplace, and
 * agents/openai.yaml when Codex metadata is given.
 */
export function agentFiles(options) {
    const { skill } = options;
    const files = {
        "SKILL.md": renderSkill(skill),
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
        files["agents/openai.yaml"] = stringify({
            interface: {
                display_name: options.openai.displayName,
                short_description: options.openai.shortDescription,
                default_prompt: options.openai.defaultPrompt,
            },
        });
    }
    return files;
}
/**
 * Write generated files under root. With `check`, write nothing and return the paths whose
 * content differs, so CI can fail on a stale commit.
 */
export function writeAgentFiles(root, files, options = {}) {
    const stale = Object.entries(files)
        .filter(([path, content]) => readOrEmpty(join(root, path)) !== content)
        .map(([path]) => path);
    if (options.check)
        return stale;
    for (const path of stale) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), files[path], "utf8");
    }
    return stale;
}
function commandRows(binary, command, parents = []) {
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
function stringifyFrontmatter(fields) {
    return `---\n${stringify(fields, { lineWidth: 0 })}---`;
}
function markdownTable(headers, rows) {
    return [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    ].join("\n");
}
function escapeCell(value) {
    return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
function json(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function readOrEmpty(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        return "";
    }
}
