export interface NounSpec {
    readonly name: string;
    readonly aliases?: readonly string[];
    readonly verbs: readonly string[];
    readonly defaultByArity: Readonly<Record<number, string>>;
    /** Option flags whose following token is a value, not a positional argument. */
    readonly valueFlags?: readonly string[];
}
/**
 * Nouns every CLI names the same way. A CLI that offers one uses its spec as is, or with fewer
 * verbs and its own valueFlags, so `moodle grades` and `edstem grades` read alike.
 */
export declare const SHARED_NOUNS: {
    readonly courses: {
        readonly name: "courses";
        readonly aliases: readonly ["units", "projects"];
        readonly verbs: readonly ["list", "show", "get"];
        readonly defaultByArity: {
            readonly 0: "list";
            readonly 1: "show";
        };
    };
    readonly grades: {
        readonly name: "grades";
        readonly verbs: readonly ["list"];
        readonly defaultByArity: {
            readonly 0: "list";
            readonly 1: "list";
        };
    };
};
/** The `status` of one row in `grades` output. */
export declare const GRADE_STATUSES: readonly ["graded", "ungraded", "unreleased", "not_submitted", "unavailable"];
export type GradeStatus = (typeof GRADE_STATUSES)[number];
export declare function insertDefaultVerb(argv: readonly string[], nouns: readonly NounSpec[]): string[];
