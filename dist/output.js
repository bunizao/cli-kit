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
export function render(value, options) {
    const filtered = options.fields?.length ? selectFields(value, options.fields) : value;
    if (options.format === "json")
        return `${JSON.stringify(filtered, null, 2)}\n`;
    if (options.format === "yaml")
        return stringifyYaml(filtered);
    return renderTable(filtered, options.columns);
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
function renderTable(value, columns) {
    const rows = Array.isArray(value) ? value : [value];
    if (rows.length === 0)
        return "";
    if (!rows.every(isRecord))
        return `${rows.map(String).join("\n")}\n`;
    const selected = columns ?? Object.keys(rows[0] ?? {}).map((key) => [key, key]);
    const values = rows.map((row) => selected.map(([key]) => formatCell(row[key])));
    const widths = selected.map(([, label], index) => Math.max(label.length, ...values.map((row) => row[index]?.length ?? 0)));
    const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ").trimEnd();
    return `${line(selected.map(([, label]) => label))}\n${values.map(line).join("\n")}\n`;
}
function formatCell(value) {
    if (value === null || value === undefined)
        return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
