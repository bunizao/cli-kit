import { writeFile } from "node:fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { CliError } from "./errors.js";
export function resolveFormat(options, isTty) {
    const selected = [options.json && "json", options.yaml && "yaml", options.table && "table"].filter(Boolean);
    if (selected.length > 1) {
        throw new CliError("usage", "--json, --yaml, and --table are mutually exclusive.");
    }
    return selected[0] ?? (isTty ? "table" : "json");
}
/** The format a command will use, read from raw argv before Commander has parsed anything. */
export function formatFromArgv(argv, isTty) {
    const end = argv.indexOf("--");
    const tokens = new Set(end === -1 ? argv : argv.slice(0, end));
    try {
        return resolveFormat({ json: tokens.has("--json"), yaml: tokens.has("--yaml"), table: tokens.has("--table") }, isTty);
    }
    catch {
        return isTty ? "table" : "json";
    }
}
export function render(value, options) {
    const filtered = options.fields?.length ? selectFields(value, options.fields) : value;
    if (options.format === "json") {
        return `${options.pretty === false ? JSON.stringify(filtered) : JSON.stringify(filtered, null, 2)}\n`;
    }
    if (options.format === "yaml")
        return stringifyYaml(filtered);
    return renderTable(filtered, options.columns, options.width);
}
export async function writeOutput(text, options) {
    if (options.output) {
        await writeFile(options.output, text, "utf8");
        return;
    }
    await new Promise((resolve, reject) => {
        const onError = (error) => finish(error);
        const finish = (error) => {
            process.stdout.off("error", onError);
            if (!error || error.code === "EPIPE")
                resolve();
            else
                reject(error);
        };
        process.stdout.once("error", onError);
        process.stdout.write(text, finish);
    });
}
function selectFields(value, fields) {
    if (Array.isArray(value))
        return value.map((item) => selectFields(item, fields));
    if (!isRecord(value))
        return value;
    return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
}
/** Narrower than this and a column carries no information, so overflow is the lesser evil. */
const MIN_COLUMN = 8;
const GAP = "  ";
function renderTable(value, columns, width) {
    const rows = Array.isArray(value) ? value : [value];
    if (rows.length === 0)
        return "";
    if (!rows.every(isRecord))
        return `${rows.map(String).join("\n")}\n`;
    const selected = columns ?? columnsOf(rows);
    const values = rows.map((row) => selected.map(([key]) => formatCell(valueAt(row, key))));
    const natural = selected.map(([, label], index) => Math.max(label.length, ...values.map((row) => row[index]?.length ?? 0)));
    const widths = fitWidths(natural, width);
    const line = (cells) => cells.map((cell, index) => truncate(cell, widths[index] ?? 0).padEnd(widths[index] ?? 0)).join(GAP).trimEnd();
    return `${line(selected.map(([, label]) => label))}\n${values.map(line).join("\n")}\n`;
}
/** A column key may reach into a nested object, as "unit.code". */
function valueAt(row, key) {
    if (key in row)
        return row[key];
    let current = row;
    for (const step of key.split(".")) {
        if (!isRecord(current))
            return undefined;
        current = current[step];
    }
    return current;
}
/**
 * Every key any row has, in the order the rows introduce them. Taking the keys of
 * the first row alone drops whatever that row happened to leave out, which is a
 * silent hole in the table for anyone who omits empty fields.
 */
function columnsOf(rows) {
    const keys = new Set();
    for (const row of rows)
        for (const key of Object.keys(row))
            keys.add(key);
    return [...keys].map((key) => [key, key]);
}
/**
 * Shave the widest column a character at a time until the table fits. Truncation is
 * visible; dropping a column is not, so columns are kept even when the budget runs out.
 */
function fitWidths(natural, width) {
    const widths = [...natural];
    if (!width || width <= 0)
        return widths;
    const budget = width - GAP.length * (widths.length - 1);
    let total = widths.reduce((sum, value) => sum + value, 0);
    while (total > budget) {
        const widest = widths.reduce((best, value, index) => (value > (widths[best] ?? 0) ? index : best), 0);
        if ((widths[widest] ?? 0) <= MIN_COLUMN)
            break;
        widths[widest] = (widths[widest] ?? 0) - 1;
        total -= 1;
    }
    return widths;
}
function truncate(cell, width) {
    return width > 0 && cell.length > width ? `${cell.slice(0, width - 1)}…` : cell;
}
/** A cell is one line of a table, so nested values are flattened rather than dumped as JSON. */
function formatCell(value) {
    if (value === null || value === undefined)
        return "";
    if (Array.isArray(value))
        return value.map(formatCell).filter(Boolean).join(", ");
    if (isRecord(value)) {
        return Object.entries(value)
            .filter(([, item]) => item !== null && item !== undefined && item !== "")
            .map(([key, item]) => `${key}=${formatCell(item)}`)
            .join(" ");
    }
    return String(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
