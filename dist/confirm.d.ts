export interface MutationPlan {
    readonly summary: string;
}
export declare function confirm(plan: MutationPlan, options: {
    yes: boolean;
    dryRun: boolean;
    interactive: boolean;
}): Promise<boolean>;
