import { painter } from "./color.js";
const TONE_STYLE = {
    success: "green",
    warning: "yellow",
    danger: "red",
    info: "blue",
    accent: "magenta",
    muted: "dim",
};
// Checked in order: a negated word ("not graded") must win over the word it contains.
const TONE_WORDS = [
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
export function toneOf(text, overrides) {
    const normalized = text.trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (overrides) {
        for (const [word, tone] of Object.entries(overrides))
            if (word.toLowerCase() === normalized)
                return tone;
    }
    return TONE_WORDS.find(([, pattern]) => pattern.test(normalized))?.[0];
}
export function createTheme(enabled) {
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
