import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { EXIT_CODES } from "./errors.js";
/** Where agentFiles puts the full command tree, relative to the skill folder; SKILL.md links to it. */
export const COMMAND_REFERENCE = "references/commands.md";
const RULES = {
    narrow: "Start from the table row that matches the request: the narrowest command or tool answers sooner and costs fewer tokens than a broad listing.",
    output: "Piped output is JSON. `--fields a,b` keeps only those top-level fields, which keeps long lists cheap.",
    read: "`read` prints Markdown and changes nothing upstream, so it is safe to run unasked.",
    mutate: "Change something upstream only when the user asked for that change: other people see it, and most changes cannot be undone.",
    secrets: "Keep tokens, cookies and session files out of replies, logs and files; each one is a live sign-in.",
    errors: "A failure prints one error with a `hint` on stderr; follow the hint before retrying.",
};
const MUTATION_WORKFLOW = {
    title: "Change something upstream",
    steps: [
        "Check the user asked for this change, on these targets",
        "Run the command with `--dry-run` and show the plan",
        "Get the user's yes to that plan",
        "Run it again with `--yes`",
        "Read the result back with the matching `list` or `show` and report what changed",
    ],
};
/** The frontmatter description: what the skill does, then when to use it. */
export function skillDescription(options) {
    return `${sentence(options.description)} Use when ${sentence(options.useWhen)}`;
}
/**
 * SKILL.md for one CLI: what people say, what to run, the workflows, the rules and the setup.
 * An agent loads it whole, so the command tree lives in COMMAND_REFERENCE and each MCP tool's
 * full description stays with the server. Throws when the name or description breaks the
 * Agent Skills limits.
 */
export function renderSkill(options) {
    const description = skillDescription(options);
    const problems = frontmatterProblems(options.name, description);
    if (problems.length)
        throw new Error(`Skill "${options.name}" frontmatter:\n${problems.join("\n")}`);
    const binary = options.program.name;
    const hasRead = someCommand(options.program, (command) => command.verb === "read");
    const hasMutation = someCommand(options.program, (command) => command.mutating);
    const workflows = [...(hasMutation ? [MUTATION_WORKFLOW] : []), ...(options.workflows ?? [])];
    return [
        stringifyFrontmatter({ name: options.name, description }),
        `# ${options.title}`,
        options.intro,
        "## What the user says, and what to run",
        intentTable(options),
        workflows.length
            ? ["## Workflows", "Copy the checklist into your reply and tick each step as it is done; the last step is what shows the change landed.", ...workflows.map(renderWorkflow)].join("\n\n")
            : undefined,
        "## Rules",
        [
            RULES.narrow,
            RULES.output,
            ...(hasRead ? [RULES.read] : []),
            ...(hasMutation ? [RULES.mutate] : []),
            RULES.secrets,
            RULES.errors,
            ...(options.rules ?? []),
            `Every command, argument, option and exit code is in [${COMMAND_REFERENCE}](${COMMAND_REFERENCE}); \`${binary} commands --json\` is the source of truth.`,
        ]
            .map((rule) => `- ${rule}`)
            .join("\n"),
        options.setup ? `## Setup\n\n${options.setup}` : undefined,
    ].filter((section) => Boolean(section)).join("\n\n") + "\n";
}
/** The full command tree and the exit codes, written to COMMAND_REFERENCE. */
export function renderCommandReference(program) {
    const exitCodes = Object.entries(EXIT_CODES).map(([code, exit]) => [String(exit), code]);
    return [
        `# ${program.name} commands`,
        `Generated from \`${program.name} commands --json\` for version ${program.version}.`,
        markdownTable(["Command", "Description", "Arguments", "Options", "Mutating"], program.commands.flatMap((command) => commandRows(program.name, command))),
        "## Exit codes",
        "With `--json`, a failure is one `{ ok: false, error: { code, message, hint } }` object on stderr.",
        markdownTable(["Exit", "Error code"], [["0", "success"], ...exitCodes]),
    ].join("\n\n") + "\n";
}
/**
 * Every agent packaging file for one CLI repository, keyed by path from the repository root:
 * the skill folder skills/<name>/ (SKILL.md, its references and Codex's agents/openai.yaml), which
 * `npx skills add` and Claude Code both find, plus the Claude Code plugin and its single-plugin
 * marketplace.
 */
