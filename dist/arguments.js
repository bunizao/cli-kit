import { CliError } from "./errors.js";
// Every round appends at least one token, so this only guards a filler that keeps failing.
const MAX_ROUNDS = 8;
/**
 * Parse argv with a freshly built program. When a person at a terminal left out trailing
 * positionals or a required option, ask for them and parse again with the answers appended,
 * so `moodle activities list` becomes a unit picker instead of a usage error. Anyone else
 * gets the usage error, with the command's usage line as the hint.
 */
export async function parseWithPrompts(build, argv, options) {
    let args = [...argv];
    for (let round = 0;; round += 1) {
        const program = build();
        annotate(program);
        try {
            await program.parseAsync(args, { from: "user" });
            return;
        }
        catch (error) {
            const failing = failingCommand(error);
            if (!failing)
                throw error;
            if (!options.ui.interactive)
                throw withUsageHint(error, failing.command);
            if (round >= MAX_ROUNDS)
                throw error;
            const answers = await answersFor(failing.command, failing.code, options);
            if (!answers.length)
                throw error;
            args = [...args, ...answers];
        }
    }
}
const FILLABLE = new Set(["commander.missingArgument", "commander.missingMandatoryOptionValue"]);
// Commander reports a missing argument without saying which command wanted it, so every
// command rethrows its own exit with itself attached.
function annotate(command) {
    command.exitOverride(error => {
        throw Object.assign(error, { command });
    });
    for (const child of command.commands)
        annotate(child);
}
function failingCommand(error) {
    if (!error || typeof error !== "object")
        return undefined;
    const { code, command } = error;
    if (typeof code !== "string" || !FILLABLE.has(code) || !command)
        return undefined;
    return { command: command, code };
}
async function answersFor(command, code, options) {
    if (code === "commander.missingArgument")
        return fillPositionals(command, options);
    return fillOption(command, options.ui);
}
async function fillPositionals(command, options) {
    const typed = command.args;
    const provided = {};
    command.registeredArguments.forEach((argument, index) => {
        const value = typed[index];
        if (value !== undefined)
            provided[argument.name()] = value;
    });
    const answers = [];
    for (const argument of command.registeredArguments.slice(typed.length)) {
        // Commander requires the required positionals to come first, so the first optional one ends the asking.
        if (!argument.required)
            break;
        const answer = await answerFor(argument, { command, provided: { ...provided }, ui: options.ui }, options.fillers?.[argument.name()]);
        const tokens = typeof answer === "string" ? (argument.variadic ? answer.split(/\s+/u) : [answer.trim()]).filter(Boolean) : [...answer];
        if (!tokens.length)
            throw new CliError("usage", `${argument.name()} is required.`);
        provided[argument.name()] = tokens.join(" ");
        answers.push(...tokens);
    }
    return answers;
}
function answerFor(argument, context, filler) {
    if (filler)
        return filler(context);
    const message = argument.description || argument.name();
    if (argument.argChoices)
        return context.ui.select(message, argument.argChoices.map(value => ({ value, label: value })));
    return context.ui.text(message, { validate: value => (value.trim() ? undefined : "Required.") });
}
async function fillOption(command, ui) {
    const option = command.options.find(candidate => candidate.mandatory && command.getOptionValue(candidate.attributeName()) === undefined);
    const flag = option?.long ?? option?.short;
    if (!option || !flag)
        return [];
    const message = option.description || flag;
    if (!option.required && !option.optional)
        return (await ui.confirm(message)) ? [flag] : [];
    const value = option.argChoices
        ? await ui.select(message, option.argChoices.map(choice => ({ value: choice, label: choice })))
        : await ui.text(message, { validate: text => (text.trim() ? undefined : "Required.") });
    return [flag, value.trim()];
}
/** The same usage error, plus the usage line an agent needs to correct the call. */
function withUsageHint(error, command) {
    if (!(error instanceof Error))
        return error;
    const names = [];
    for (let current = command; current; current = current.parent)
        names.unshift(current.name());
    const describe = (item, term) => (item.description ? `  ${term}  ${item.description}` : undefined);
    const lines = [
        `Usage: ${names.join(" ")} ${command.usage()}`,
        ...command.registeredArguments.map(argument => describe(argument, argument.name())),
        ...command.options.filter(option => option.mandatory).map(option => describe(option, option.flags)),
    ].filter((line) => Boolean(line));
    return new CliError("usage", error.message.replace(/^error:\s*/iu, ""), lines.join("\n"));
}
