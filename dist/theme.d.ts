/** What a status word means to the person reading it, independent of the site that produced it. */
export type Tone = "success" | "warning" | "danger" | "info" | "accent" | "muted";
/**
 * The roles a line of human output is made of. Every CLI in the family paints the
 * same role the same way, so a person learns once that cyan is something they can
 * type back (a unit code, a task number, an option) and bold is what they gave.
 */
export interface Theme {
    readonly enabled: boolean;
    /** An identifier the person will type again: a unit code, a task number, an id. */
    key(text: string): string;
    /** The thing being acted on: the files, the message, the title. */
    subject(text: string): string;
    /** Where it goes: the assignment, the thread, the unit. */
    target(text: string): string;
    /** Secondary facts: dates, counts, urls, labels. */
    dim(text: string): string;
    tone(tone: Tone, text: string): string;
    /** A status word coloured by what it means; unknown words stay plain. */
    status(text: string, overrides?: Readonly<Record<string, Tone>>): string;
}
/**
 * The tone a status word carries. The vocabulary is the one learning sites share
 * ("overdue", "graded", "not started", "announcement"); a caller with its own words
 * passes them in `overrides`, matched whole and case-insensitively, before the shared list.
 */
export declare function toneOf(text: string, overrides?: Readonly<Record<string, Tone>>): Tone | undefined;
export declare function createTheme(enabled: boolean): Theme;
