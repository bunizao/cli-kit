import { painter, type Paint } from "./color.js";

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

const TONE_STYLE: Readonly<Record<Tone, Parameters<Paint>[0]>> = {
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
  accent: "magenta",
  muted: "dim",
};

// Checked in order: a negated word ("not graded") must win over the word it contains.
const TONE_WORDS: readonly (readonly [Tone, RegExp])[] = [
  ["muted", /^(?:-|—|none|n\/a|unknown)$|\b(?:not[ _](?:started|submitted|graded|attempted|available|yet)|no submission|un(?:attempted|graded|submitted)|archived|hidden|unlisted|inactive|closed|disabled)\b/iu],
  ["danger", /\b(?:overdue|late|fail(?:ed|ure)?|error|missing|rejected|need(?:s)?[ _]help|blocked|expired|redo|resubmit|demonstrate|exceeded)\b/iu],
  ["warning", /\b(?:pending|draft|working|in[ _]progress|due soon|today|tomorrow|awaiting|unanswered|scheduled|discuss|attempted|partial)\b/iu],
  ["success", /\b(?:complete[d]?|done|submitted|graded|accepted|passed|resolved|answered|ready[ _]for[ _]feedback|active|signed in|ok|success(?:ful)?|enrolled)\b/iu],
  ["accent", /\b(?:announcement|pinned|staff|endorsed|official|urgent)\b/iu],
  ["info", /\b(?:question|post|note|general|info)\b/iu],
];

/**
 * The tone a status word carries. The vocabulary is the one learning sites share
 * ("overdue", "graded", "not started", "announcement"); a caller with its own words
 * passes them in `overrides`, matched whole and case-insensitively, before the shared list.
 */
export function toneOf(text: string, overrides?: Readonly<Record<string, Tone>>): Tone | undefined {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;
  if (overrides) {
    for (const [word, tone] of Object.entries(overrides)) if (word.toLowerCase() === normalized) return tone;
  }
  return TONE_WORDS.find(([, pattern]) => pattern.test(normalized))?.[0];
}

export function createTheme(enabled: boolean): Theme {
  const paint = painter(enabled);
  return {
    enabled,
    key: text => paint("cyan", text),
    subject: text => paint("bold", text),
    target: text => paint(["bold", "cyan"], text),
    dim: text => paint("dim", text),
    tone: (tone, text) => paint(TONE_STYLE[tone], text),
    status(text, overrides) {
      const tone = toneOf(text, overrides);
      return tone ? paint(TONE_STYLE[tone], text) : text;
    },
  };
}
