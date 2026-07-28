import { stringify as stringifyYaml } from "yaml";
import { exitCodeFor, normalizeError } from "./errors.js";
export function reportError(error, format) {
    const normalized = normalizeError(error);
    const exitCode = exitCodeFor(normalized.code);
    if (format === "table") {
        const hint = normalized.hint ? `\nhint: ${normalized.hint}` : "";
        return { text: `error: ${normalized.message}${hint}\n`, exitCode };
    }
    const envelope = {
        ok: false,
        error: {
            code: normalized.code,
            message: normalized.message,
            ...(normalized.hint ? { hint: normalized.hint } : {}),
        },
        exit_code: exitCode,
    };
    return {
        text: format === "json" ? `${JSON.stringify(envelope, null, 2)}\n` : stringifyYaml(envelope),
        exitCode,
    };
}
