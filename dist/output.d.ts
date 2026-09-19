export type OutputFormat = "table" | "json" | "yaml";
export interface FormatOptions {
    readonly json?: boolean;
    readonly yaml?: boolean;
    readonly table?: boolean;
    readonly fields?: string;
}
export declare function resolveFormat(options: FormatOptions, isTty: boolean): OutputFormat;
/** The format a command will use, read from raw argv before Commander has parsed anything. */
export declare function formatFromArgv(argv: readonly string[], isTty: boolean): OutputFormat;
export declare function render(value: unknown, options: {
    format: OutputFormat;
    fields?: readonly string[];
    columns?: readonly [string, string][];
    /** Terminal width the table has to fit into. Omitted means unlimited. */
    width?: number;
    /** Indent JSON. Readable on a terminal, wasted bytes in a pipe. */
    pretty?: boolean;
}): string;
export declare function writeOutput(text: string, options: {
    output?: string;
}): Promise<void>;
