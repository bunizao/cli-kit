import { type UiOptions } from "./ui.js";
export interface MutationPlan {
    readonly summary: string;
}
/**
 * The gate every mutating command passes through. `--dry-run` prints the plan and
 * stops, `--yes` skips the question, and a pipe without `--yes` is an error rather
 * than a hang. Only a person at a terminal is ever asked.
 */
export declare function confirm(plan: MutationPlan, options: {
    yes: boolean;
    dryRun: boolean;
    interactive: boolean;
} & Pick<UiOptions, "input" | "output">): Promise<boolean>;
