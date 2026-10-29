#!/usr/bin/env node
// Trigger eval for sibling skills on Codex: for each query, which skill's SKILL.md does Codex
// open first? All skills compete at once, because a skill that steals its sibling's requests
// looks like the sibling undertriggering when each is tested alone.
//
//   node evals/trigger.mjs --skill ../moodle-cli/skills/moodle-cli --skill ../ontrack-cli/skills/ontrack-cli \
//     --skill ../edstem-cli/skills/edstem-cli [--pool evals/trigger-pool.json] [--model <codex model>] [--runs 3]
//
// Codex is killed as soon as it starts its first command, and each skill's binary is a stub
// first on PATH, so a run reads at most one file and changes nothing.
import { spawn } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/** Per query, the most-picked skill against the expected one; per skill, skill-creator's binary view. */
export function score(results, skills) {
  const byQuery = new Map();
  for (const result of results) {
    const entry = byQuery.get(result.query) ?? { query: result.query, expected: result.expected, picks: {} };
    entry.picks[result.picked] = (entry.picks[result.picked] ?? 0) + 1;
    byQuery.set(result.query, entry);
  }
  const queries = [...byQuery.values()].map((entry) => {
    const [top] = Object.entries(entry.picks).sort((a, b) => b[1] - a[1])[0];
    // Opening an unrelated file, or nothing, is a correct "none".
    const ok = top === entry.expected || (entry.expected === "none" && !skills.includes(top));
    return { ...entry, top, ok };
  });
  const perSkill = Object.fromEntries(skills.map((skill) => {
    const counts = { shouldTrigger: [0, 0], shouldNot: [0, 0] };
    for (const entry of queries) {
      const runs = Object.values(entry.picks).reduce((sum, n) => sum + n, 0);
      const fired = (entry.picks[skill] ?? 0) / runs >= 0.5;
      const bucket = entry.expected === skill ? counts.shouldTrigger : counts.shouldNot;
      bucket[0] += entry.expected === skill ? Number(fired) : Number(!fired);
      bucket[1] += 1;
    }
    return [skill, counts];
  }));
  return { queries, perSkill, routed: queries.filter((entry) => entry.ok).length };
}

function runOnce({ query, workspace, home, stubs, model, timeoutMs, skills }) {
  const args = ["exec", "--json", "--skip-git-repo-check", "-s", "read-only",
    "-c", "notify=[]", "-c", "mcp_servers={}", "-c", "plugins={}", "-c", "features.memories=false", "-c", "features.apps=false",
    ...(model ? ["-m", model] : []), query];
  const child = spawn("codex", args, {
    cwd: workspace,
    // A throwaway HOME hides user-level skills; CODEX_HOME keeps the user's sign-in and provider.
    env: { ...process.env, HOME: home, CODEX_HOME: process.env.CODEX_HOME ?? join(homedir(), ".codex"), PATH: `${stubs}:${process.env.PATH}` },
    stdio: ["ignore", "pipe", "ignore"],
  });
  return new Promise((done) => {
    let settled = false;
    const finish = (picked, command = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      done({ picked, command: command.slice(0, 200) });
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    createInterface({ input: child.stdout }).on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "item.started" && event.item?.type === "command_execution") {
        const command = event.item.command ?? "";
        finish(skills.find((skill) => command.includes(`skills/${skill}/`)) ?? "other", command);
      } else if (event.type === "turn.completed") {
        finish("none");
      } else if (event.type === "turn.failed") {
        finish("error", event.error?.message ?? "");
      }
    });
    child.on("close", () => finish("none"));
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      skill: { type: "string", multiple: true },
      pool: { type: "string", default: fileURLToPath(new URL("trigger-pool.json", import.meta.url)) },
      model: { type: "string" },
      runs: { type: "string", default: "3" },
      workers: { type: "string", default: "6" },
      timeout: { type: "string", default: "120" },
      out: { type: "string", default: "trigger-results.json" },
    },
  });
  const skillDirs = (values.skill ?? []).map((dir) => resolve(dir));
  if (!skillDirs.length) throw new Error("Pass each competing skill folder with --skill.");
  const skills = skillDirs.map((dir) => basename(dir));
  const pool = JSON.parse(readFileSync(values.pool, "utf8"));

  const root = mkdtempSync(join(tmpdir(), "trigger-eval-"));
  const workspace = join(root, "ws");
  const home = join(root, "home");
  const stubs = join(root, "stubs");
  for (const [index, dir] of skillDirs.entries()) cpSync(dir, join(workspace, ".agents", "skills", skills[index]), { recursive: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(stubs, { recursive: true });
  for (const skill of skills) {
    const stub = join(stubs, skill.replace(/-cli$/, ""));
    writeFileSync(stub, "#!/bin/sh\necho 'stub: trigger eval' >&2\nexit 1\n");
    chmodSync(stub, 0o755);
  }

  const jobs = pool.flatMap((item) => Array.from({ length: Number(values.runs) }, () => item));
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const item = jobs[next++];
      const result = await runOnce({ query: item.query, workspace, home, stubs, model: values.model, timeoutMs: Number(values.timeout) * 1000, skills });
      results.push({ ...item, ...result });
      process.stderr.write(`\r${results.length}/${jobs.length}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Number(values.workers) }, worker));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);

  const { queries, perSkill, routed } = score(results, skills);
  process.stderr.write("\n");
  for (const entry of queries.filter((q) => !q.ok)) console.log(`MISS ${entry.expected.padEnd(12)} ${JSON.stringify(entry.picks)}  ${entry.query}`);
  console.log(`${routed}/${queries.length} queries routed to the expected skill (majority of runs)`);
  for (const [skill, { shouldTrigger, shouldNot }] of Object.entries(perSkill)) {
    console.log(`${skill}: should-trigger ${shouldTrigger[0]}/${shouldTrigger[1]}, should-not ${shouldNot[0]}/${shouldNot[1]}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
