import { writeFile } from "node:fs/promises";
import { stringify as stringifyYaml } from "yaml";

import { CliError } from "./errors.js";
import type { Theme, Tone } from "./theme.js";

export type OutputFormat = "table" | "json" | "yaml";

export interface FormatOptions {
  readonly json?: boolean;
  readonly yaml?: boolean;
  readonly table?: boolean;
  readonly fields?: string;
}

export function resolveFormat(options: FormatOptions, isTty: boolean): OutputFormat {
  const selected = [options.json && "json", options.yaml && "yaml", options.table && "table"].filter(Boolean);
  if (selected.length > 1) {
    throw new CliError("usage", "--json, --yaml, and --table are mutually exclusive.");
  }
  return (selected[0] as OutputFormat | undefined) ?? (isTty ? "table" : "json");
}

/** The format a command will use, read from raw argv before Commander has parsed anything. */
export function formatFromArgv(argv: readonly string[], isTty: boolean): OutputFormat {
  const end = argv.indexOf("--");
  const tokens = new Set(end === -1 ? argv : argv.slice(0, end));
  try {
    return resolveFormat({ json: tokens.has("--json"), yaml: tokens.has("--yaml"), table: tokens.has("--table") }, isTty);
  } catch {
    return isTty ? "table" : "json";
  }
}

export function render(
  value: unknown,
  options: {
    format: OutputFormat;
    fields?: readonly string[];
    columns?: readonly [string, string][];
    /** Terminal width the table has to fit into. Omitted means unlimited. */
    width?: number;
    /** Indent JSON. Readable on a terminal, wasted bytes in a pipe. */
    pretty?: boolean;
    /** Colour the table: dim headers, the first column as a key, status-like columns by tone. */
    theme?: Theme;
    /** The caller's own status words, when the shared vocabulary would misread them. */
    tones?: Readonly<Record<string, Tone>>;
  },
): string {
  const filtered = options.fields?.length ? selectFields(value, options.fields) : value;
  if (options.format === "json") {
    return `${options.pretty === false ? JSON.stringify(filtered) : JSON.stringify(filtered, null, 2)}\n`;
  }
  if (options.format === "yaml") return stringifyYaml(filtered);
  return renderTable(filtered, options.columns, options.width, options.theme, options.tones);
}

export async function writeOutput(text: string, options: { output?: string }): Promise<void> {
  if (options.output) {
    await writeFile(options.output, text, "utf8");
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => finish(error);
    const finish = (error?: NodeJS.ErrnoException | null) => {
      process.stdout.off("error", onError);
      if (!error || error.code === "EPIPE") resolve();
      else reject(error);
    };
    process.stdout.once("error", onError);
    process.stdout.write(text, finish);
  });
}

function selectFields(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => selectFields(item, fields));
  if (!isRecord(value)) return value;
  return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
}

/** Narrower than this and a column carries no information, so overflow is the lesser evil. */
const MIN_COLUMN = 8;
const GAP = "  ";

/** Columns whose cells are status words rather than names, so their colour carries meaning. */
const STATUS_COLUMN = /status|state|type|kind|category|grade|role|due/iu;

function renderTable(value: unknown, columns?: readonly [string, string][], width?: number, theme?: Theme, tones?: Readonly<Record<string, Tone>>): string {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return "";
  if (!rows.every(isRecord)) return `${rows.map(String).join("\n")}\n`;

  const selected = columns ?? columnsOf(rows);
  const values = rows.map((row) => selected.map(([key]) => formatCell(valueAt(row, key))));
  const natural = selected.map(([, label], index) =>
    Math.max(label.length, ...values.map((row) => row[index]?.length ?? 0)),
  );
  const widths = fitWidths(natural, width);
  // Padding is measured on the plain text; colour is wrapped around the padded cell afterwards.
  const line = (cells: readonly string[], paint: (cell: string, index: number) => string) =>
    cells.map((cell, index) => {
      const fitted = truncate(cell, widths[index] ?? 0);
      return paint(index === cells.length - 1 ? fitted : fitted.padEnd(widths[index] ?? 0), index);
    }).join(GAP).trimEnd();
  const plain = (cell: string) => cell;
  const cellPaint = theme
    ? (cell: string, index: number) => index === 0 ? theme.key(cell) : STATUS_COLUMN.test(selected[index]?.[0] ?? "") ? theme.status(cell, tones) : cell
    : plain;
  const header = line(selected.map(([, label]) => label), theme ? cell => theme.dim(cell) : plain);
  return `${header}\n${values.map(row => line(row, cellPaint)).join("\n")}\n`;
}

/** A column key may reach into a nested object, as "unit.code". */
function valueAt(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  let current: unknown = row;
  for (const step of key.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[step];
  }
  return current;
}

/**
 * Every key any row has, in the order the rows introduce them. Taking the keys of
 * the first row alone drops whatever that row happened to leave out, which is a
 * silent hole in the table for anyone who omits empty fields.
 */
function columnsOf(rows: readonly Record<string, unknown>[]): readonly [string, string][] {
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  return [...keys].map((key) => [key, key]);
}

/**
 * Shave the widest column a character at a time until the table fits. Truncation is
 * visible; dropping a column is not, so columns are kept even when the budget runs out.
 */
function fitWidths(natural: readonly number[], width?: number): number[] {
  const widths = [...natural];
  if (!width || width <= 0) return widths;
  const budget = width - GAP.length * (widths.length - 1);
  let total = widths.reduce((sum, value) => sum + value, 0);
  while (total > budget) {
    const widest = widths.reduce((best, value, index) => (value > (widths[best] ?? 0) ? index : best), 0);
    if ((widths[widest] ?? 0) <= MIN_COLUMN) break;
    widths[widest] = (widths[widest] ?? 0) - 1;
    total -= 1;
  }
  return widths;
}

function truncate(cell: string, width: number): string {
  return width > 0 && cell.length > width ? `${cell.slice(0, width - 1)}…` : cell;
}

/** A cell is one line of a table, so nested values are flattened rather than dumped as JSON. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatCell).filter(Boolean).join(", ");
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .map(([key, item]) => `${key}=${formatCell(item)}`)
      .join(" ");
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
