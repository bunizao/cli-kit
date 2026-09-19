import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { isAgentEnvironment } from "./audience.js";
import { colorEnabled, painter } from "./color.js";
import { CliError } from "./errors.js";
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
    const common = { input, output, ...(options.signal ? { signal: options.signal } : {}) };
    const plain = (text) => output.write(`${text}\n`);
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
            output.write(`${lines.join("\n")}\n${tagline ? `${paint("dim", tagline)}\n` : ""}\n`);
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
                return {
                    start: message => inner.start(message),
                    message: message => inner.message(message),
                    stop: message => inner.stop(message),
                    error: message => inner.error(message),
                };
            }
            // A pipe is read after the fact: only the outcome of a step is worth a line.
            let running = "";
            return {
                start: message => { running = message; },
                message: message => { running = message; },
                stop: message => plain(message ?? running),
                error: message => plain(`error: ${message ?? running}`),
            };
        },
        async select(message, choices) {
            if (!choices.length)
                throw new CliError("unexpected", `Nothing to choose for "${message}".`);
            if (!interactive) {
                throw new CliError("usage", `${message} needs a terminal to choose from ${choices.length} options.`, choices.map(c => c.label).join(", "));
            }
            // `Option<T>` is conditional on T being primitive, which an open generic cannot resolve.
            const list = choices.map(c => ({ value: c.value, label: c.label, ...(c.hint ? { hint: c.hint } : {}) }));
            const picked = choices.length >= AUTOCOMPLETE_FROM
                ? await clack.autocomplete({ message, options: list, placeholder: "Type to filter", maxItems: AUTOCOMPLETE_FROM, ...common })
                : await clack.select({ message, options: list, ...common });
            return unwrap(picked);
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
/** Ctrl+C or Escape inside a prompt is the person's decision, reported with exit 130 like a signal. */
function unwrap(value) {
    if (clack.isCancel(value))
        throw new CliError("cancelled", "Cancelled.");
    return value;
}
