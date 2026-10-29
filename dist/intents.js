import { insertDefaultVerb } from "./nouns.js";
/** The MCP tool description for an intent: prose, because a model reads it. */
export function toolDescription(intent) {
    return [
        sentence(intent.what),
        sentence(`Use when the user says "${intent.when}"`),
        intent.instead && sentence(`Instead: ${intent.instead}`),
        intent.refs && sentence(`Input: ${intent.refs}`),
        intent.then && sentence(`Then: ${intent.then}`),
        intent.cost && sentence(`Cost: ${intent.cost}`),
    ].filter(Boolean).join(" ");
}
/**
 * Throw when an intent's command no longer parses against the program: a renamed noun or verb,
 * a wrong binary name, or an option that was removed. Run it in the CLI's tests.
 */
export function checkIntentCommands(program, nouns, intents) {
    const problems = intents.flatMap((intent) => (intent.command ? commandProblems(program, nouns, intent.command) : []));
    if (problems.length)
        throw new Error(`Intent commands out of date:\n${problems.join("\n")}`);
}
const ALWAYS_ACCEPTED = new Set(["-h", "--help", "-V", "--version"]);
function commandProblems(program, nouns, text) {
    const [binary, ...rest] = words(text);
    if (binary !== program.name())
        return [`${text}: starts with "${binary}", not "${program.name()}"`];
    const argv = insertDefaultVerb(rest.map(unwrapOptionalFlag), nouns);
    const path = [program];
    let unmatched;
    for (const token of argv) {
        if (token.startsWith("-"))
            continue;
        const current = path.at(-1);
        const child = current.commands.find((command) => command.name() === token || command.aliases().includes(token));
        if (!child) {
            unmatched = token;
            break;
        }
        path.push(child);
    }
    const problems = [];
    const resolved = path.at(-1);
    // A group that takes no arguments of its own must be followed by one of its commands.
    if (unmatched !== undefined && resolved.commands.length && !resolved.registeredArguments.length) {
        problems.push(`${text}: "${unmatched}" is not a command of "${path.map((command) => command.name()).join(" ")}"`);
    }
    const options = new Set(path.flatMap((command) => command.options.flatMap(optionNames)));
    for (const token of argv) {
        const flag = token.split("=")[0] ?? token;
        if (flag.startsWith("-") && !ALWAYS_ACCEPTED.has(flag) && !options.has(flag)) {
            problems.push(`${text}: unknown option "${flag}"`);
        }
    }
    return problems;
}
// Quoted strings and bracketed placeholders such as <lesson id> stay one word.
function words(text) {
    return text.replace(/^`|`$/g, "").match(/"[^"]*"|'[^']*'|<[^>]*>|\[[^\]]*\]|\S+/g) ?? [];
}
// `[--final]` documents an optional flag; check it like `--final`.
function unwrapOptionalFlag(token) {
    const inner = /^\[(-[^\s\]]+)/.exec(token);
    return inner?.[1] ?? token;
}
function optionNames(option) {
    return [option.long, option.short].filter((name) => Boolean(name));
}
function sentence(text) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
}
