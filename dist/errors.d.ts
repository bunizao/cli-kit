export declare const ERROR_CODES: readonly ["usage", "auth", "config", "not_found", "upstream", "network", "cancelled", "unexpected"];
export type ErrorCode = (typeof ERROR_CODES)[number];
export declare const EXIT_CODES: Readonly<Record<ErrorCode, number>>;
export declare class CliError extends Error {
    readonly code: ErrorCode;
    readonly hint: string | undefined;
    constructor(code: ErrorCode, message: string, hint?: string);
}
/** Commander's help and version exits: the output is already written and nothing failed. */
export declare function isInformationalExit(error: unknown): boolean;
export declare function exitCodeFor(code: ErrorCode): number;
export declare function normalizeError(error: unknown): CliError;
