import fs from "node:fs";
import path from "node:path";

/** User configuration loaded from shipready.config.json. */
export interface ShipreadyConfig {
  /** Extra glob patterns to exclude from scanning. */
  ignore: string[];
  /**
   * Rules or whole checks to disable. Matches exact rule ids
   * (e.g. "readme.weak") or prefixes for whole checks (e.g. "todos").
   */
  disableRules: string[];
  /** Substrings that mark a matched secret as a false positive. */
  secretAllowlist: string[];
}

export const CONFIG_FILE = "shipready.config.json";

const DEFAULT_CONFIG: ShipreadyConfig = {
  ignore: [],
  disableRules: [],
  secretAllowlist: [],
};

function assertStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(
      `Invalid ${CONFIG_FILE}: "${field}" must be an array of strings`
    );
  }
  return value as string[];
}

/**
 * Loads shipready.config.json from the project root.
 * Returns defaults when the file does not exist.
 * Throws a readable error for malformed JSON or wrong field types.
 */
export function loadConfig(root: string): ShipreadyConfig {
  const abs = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(abs)) return { ...DEFAULT_CONFIG };

  let raw: string;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return { ...DEFAULT_CONFIG };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${CONFIG_FILE}: file is not valid JSON`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid ${CONFIG_FILE}: expected a JSON object`);
  }

  const obj = parsed as Record<string, unknown>;
  const known = new Set(["ignore", "disableRules", "secretAllowlist"]);
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: unknown field "${key}" (allowed: ignore, disableRules, secretAllowlist)`
      );
    }
  }

  return {
    ignore: assertStringArray(obj.ignore, "ignore"),
    disableRules: assertStringArray(obj.disableRules, "disableRules"),
    secretAllowlist: assertStringArray(obj.secretAllowlist, "secretAllowlist"),
  };
}

/** Returns true when the rule is disabled by config (exact id or check prefix). */
export function isRuleDisabled(rule: string, disableRules: string[]): boolean {
  return disableRules.some(
    (d) => d === rule || rule === d || rule.startsWith(`${d}.`)
  );
}
