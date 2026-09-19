import { styleText } from "node:util";
export type Paint = (format: Parameters<typeof styleText>[0], text: string) => string;
interface ColorStream {
    readonly isTTY?: boolean;
    hasColors?(): boolean;
}
/**
 * Whether a stream should get ANSI colour. NO_COLOR and FORCE_COLOR win, as Commander
 * and Node both agree; otherwise only a terminal that reports colour support.
 */
export declare function colorEnabled(stream: ColorStream | undefined, env?: NodeJS.ProcessEnv): boolean;
/** A paint function that colours when asked and is the identity otherwise, so callers never branch. */
export declare function painter(enabled: boolean): Paint;
export {};
