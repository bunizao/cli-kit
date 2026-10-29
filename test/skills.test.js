import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { agentFiles, commandsJson, createProgram, mutating, renderSkill, writeAgentFiles } from "../dist/index.js";

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

test("renderSkill writes frontmatter, intents, tools, rules, commands and exit codes", () => {
  const skill = renderSkill(skillOptions());

  assert.match(skill, /^---\nname: demo-cli\ndescription: "Read demo courses: grades, tasks and files."\n---\n\n# Demo CLI\n\nCOURSE is a code or id.\n/);
  assert.match(skill, /\| my courses \| `demo courses` \| pass a code as COURSE \|/);
  assert.doesNotMatch(skill, /\| a widget \|/);
  assert.match(skill, /\| `show_widget` \| A widget\. Use when the user says "a widget"\. \|/);
  assert.match(skill, /- Ask before submitting\.\n- `demo commands --json` is the source of truth/);
  assert.match(skill, /\| `demo tasks submit` \| Submit a task\. \| <task> \| {2}\| yes \|/);
  assert.match(skill, /Exit codes: 0 success, 2 usage, 3 auth/);
  assert.ok(skill.endsWith("\n"));
});

test("agentFiles packages the skill as a Claude Code plugin, a marketplace and Codex metadata", () => {
  const files = agentFiles({
    skill: skillOptions(),
    version: "1.2.3",
    repository: "https://github.com/example/demo-cli",
    author: { name: "example" },
    license: "MIT",
    mcpServers: { demo: { command: "npx", args: ["-y", "demo-cli", "mcp"] } },
    openai: { displayName: "Demo CLI", shortDescription: "Read demo courses", defaultPrompt: "Use $demo-cli." },
  });

  assert.deepEqual(Object.keys(files), ["SKILL.md", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "agents/openai.yaml"]);
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
    "interface:\n  display_name: Demo CLI\n  short_description: Read demo courses\n  default_prompt: Use $demo-cli.\n",
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
