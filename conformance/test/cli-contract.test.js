import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const VERBS = new Set(["list", "show", "read", "get", "search", "send", "submit", "set", "mark-read"]);
const config = JSON.parse(await readFile(new URL("../cases.json", import.meta.url), "utf8"));
const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const binaryDirectory = process.env.CONFORMANCE_BIN_DIR ?? join(currentDirectory, "..", "node_modules", ".bin");
const required = process.env.CONFORMANCE_REQUIRED === "1";

for (const tool of config.tools) {
  const executable = join(binaryDirectory, tool.binary);
  const available = await exists(executable);

  test(`${tool.binary}: binary is installed`, { skip: available ? false : "published package is not installed" }, () => {
    assert.equal(available, true);
  });

  test(`${tool.binary}: usage, help, version, and command schema`, { skip: available ? false : "binary unavailable" }, () => {
    assert.equal(run(executable, ["bogus"]).status, 2);
    for (const args of [["--help"], ["-h"], ["-V"]]) {
      const result = run(executable, args);
      assert.equal(result.status, 0, `${tool.binary} ${args.join(" ")} failed: ${result.stderr}`);
      assert.equal(result.stderr, "");
      assert.notEqual(result.stdout, "");
    }

    const described = run(executable, ["commands", "--json"]);
    assert.equal(described.status, 0, described.stderr);
    const tree = JSON.parse(described.stdout);
    validateProgram(tree);
    const firstCommand = tree.commands[0]?.name;
    assert.equal(typeof firstCommand, "string");
    const commandHelp = run(executable, ["help", firstCommand]);
    assert.equal(commandHelp.status, 0, commandHelp.stderr);
    assert.equal(commandHelp.stderr, "");
  });

  const fixtureSkip = (name) => tool[name] || required ? false : `${name} fixture is not defined`;

  test(`${tool.binary}: expired authentication exits 3`, { skip: fixtureSkip("authFailure") }, () => {
    assert.ok(tool.authFailure, "authFailure must be added to cases.json before enabling the release gate");
    const result = run(executable, tool.authFailure.args, tool.authFailure.env);
    assert.equal(result.status, 3, result.stderr);
  });

  test(`${tool.binary}: mutation requires --yes`, { skip: fixtureSkip("mutation") }, () => {
    assert.ok(tool.mutation, "mutation must be added to cases.json before enabling the release gate");
    const result = run(executable, tool.mutation.args, tool.mutation.env);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--yes/);
  });

  test(`${tool.binary}: read uses only GET requests`, { skip: fixtureSkip("read") }, async () => {
    assert.ok(tool.read, "read must be added to cases.json before enabling the release gate");
    const requests = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      response.writeHead(tool.read.status ?? 200, { "content-type": "application/json" });
      response.end(JSON.stringify(tool.read.response ?? {}));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const result = await runAsync(executable, tool.read.args, {
        ...tool.read.env,
        [tool.read.baseUrlEnv]: baseUrl,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(requests.length > 0, "read fixture did not make an HTTP request");
      assert.ok(requests.every((request) => request.method === "GET"), JSON.stringify(requests));
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}

function run(executable, args, environment = {}) {
  return spawnSync(executable, args, {
    encoding: "utf8",
    env: { ...process.env, ...environment, PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ""}` },
  });
}

function runAsync(executable, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, ...environment, PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ""}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function validateProgram(program) {
  assert.equal(typeof program.name, "string");
  assert.equal(typeof program.version, "string");
  assert.ok(Array.isArray(program.commands));
  for (const command of flatten(program.commands)) {
    assert.equal(typeof command.name, "string");
    assert.equal(typeof command.mutating, "boolean");
    assert.ok(Array.isArray(command.aliases));
    assert.ok(Array.isArray(command.positionals));
    assert.ok(Array.isArray(command.options));
    assert.ok(Array.isArray(command.commands));
    if (command.verb !== undefined) assert.ok(VERBS.has(command.verb), `unsupported verb: ${command.verb}`);
  }
}

function* flatten(commands) {
  for (const command of commands) {
    yield command;
    yield* flatten(command.commands);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    if (required) assert.fail(`required binary is missing: ${path}`);
    return false;
  }
}
