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
export function colorEnabled(stream: ColorStream | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR || env.FORCE_COLOR === "0" || env.FORCE_COLOR === "false") return false;
  if (env.FORCE_COLOR || env.CLICOLOR_FORCE !== undefined) return true;
  return Boolean(stream?.isTTY) && (stream?.hasColors?.() ?? true);
}

/** A paint function that colours when asked and is the identity otherwise, so callers never branch. */
export function painter(enabled: boolean): Paint {
  if (!enabled) return (_format, text) => text;
  // The caller has already decided from the right stream; styleText must not second-guess it.
  return (format, text) => styleText(format, text, { validateStream: false });
}