export function agentFiles(options) {
    const { skill } = options;
    const folder = `skills/${skill.name}`;
    const files = {
        [`${folder}/SKILL.md`]: renderSkill(skill),
        [`${folder}/${COMMAND_REFERENCE}`]: renderCommandReference(skill.program),
    };
    for (const [name, content] of Object.entries(options.references ?? {})) {
        files[`${folder}/${dirname(COMMAND_REFERENCE)}/${name}`] = content;
    }
    if (options.openai) {
        files[`${folder}/agents/openai.yaml`] = stringify({
            interface: {
                display_name: options.openai.displayName,
                short_description: options.openai.shortDescription,
                default_prompt: options.openai.defaultPrompt,
            },
        }, { lineWidth: 0 });
    }
    // The repository root is the plugin root; Claude Code loads skills/ from it by default.
    files[".claude-plugin/plugin.json"] = json({
        name: skill.name,
        version: options.version,
        description: skill.description,
        author: options.author,
        homepage: options.repository,
        repository: options.repository,
        ...(options.license ? { license: options.license } : {}),
        ...(options.keywords?.length ? { keywords: options.keywords } : {}),
        ...(options.mcpServers ? { mcpServers: options.mcpServers } : {}),
    });
    files[".claude-plugin/marketplace.json"] = json({
        name: skill.name,
        description: skill.description,
        owner: options.author,
        plugins: [{ name: skill.name, source: "./", description: skill.description }],
    });
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
// The limits from the Agent Skills spec, plus the third person: the description is read as
// part of the system prompt, where "I" and "you" point at the wrong speaker.
function frontmatterProblems(name, description) {
    const problems = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
        problems.push(`name must be lowercase words joined by hyphens, at most 64 characters`);
    if (/anthropic|claude/.test(name))
        problems.push(`name must not contain "anthropic" or "claude"`);
    if (description.length > 1024)
        problems.push(`description is ${description.length} characters; the limit is 1024`);
    if (/[<>]/.test(description))
        problems.push("description must not contain < or >");
    // Quoted phrases are what the user says, so "my grades" is fine there.
    const unquoted = description.replace(/"[^"]*"|“[^”]*”/g, "");
    const person = /\b(?:I|me|my|we|our|you|your)\b/i.exec(unquoted);
    if (person)
        problems.push(`description must be in the third person outside quotes; found "${person[0]}"`);
    return problems;
}
function intentTable(options) {
    const { intents, mcpServer } = options;
    if (!mcpServer && intents.some((intent) => intent.tool)) {
        throw new Error(`Skill "${options.name}" has MCP tools but no mcpServer to qualify them with.`);
    }
    const columns = [["The user says", (intent) => intent.when]];
    if (intents.some((intent) => intent.command))
        columns.push(["CLI", (intent) => (intent.command ? `\`${intent.command}\`` : "")]);
    if (intents.some((intent) => intent.tool))
        columns.push(["MCP tool", (intent) => (intent.tool ? `\`${mcpServer}:${intent.tool}\`` : "")]);
    if (intents.some((intent) => intent.then))
        columns.push(["Then", (intent) => intent.then ?? ""]);
    return markdownTable(columns.map(([header]) => header), intents.map((intent) => columns.map(([, cell]) => cell(intent))));
}
// A fenced block, so the agent copies it verbatim and ticks it in its reply.
function renderWorkflow(workflow) {
    return [`### ${workflow.title}`, ["```text", ...workflow.steps.map((step) => `- [ ] ${step}`), "```"].join("\n")].join("\n\n");
}
function someCommand(program, test) {
    return program.commands.some(function visit(command) {
        return test(command) || command.commands.some(visit);
    });
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
function sentence(text) {
    const trimmed = text.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
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
