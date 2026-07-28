export type OutputFormat = "table" | "json" | "yaml";
export interface FormatOptions {
    readonly json?: boolean;
    readonly yaml?: boolean;
    readonly table?: boolean;
    readonly fields?: string;
}
export declare function resolveFormat(options: FormatOptions, isTty: boolean): OutputFormat;
export declare function render(value: unknown, options: {
    format: OutputFormat;
    fields?: readonly string[];
    columns?: readonly [string, string][];
}): string;
export declare function writeOutput(text: string, options: {
    output?: string;
}): Promise<void>;
