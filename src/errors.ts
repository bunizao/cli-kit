export const ERROR_CODES = [
  "usage",
  "auth",
  "config",
  "not_found",
  "upstream",
  "network",
  "cancelled",
  "unexpected",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const EXIT_CODES: Readonly<Record<ErrorCode, number>> = Object.freeze({
  usage: 2,
  auth: 3,
  config: 1,
  not_found: 4,
  upstream: 5,
  network: 1,
  cancelled: 130,
  unexpected: 1,
});

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
  }
}

export function exitCodeFor(code: ErrorCode): number {
  return EXIT_CODES[code];
}

export function normalizeError(error: unknown): CliError {
  if (error instanceof CliError) return error;

  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown };
    if (typeof candidate.code === "string" && candidate.code.startsWith("commander.")) {
      return new CliError("usage", error.message.replace(/^error:\s*/i, ""));
    }
    if (error.name === "AbortError") return new CliError("cancelled", "Operation cancelled.");
    if (typeof candidate.code === "string" && NETWORK_CODES.has(candidate.code)) {
      return new CliError("network", error.message);
    }
    return new CliError("unexpected", error.message);
  }

  return new CliError("unexpected", String(error));
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT", "EAI_AGAIN"]);
