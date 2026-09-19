import type { Writable } from "node:stream";
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
    /** The command `editor` runs instead of $VISUAL or $EDITOR; the file path is appended. */
    readonly editor?: string;
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
    confirm(message: string, options?: {
        readonly initial?: boolean;
    }): Promise<boolean>;
    /** One line of text. Without a terminal this returns `options.initial` or throws. */
    text(message: string, options?: {
        readonly placeholder?: string;
        readonly initial?: string;
        readonly validate?: (value: string) => string | undefined;
    }): Promise<string>;
    /** One secret, echoed as dots. Without a terminal this throws; callers offer a stdin flag instead. */
    password(message: string): Promise<string>;
    /**
     * Several lines, written in the person's $VISUAL or $EDITOR the way git asks for a
     * commit message. Returns the file as saved. Without a terminal this throws; callers
     * offer a file or stdin flag instead.
     */
    editor(message: string, options?: {
        readonly initial?: string;
        readonly extension?: string;
    }): Promise<string>;
}
export declare const AUTOCOMPLETE_FROM = 8;
/**
 * Every CLI in the family draws the same way: prompts, steps and spinners on stderr
 * in the clack style when a person is at the keyboard; plain completed lines when the
 * output is a pipe; and never a prompt without a terminal, because a hung agent is
 * worse than an error that says what to pass.
 */
export declare function createUi(options?: UiOptions): Ui;
