import { CliError } from "./errors.js";
import { createUi } from "./ui.js";
/**
 * The gate every mutating command passes through. `--dry-run` prints the plan and
 * stops, `--yes` skips the question, and a pipe without `--yes` is an error rather
 * than a hang. Only a person at a terminal is ever asked.
 */
export async function confirm(plan, options) {
    const output = options.output ?? process.stderr;
    if (options.dryRun) {
        output.write(`${plan.summary}\n`);
        return false;
    }
    if (options.yes)
        return true;
    if (!options.interactive) {
        throw new CliError("usage", "Mutation requires --yes when stdin is not interactive.");
    }
    const ui = createUi({ interactive: true, ...(options.input ? { input: options.input } : {}), output });
    ui.note(plan.summary, "Plan");
    return ui.confirm("Continue?");
}
