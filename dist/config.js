import fs from "node:fs";
import path from "node:path";
export const CONFIG_FILE = "shipready.config.json";
const DEFAULT_CONFIG = {
    ignore: [],
    disableRules: [],
    secretAllowlist: [],
};
function assertStringArray(value, field) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new Error(`Invalid ${CONFIG_FILE}: "${field}" must be an array of strings`);
    }
    return value;
}
/**
 * Loads shipready.config.json from the project root.
 * Returns defaults when the file does not exist.
 * Throws a readable error for malformed JSON or wrong field types.
 */
export function loadConfig(root) {
    const abs = path.join(root, CONFIG_FILE);
    if (!fs.existsSync(abs))
        return { ...DEFAULT_CONFIG };
    let raw;
    try {
        raw = fs.readFileSync(abs, "utf8");
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`Invalid ${CONFIG_FILE}: file is not valid JSON`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Invalid ${CONFIG_FILE}: expected a JSON object`);
    }
    const obj = parsed;
    const known = new Set(["ignore", "disableRules", "secretAllowlist"]);
    for (const key of Object.keys(obj)) {
        if (!known.has(key)) {
            throw new Error(`Invalid ${CONFIG_FILE}: unknown field "${key}" (allowed: ignore, disableRules, secretAllowlist)`);
        }
    }
    return {
        ignore: assertStringArray(obj.ignore, "ignore"),
        disableRules: assertStringArray(obj.disableRules, "disableRules"),
        secretAllowlist: assertStringArray(obj.secretAllowlist, "secretAllowlist"),
    };
}
/** Returns true when the rule is disabled by config (exact id or check prefix). */
export function isRuleDisabled(rule, disableRules) {
    return disableRules.some((d) => d === rule || rule === d || rule.startsWith(`${d}.`));
}
