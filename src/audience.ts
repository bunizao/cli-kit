import type { OutputFormat } from "./output.js";

/**
 * Who is on the other end of the command. A human gets tables, prompts and progress;
 * an agent gets machine output, no prompts, and errors that name the flag to pass.
 */
export type Audience = "human" | "agent";

/**
 * Environment variables that mark a shell driven by a program even when it has a pty.
 * `CLAUDECODE` is set by Claude Code's shell, `CI` by every hosted runner, and
 * `CLI_AGENT` is the documented opt-in for any other agent that allocates a terminal.
 * The Claude desktop terminal pane sets none of them, so a person there stays human.
 */
export const AGENT_ENV_VARS = ["CLI_AGENT", "CLAUDECODE", "CI"] as const;

export interface AudienceInput {
  readonly stdin?: { readonly isTTY?: boolean | undefined };
  readonly stdout?: { readonly isTTY?: boolean | undefined };
  readonly env?: NodeJS.ProcessEnv;
  /** The resolved output format. JSON and YAML are asked for by programs. */
  readonly format?: OutputFormat;
}

export function detectAudience(input: AudienceInput = {}): Audience {
  if (input.format && input.format !== "table") return "agent";
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) return "agent";
  const env = input.env ?? process.env;
  if (AGENT_ENV_VARS.some((name) => isSet(env[name]))) return "agent";
  return "human";
}

export function isAgentEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return AGENT_ENV_VARS.some((name) => isSet(env[name]));
}

function isSet(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}
