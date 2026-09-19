import type { Writable } from "node:stream";

import * as clack from "@clack/prompts";

import { isAgentEnvironment } from "./audience.js";
import { CliError } from "./errors.js";

/**
 * One choice offered to `select`. `hint` renders dimmed next to the label, so it is
 * the place for the secondary fact a person needs to tell two similar rows apart
 * (a unit code, a due date), never for an id.
 */
export interface Choice<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

export interface UiOptions {
  /** Keyboard input. Defaults to `process.stdin`. */
  readonly input?: NodeJS.ReadStream;
  /** Where prompts and progress draw. Defaults to `process.stderr` so `--json` stdout stays clean. */
  readonly output?: Writable;
  /** Force the interactive or plain path instead of detecting it from the streams and environment. */
  readonly interactive?: boolean;
  /** Environment consulted for agent markers. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Aborting it cancels whichever prompt is open. */
  readonly signal?: AbortSignal;
}

export interface Spinner {
  start(message: string): void;
  /** Replace the running text without ending the step. */
  message(message: string): void;
  /** End the step and leave `message` (or the last running text) as the permanent line. */
  stop(message?: string): void;
  error(message?: string): void;
}

export interface Ui {
  readonly interactive: boolean;
  intro(title: string): void;
  outro(message: string): void;
  step(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  note(message: string, title?: string): void;
  spinner(): Spinner;
  /**
   * Let the person pick one row. Above `AUTOCOMPLETE_FROM` choices the list becomes
   * type-to-filter, because arrowing through thirty forum threads is not a picker.
   * Without a terminal this throws a usage error that lists the choices.
   */
  select<T>(message: string, choices: readonly Choice<T>[]): Promise<T>;
  /** Yes or no. Without a terminal this throws a usage error. */
  confirm(message: string, options?: { readonly initial?: boolean }): Promise<boolean>;
  /** One line of text. Without a terminal this returns `options.initial` or throws. */
  text(message: string, options?: { readonly placeholder?: string; readonly initial?: string; readonly validate?: (value: string) => string | undefined }): Promise<string>;
  /** One secret, echoed as dots. Without a terminal this throws; callers offer a stdin flag instead. */
  password(message: string): Promise<string>;
}

export const AUTOCOMPLETE_FROM = 8;

/**
 * Every CLI in the family draws the same way: prompts, steps and spinners on stderr
 * in the clack style when a person is at the keyboard; plain completed lines when the
 * output is a pipe; and never a prompt without a terminal, because a hung agent is
 * worse than an error that says what to pass.
 */
export function createUi(options: UiOptions = {}): Ui {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stderr;
  const interactive = options.interactive
    ?? (Boolean(input.isTTY) && Boolean((output as Writable & { isTTY?: boolean }).isTTY) && !isAgentEnvironment(options.env));
  const common = { input, output, ...(options.signal ? { signal: options.signal } : {}) };
  const plain = (text: string) => output.write(`${text}\n`);

  return {
    interactive,
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

    async select<T>(message: string, choices: readonly Choice<T>[]): Promise<T> {
      if (!choices.length) throw new CliError("unexpected", `Nothing to choose for "${message}".`);
      if (!interactive) {
        throw new CliError("usage", `${message} needs a terminal to choose from ${choices.length} options.`, choices.map(c => c.label).join(", "));
      }
      // `Option<T>` is conditional on T being primitive, which an open generic cannot resolve.
      const list = choices.map(c => ({ value: c.value, label: c.label, ...(c.hint ? { hint: c.hint } : {}) })) as unknown as clack.Option<T>[];
      const picked = choices.length >= AUTOCOMPLETE_FROM
        ? await clack.autocomplete<T>({ message, options: list, placeholder: "Type to filter", maxItems: AUTOCOMPLETE_FROM, ...common })
        : await clack.select<T>({ message, options: list, ...common });
      return unwrap<T>(picked);
    },

    async confirm(message, confirmOptions = {}) {
      if (!interactive) throw new CliError("usage", `${message} needs a terminal to answer; pass --yes to confirm non-interactively.`);
      return unwrap<boolean>(await clack.confirm({ message, initialValue: confirmOptions.initial ?? false, ...common }));
    },

    async text(message, textOptions = {}) {
      if (!interactive) {
        if (textOptions.initial !== undefined) return textOptions.initial;
        throw new CliError("usage", `${message} needs a terminal to answer.`);
      }
      const answer = await clack.text({
        message,
        ...(textOptions.placeholder !== undefined ? { placeholder: textOptions.placeholder } : {}),
        ...(textOptions.initial !== undefined ? { defaultValue: textOptions.initial, initialValue: textOptions.initial } : {}),
        ...(textOptions.validate ? { validate: (value: string | undefined) => textOptions.validate?.(value ?? "") } : {}),
        ...common,
      });
      return unwrap<string>(answer);
    },

    async password(message) {
      if (!interactive) throw new CliError("usage", `${message} needs a terminal to enter a secret.`);
      return unwrap<string>(await clack.password({ message, ...common }));
    },
  };
}

/** Ctrl+C or Escape inside a prompt is the person's decision, reported with exit 130 like a signal. */
function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CliError("cancelled", "Cancelled.");
  return value as T;
}
