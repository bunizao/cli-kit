import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { isAgentEnvironment } from "./audience.js";
import { colorEnabled, painter } from "./color.js";
import { CliError } from "./errors.js";
/** What `select` resolves when the person presses Escape on a prompt opened with `back: true`. */
export const BACK = Symbol("cli-kit.back");
export const AUTOCOMPLETE_FROM = 8;
/**
 * Every CLI in the family draws the same way: prompts, steps and spinners on stderr
 * in the clack style when a person is at the keyboard; plain completed lines when the
 * output is a pipe; and never a prompt without a terminal, because a hung agent is
 * worse than an error that says what to pass.
 */
export function createUi(options = {}) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stderr;
    const interactive = options.interactive
        ?? (Boolean(input.isTTY) && Boolean(output.isTTY) && !isAgentEnvironment(options.env));
    // Escape erases the abandoned step and the answer above it, so going back looks like
    // the earlier question was never answered. That needs to know how many rows each prompt
    // drew; clack redraws with relative moves, so counting newlines and cursor-up/down
    // sequences written through the ui gives it.
    let row = 0;
    const answered = [];
    const drawn = interactive ? trackRows(output, delta => { row += delta; }) : output;
    const common = { input, output: drawn, ...(options.signal ? { signal: options.signal } : {}) };
    const plain = (text) => drawn.write(`${text}\n`);
    const paint = painter(colorEnabled(output, options.env));
    return {
        interactive,
        banner(art, tagline) {
            if (!interactive) {
                if (tagline)
                    plain(tagline);
                return;
            }
            const lines = art.replace(/^\n+|\s+$/gu, "").split("\n").map(line => paint("cyan", line));
            drawn.write(`${lines.join("\n")}\n${tagline ? `${paint("dim", tagline)}\n` : ""}\n`);
        },
        intro: title => (interactive ? clack.intro(title, common) : plain(title)),
        outro: message => (interactive ? clack.outro(message, common) : plain(message)),
        step: message => (interactive ? clack.log.step(message, common) : plain(message)),
        info: message => (interactive ? clack.log.info(message, common) : plain(message)),
        warn: message => (interactive ? clack.log.warn(message, common) : plain(`warning: ${message}`)),
        note: (message, title) => (interactive ? clack.note(message, title, common) : plain(title ? `${title}\n${message}` : message)),
        spinner() {
            if (interactive) {
                const inner = clack.spinner(common);
                // Clack's spinner holds stdin in raw mode and answers Ctrl+C with process.exit(0),
                // which skips the caller's cleanup and leaves half-written files behind. Handing
                // the key back to the terminal makes it a real SIGINT: the spinner erases itself,
                // the CLI's own handler runs, and a CLI without one still dies as Ctrl+C always has.
                const onInterrupt = () => {
                    process.off("SIGINT", onInterrupt);
                    inner.clear();
                    if (!process.listenerCount("SIGINT"))
                        process.kill(process.pid, "SIGINT");
                };
                const end = (finish) => {
                    process.off("SIGINT", onInterrupt);
                    finish();
                };
                return {
                    start: message => {
                        inner.start(message);
                        if (process.stdin.isTTY)
                            process.stdin.setRawMode(false);
                        process.prependListener("SIGINT", onInterrupt);
                    },
                    message: message => inner.message(message),
                    stop: message => end(() => inner.stop(message)),
                    error: message => end(() => inner.error(message)),
                    clear: () => end(() => inner.clear()),
                };
            }
            // A pipe is read after the fact: only the outcome of a step is worth a line.
            let running = "";
            return {
                start: message => { running = message; },
                message: message => { running = message; },
                stop: message => plain(message ?? running),
                error: message => plain(`error: ${message ?? running}`),
                clear: () => { running = ""; },
            };
        },
        async select(message, choices, selectOptions = {}) {
            if (!choices.length)
                throw new CliError("unexpected", `Nothing to choose for "${message}".`);
            if (!interactive) {
                throw new CliError("usage", `${message} needs a terminal to choose from ${choices.length} options.`, choices.map(c => c.label).join(", "));
            }
            // `Option<T>` is conditional on T being primitive, which an open generic cannot resolve.
            const list = choices.map(c => ({ value: c.value, label: c.label, ...(c.hint ? { hint: c.hint } : {}) }));
            const initial = selectOptions.initial !== undefined ? { initialValue: selectOptions.initial } : {};
            // Clack reports Escape and Ctrl+C as the same cancel, so the key itself tells them apart.
            let escaped = false;
            const onKey = (_, key) => { escaped = key?.name === "escape"; };
            if (selectOptions.back)
                input.on("keypress", onKey);
            const start = row;
            let picked;
            try {
                picked = selectOptions.search || choices.length >= AUTOCOMPLETE_FROM
                    ? await clack.autocomplete({ message, options: list, placeholder: "Type to filter", maxItems: AUTOCOMPLETE_FROM, filter: matchesWords, ...initial, ...common })
                    : await clack.select({ message, options: list, ...initial, ...common });
            }
            finally {
                input.off("keypress", onKey);
            }
            if (selectOptions.back && escaped && clack.isCancel(picked)) {
                // The answer above is erased too only when nothing was drawn between it and this step.
                const previous = answered.at(-1)?.end === start ? answered.pop() : undefined;
                const up = row - (previous?.start ?? start);
                if (up > 0)
                    drawn.write(`\u001b[${up}A\r\u001b[J`);
                return BACK;
            }
            const value = unwrap(picked);
            answered.push({ start, end: row });
            return value;
        },
        async confirm(message, confirmOptions = {}) {
            if (!interactive)
                throw new CliError("usage", `${message} needs a terminal to answer; pass --yes to confirm non-interactively.`);
            return unwrap(await clack.confirm({ message, initialValue: confirmOptions.initial ?? false, ...common }));
        },
        async text(message, textOptions = {}) {
            if (!interactive) {
                if (textOptions.initial !== undefined)
                    return textOptions.initial;
                throw new CliError("usage", `${message} needs a terminal to answer.`);
            }
            const answer = await clack.text({
                message,
                ...(textOptions.placeholder !== undefined ? { placeholder: textOptions.placeholder } : {}),
                ...(textOptions.initial !== undefined ? { defaultValue: textOptions.initial, initialValue: textOptions.initial } : {}),
                ...(textOptions.validate ? { validate: (value) => textOptions.validate?.(value ?? "") } : {}),
                ...common,
            });
            return unwrap(answer);
        },
        async password(message) {
            if (!interactive)
                throw new CliError("usage", `${message} needs a terminal to enter a secret.`);
            return unwrap(await clack.password({ message, ...common }));
        },
        async editor(message, editorOptions = {}) {
            if (!interactive)
                throw new CliError("usage", `${message} needs a terminal to open an editor.`);
            const env = options.env ?? process.env;
            const command = options.editor ?? env.VISUAL ?? env.EDITOR ?? (process.platform === "win32" ? "notepad" : "vi");
            const dir = mkdtempSync(join(tmpdir(), "cli-kit-"));
            const file = join(dir, `message${editorOptions.extension ?? ".md"}`);
            try {
                writeFileSync(file, editorOptions.initial ?? "", "utf8");
                clack.log.step(`${message}: opening ${command}, save and close to continue.`, common);
                // The editor owns the terminal until it exits; a shell lets "code --wait" style values work.
                const result = spawnSync(`${command} "${file}"`, { stdio: "inherit", shell: true });
                if (result.status !== 0)
                    throw new CliError("cancelled", `${command} exited with status ${result.status ?? "unknown"}.`);
                return readFileSync(file, "utf8");
            }
            finally {
                rmSync(dir, { recursive: true, force: true });
            }
        },
    };
}
// "2086 week 5" should find "FIT2086 · Week 5": each typed word on its own, anywhere in
// the label or hint. A number starts a run of digits, so "5" finds "Week 5" and "2086"
// finds "FIT2086", but "5" does not find "Week 15".
function matchesWords(search, option) {
    const text = `${option.label ?? ""} ${option.hint ?? ""}`.toLowerCase();
    return search.toLowerCase().split(/\s+/u).filter(Boolean).every(word => /^\d+$/u.test(word)
        ? new RegExp(`(?<!\\d)${word}`, "u").test(text)
        : text.includes(word));
}
// Everything else about the stream (columns, isTTY, resize events) is the real one.
function trackRows(output, moved) {
    const write = (chunk, ...rest) => {
        for (const match of String(chunk).matchAll(/\u001b\[(\d*)([AB])|\n/gu)) {
            moved(match[0] === "\n" ? 1 : (match[2] === "A" ? -1 : 1) * Number(match[1] || 1));
        }
        return output.write(chunk, ...rest);
    };
    return new Proxy(output, {
        get(target, property) {
            if (property === "write")
                return write;
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
/** Ctrl+C or Escape inside a prompt is the person's decision, reported with exit 130 like a signal. */
function unwrap(value) {
    if (clack.isCancel(value))
        throw new CliError("cancelled", "Cancelled.");
    return value;
}
