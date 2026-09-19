import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { AUTOCOMPLETE_FROM, CliError, confirm, createUi } from "../dist/index.js";

const DOWN = "[B";
const ENTER = "\r";
const CTRL_C = "";

function collect(stream) {
  let text = "";
  stream.on("data", (chunk) => { text += String(chunk); });
  return () => text;
}

// Clack reads keypresses from the input stream, so a prompt is driven by writing the
// keys a person would press, after the prompt has attached its listener.
function press(input, keys, delay = 0) {
  setTimeout(() => input.write(keys), delay);
}

test("plain path writes completed lines and never prompts", async () => {
  const output = new PassThrough();
  const read = collect(output);
  const ui = createUi({ input: new PassThrough(), output, interactive: false });

  ui.intro("demo");
  ui.step("checking");
  ui.warn("slow site");
  ui.note("line one\nline two", "Plan");
  const spin = ui.spinner();
  spin.start("uploading");
  spin.message("uploading 2 files");
  spin.stop();
  spin.start("deploying");
  spin.error("deploy failed");

  assert.equal(read(), "demo\nchecking\nwarning: slow site\nPlan\nline one\nline two\nuploading 2 files\nerror: deploy failed\n");
  assert.equal(ui.interactive, false);

  await assert.rejects(
    () => ui.select("Which unit?", [{ value: 1, label: "Algebra" }, { value: 2, label: "Biology" }]),
    (error) => error instanceof CliError && error.code === "usage" && error.hint === "Algebra, Biology",
  );
  await assert.rejects(() => ui.confirm("Continue?"), (error) => error instanceof CliError && error.code === "usage");
  await assert.rejects(() => ui.text("Site URL"), (error) => error instanceof CliError && error.code === "usage");
  assert.equal(await ui.text("Site URL", { initial: "https://example.edu" }), "https://example.edu");
});

test("detects the plain path from the streams", () => {
  assert.equal(createUi({ input: new PassThrough(), output: new PassThrough() }).interactive, false);
});

test("select returns the highlighted choice on enter", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const read = collect(output);
  const ui = createUi({ input, output, interactive: true });

  press(input, DOWN + ENTER);
  const picked = await ui.select("Which unit?", [{ value: "a", label: "Algebra", hint: "ALG-1" }, { value: "b", label: "Biology" }]);

  assert.equal(picked, "b");
  assert.match(read(), /Which unit\?/);
  assert.match(read(), /ALG-1/);
});

test("select filters by typing once the list is long", async () => {
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });
  const choices = Array.from({ length: AUTOCOMPLETE_FROM }, (_, i) => ({ value: i, label: i === 5 ? "Zoology" : `Unit ${i}` }));

  press(input, "Zoo");
  press(input, ENTER, 30);
  assert.equal(await ui.select("Which unit?", choices), 5);
});

test("cancelling a prompt is a cancelled error", async () => {
  const input = new PassThrough();
  const ui = createUi({ input, output: new PassThrough(), interactive: true });

  press(input, CTRL_C);
  await assert.rejects(() => ui.confirm("Continue?"), (error) => error instanceof CliError && error.code === "cancelled");
});

test("confirm keeps its non-interactive contract and asks at a terminal", async () => {
  const output = new PassThrough();
  const read = collect(output);
  assert.equal(await confirm({ summary: "remove 2 files" }, { yes: false, dryRun: true, interactive: true, output }), false);
  assert.equal(read(), "remove 2 files\n");
  assert.equal(await confirm({ summary: "x" }, { yes: true, dryRun: false, interactive: false }), true);
  await assert.rejects(
    () => confirm({ summary: "x" }, { yes: false, dryRun: false, interactive: false }),
    (error) => error instanceof CliError && error.code === "usage",
  );

  const input = new PassThrough();
  const asked = new PassThrough();
  const readAsked = collect(asked);
  press(input, "y");
  assert.equal(await confirm({ summary: "remove 2 files" }, { yes: false, dryRun: false, interactive: true, input, output: asked }), true);
  assert.match(readAsked(), /remove 2 files/);
  assert.match(readAsked(), /Continue\?/);
});
