import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.js";
export async function confirm(plan, options) {
    if (options.dryRun) {
        process.stderr.write(`${plan.summary}\n`);
        return false;
    }
    if (options.yes)
        return true;
    if (!options.interactive) {
        throw new CliError("usage", "Mutation requires --yes when stdin is not interactive.");
    }
    process.stderr.write(`${plan.summary}\n`);
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
        const answer = await prompt.question("Continue? y/N ");
        return answer.trim().toLowerCase() === "y";
    }
    finally {
        prompt.close();
    }
}
