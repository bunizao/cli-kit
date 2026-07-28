import type { OutputFormat } from "./output.js";
export declare function reportError(error: unknown, format: OutputFormat): {
    readonly text: string;
    readonly exitCode: number;
};
