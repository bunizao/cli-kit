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
    description: "Read demo courses: grades, tasks and files.",
    title: "Demo CLI",
    intro: "COURSE is a code or id.",
    intents: [
      { when: "my courses", what: "Courses.", command: "demo courses", tool: "list_courses", then: "pass a code as COURSE" },
      { when: "a widget", what: "A widget.", tool: "show_widget" },
    ],
    rules: ["Ask before submitting."],
    program: commandsJson(program),
  };
}

test("renderSkill writes frontmatter, intents, tools, rules and exit codes, and links the command tree", () => {
  const skill = renderSkill(skillOptions());

  assert.match(skill, /^---\nname: demo-cli\ndescription: "Read demo courses: grades, tasks and files."\n---\n\n# Demo CLI\n\nCOURSE is a code or id.\n/);
  assert.match(skill, /\| my courses \| `demo courses` \| pass a code as COURSE \|/);
  // MCP tools are listed by when to use them; the full description stays with the server.
  assert.match(skill, /## MCP tools\n\n\| The user says \| Tool \|\n\| --- \| --- \|\n\| my courses \| `list_courses` \|\n\| a widget \| `show_widget` \|/);
  assert.doesNotMatch(skill, /Use when the user says/);
  assert.match(skill, /- Ask before submitting\.\n- Every command, argument and option is in \[references\/commands\.md\]\(references\/commands\.md\); `demo commands --json` is the source of truth\./);
  assert.doesNotMatch(skill, /`demo tasks submit`/);
  assert.match(skill, /Exit codes: 0 success, 2 usage, 3 auth/);
  assert.ok(skill.endsWith("\n"));
});

test("renderSkill states the read rule only for a CLI with a read verb", () => {
  assert.doesNotMatch(renderSkill(skillOptions()), /`read` prints Markdown/);

  const program = createProgram({ name: "demo", version: "1.2.3", description: "Demo CLI" });
  program.command("tasks").command("read <task>");
  assert.match(renderSkill({ ...skillOptions(), program: commandsJson(program) }), /- `read` prints Markdown and never changes anything upstream\./);
});

test("renderCommandReference lists every command with its arguments, options and mutations", () => {
  const reference = renderCommandReference(skillOptions().program);

  assert.match(reference, /^# demo commands\n\nGenerated from `demo commands --json` for version 1\.2\.3\./);
  assert.match(reference, /\| `demo courses list` \| List courses\. \| {2}\| {2}\| no \|/);
  assert.match(reference, /\| `demo tasks submit` \| Submit a task\. \| <task> \| {2}\| yes \|/);
});

test("agentFiles packages the skill as a Claude Code plugin, a marketplace and Codex metadata", () => {
  const files = agentFiles({
    skill: skillOptions(),
    version: "1.2.3",
    repository: "https://github.com/example/demo-cli",
    author: { name: "example" },
    license: "MIT",
    mcpServers: { demo: { command: "npx", args: ["-y", "demo-cli", "mcp"] } },
    openai: { displayName: "Demo CLI", shortDescription: "Read demo courses", defaultPrompt: `Use $demo-cli ${"to read courses ".repeat(6)}` },
  });

  assert.deepEqual(Object.keys(files), ["SKILL.md", COMMAND_REFERENCE, ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "agents/openai.yaml"]);
  assert.deepEqual(JSON.parse(files[".claude-plugin/plugin.json"]), {
    name: "demo-cli",
    version: "1.2.3",
    description: "Read demo courses: grades, tasks and files.",
    author: { name: "example" },
    homepage: "https://github.com/example/demo-cli",
    repository: "https://github.com/example/demo-cli",
    license: "MIT",
    skills: "./",
    mcpServers: { demo: { command: "npx", args: ["-y", "demo-cli", "mcp"] } },
  });
  assert.deepEqual(JSON.parse(files[".claude-plugin/marketplace.json"]), {
    name: "demo-cli",
    description: "Read demo courses: grades, tasks and files.",
    owner: { name: "example" },
    plugins: [{ name: "demo-cli", source: "./", description: "Read demo courses: grades, tasks and files." }],
  });
  assert.equal(
    files["agents/openai.yaml"],
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
