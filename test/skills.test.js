import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { COMMAND_REFERENCE, agentFiles, commandsJson, createProgram, mutating, renderCommandReference, renderSkill, writeAgentFiles } from "../dist/index.js";

function skillOptions() {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  program.command("courses").alias("units").command("list").description("List courses.");
  mutating(program.command("tasks").command("submit <task>").description("Submit a task."));
  return {
    name: "demo-cli",
    description: "Reads demo courses: grades, tasks and files",
    useWhen: 'the user names Demo or asks "what\'s due", "my grades"',
    title: "Demo CLI",
    intro: "COURSE is a code or id.",
    intents: [
      { when: "my courses", what: "Courses.", command: "demo courses", tool: "list_courses", then: "pass a code as COURSE" },
      { when: "a widget", what: "A widget.", tool: "show_widget" },
    ],
    mcpServer: "demo",
    workflows: [{ title: "Submit a task", steps: ["Find the task with `demo tasks list`", "Check it shows as submitted"] }],
    rules: ["Ask before submitting."],
    program: commandsJson(program),
  };
}

test("renderSkill writes a does-and-when description, one intent table, workflows and rules", () => {
  const skill = renderSkill(skillOptions());

  assert.ok(skill.startsWith([
    "---",
    "name: demo-cli",
    `description: "Reads demo courses: grades, tasks and files. Use when the user names Demo or asks \\"what's due\\", \\"my grades\\"."`,
    "---\n\n# Demo CLI\n\nCOURSE is a code or id.\n",
  ].join("\n")));
  // One row per request: the CLI and the qualified MCP tool side by side.
  assert.match(skill, /\| The user says \| CLI \| MCP tool \| Then \|\n\| --- \| --- \| --- \| --- \|\n\| my courses \| `demo courses` \| `demo:list_courses` \| pass a code as COURSE \|\n\| a widget \| {2}\| `demo:show_widget` \| {2}\|/);
  // The shared mutation workflow comes first, as a copyable checklist ending in a check.
  assert.match(skill, /### Change something upstream\n\n```text\n- \[ \] Check the user asked[^\n]*\n(?:- \[ \] [^\n]*\n)*- \[ \] Read the result back[^\n]*\n```\n\n### Submit a task\n\n```text\n- \[ \] Find the task with `demo tasks list`\n- \[ \] Check it shows as submitted\n```/);
  assert.match(skill, /- Change something upstream only when the user asked/);
  assert.match(skill, /- Ask before submitting\.\n- Every command, argument, option and exit code is in \[references\/commands\.md\]\(references\/commands\.md\); `demo commands --json` is the source of truth\.\n$/);
  assert.doesNotMatch(skill, /`demo tasks submit`|Exit codes|Use when the user says/);
});

test("renderSkill leaves out what the CLI cannot do", () => {
  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  program.command("tasks").command("read <task>");
  const skill = renderSkill({ ...skillOptions(), intents: [{ when: "a task", what: "A task.", command: "demo tasks read 1" }], workflows: [], program: commandsJson(program) });

  assert.match(skill, /\| The user says \| CLI \|\n/);
  assert.match(skill, /- `read` prints Markdown and changes nothing upstream/);
  assert.doesNotMatch(skill, /## Workflows|Change something upstream/);
  assert.doesNotMatch(renderSkill(skillOptions()), /`read` prints Markdown/);
});

test("renderSkill rejects frontmatter that breaks the Agent Skills limits", () => {
  const cases = [
    [{ name: "Demo_CLI" }, /name must be lowercase words joined by hyphens/],
    [{ name: "claude-demo" }, /must not contain "anthropic" or "claude"/],
    [{ useWhen: "x".repeat(1000) }, /description is \d+ characters; the limit is 1024/],
    [{ description: "Reads <demo> courses" }, /must not contain < or >/],
    [{ useWhen: "you ask about Demo" }, /third person outside quotes; found "you"/],
    [{ mcpServer: undefined }, /has MCP tools but no mcpServer/],
  ];
  for (const [override, message] of cases) assert.throws(() => renderSkill({ ...skillOptions(), ...override }), message);
});

test("renderCommandReference lists every command, its mutations and the exit codes", () => {
  const reference = renderCommandReference(skillOptions().program);

  assert.match(reference, /^# demo commands\n\nGenerated from `demo commands --json` for version 1\.2\.3\./);
  assert.match(reference, /\| `demo courses list` \| List courses\. \| {2}\| {2}\| no \|/);
  assert.match(reference, /\| `demo tasks submit` \| Submit a task\. \| <task> \| {2}\| yes \|/);
  assert.match(reference, /## Exit codes\n\n[^\n]*\n\n\| Exit \| Error code \|\n\| --- \| --- \|\n\| 0 \| success \|\n\| 2 \| usage \|\n\| 3 \| auth \|/);
});

test("agentFiles puts the skill in its own folder next to the Claude Code plugin and marketplace", () => {
  const files = agentFiles({
    skill: skillOptions(),
    version: "1.2.3",
    repository: "https://github.com/example/demo-cli",
    author: { name: "example" },
    license: "MIT",
    mcpServers: { demo: { command: "npx", args: ["-y", "demo-cli", "mcp"] } },
    openai: { displayName: "Demo CLI", shortDescription: "Read demo courses", defaultPrompt: `Use $demo-cli ${"to read courses ".repeat(6)}` },
    references: { "setup.md": "# Setup\n" },
  });

  assert.deepEqual(Object.keys(files), [
    "skills/demo-cli/SKILL.md",
    `skills/demo-cli/${COMMAND_REFERENCE}`,
    "skills/demo-cli/references/setup.md",
    "skills/demo-cli/agents/openai.yaml",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
  ]);
  assert.equal(files["skills/demo-cli/references/setup.md"], "# Setup\n");
  // No skills field: Claude Code loads skills/ from the plugin root by default.
  assert.deepEqual(JSON.parse(files[".claude-plugin/plugin.json"]), {
    name: "demo-cli",
    version: "1.2.3",
    description: "Reads demo courses: grades, tasks and files",
    author: { name: "example" },
    homepage: "https://github.com/example/demo-cli",
    repository: "https://github.com/example/demo-cli",
    license: "MIT",
    mcpServers: { demo: { command: "npx", args: ["-y", "demo-cli", "mcp"] } },
  });
  assert.deepEqual(JSON.parse(files[".claude-plugin/marketplace.json"]), {
    name: "demo-cli",
    description: "Reads demo courses: grades, tasks and files",
    owner: { name: "example" },
    plugins: [{ name: "demo-cli", source: "./", description: "Reads demo courses: grades, tasks and files" }],
  });
  assert.equal(
    files["skills/demo-cli/agents/openai.yaml"],
    // One line per field, however long the prompt.
    `interface:\n  display_name: Demo CLI\n  short_description: Read demo courses\n  default_prompt: "Use $demo-cli ${"to read courses ".repeat(6)}"\n`,
  );
});

test("writeAgentFiles writes stale files and reports them without writing under check", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-kit-skills-"));
  try {
    const files = { "SKILL.md": "one\n", ".claude-plugin/plugin.json": "{}\n" };
    assert.deepEqual(writeAgentFiles(root, files, { check: true }), ["SKILL.md", ".claude-plugin/plugin.json"]);
    assert.deepEqual(writeAgentFiles(root, files), ["SKILL.md", ".claude-plugin/plugin.json"]);
    assert.equal(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"), "{}\n");
    assert.deepEqual(writeAgentFiles(root, files, { check: true }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
