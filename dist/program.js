import { Command } from "commander";
export const VERBS = ["list", "show", "read", "get", "search", "send", "submit", "set", "mark-read"];
const VERB_SET = new Set(VERBS);
const mutations = new WeakSet();
const ACTION_GROUPS = new Set(["auth", "skills"]);
const ACTIONS = {
    auth: new Set(["install", "uninstall", "login", "status", "logout", "keepalive"]),
    skills: new Set(["generate", "add"]),
};
export function createProgram(meta) {
    return new Command()
        .name(meta.name)
        .version(meta.version, "-V, --version")
        .description(meta.description)
        .helpOption("-h, --help")
        .addHelpCommand(true)
        .showSuggestionAfterError()
        .exitOverride()
        .configureOutput({ outputError: () => undefined })
        .option("--json", "Emit JSON")
        .option("--yaml", "Emit YAML")
        .option("--table", "Emit a human-readable table")
        .option("--fields <fields>", "Select top-level fields")
        .option("-o, --output <file>", "Write output to a file")
        .option("-q, --quiet", "Suppress non-essential diagnostics")
        .option("--verbose", "Enable debug logging")
        .option("--no-color", "Disable color output")
        .option("-y, --yes", "Confirm mutations non-interactively")
        .option("--dry-run", "Print the mutation plan without applying it");
}
export function mutating(command) {
    mutations.add(command);
    return command;
}
export function commandsJson(program) {
    return {
        name: program.name(),
        version: program.version() ?? "",
        description: program.description(),
        commands: program.commands.filter((command) => command.name() !== "help").map((command) => describe(command)),
    };
}
function describe(command, noun) {
    const currentNoun = noun ?? command.name();
    const verb = noun && !ACTION_GROUPS.has(noun) ? command.name() : undefined;
    if (noun && ACTION_GROUPS.has(noun) && !ACTIONS[noun]?.has(command.name())) {
        throw new Error(`Unsupported action "${command.name()}" on group "${noun}".`);
    }
    if (verb && !VERB_SET.has(verb)) {
        throw new Error(`Unsupported verb "${verb}" on noun "${noun}".`);
    }
    return {
        name: command.name(),
        noun: currentNoun,
        ...(verb ? { verb } : {}),
        aliases: command.aliases(),
        description: command.description(),
        positionals: command.registeredArguments.map(describeArgument),
        options: command.options.map(describeOption),
        mutating: mutations.has(command),
        commands: command.commands.filter((child) => child.name() !== "help").map((child) => describe(child, currentNoun)),
    };
}
function describeArgument(argument) {
    return {
        name: argument.name(),
        description: argument.description,
        required: argument.required,
        variadic: argument.variadic,
        ...(argument.argChoices ? { enumValues: argument.argChoices } : {}),
    };
}
function describeOption(option) {
    return {
        flags: option.flags,
        description: option.description,
        required: option.required,
        variadic: option.variadic,
        ...(option.argChoices ? { enumValues: option.argChoices } : {}),
    };
}
