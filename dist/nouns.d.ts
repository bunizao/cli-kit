export interface NounSpec {
    readonly name: string;
    readonly aliases?: readonly string[];
    readonly verbs: readonly string[];
    readonly defaultByArity: Readonly<Record<number, string>>;
    /** Option flags whose following token is a value, not a positional argument. */
    readonly valueFlags?: readonly string[];
}
export declare function insertDefaultVerb(argv: readonly string[], nouns: readonly NounSpec[]): string[];
