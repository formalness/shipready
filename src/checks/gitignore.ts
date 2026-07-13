import type { CheckResult, Finding, Framework } from "../types.js";
import { isNodeEcosystem } from "../utils/framework.js";
import { readTextFile } from "../utils/files.js";

/** Node-ecosystem entries (also the default when the framework is unknown). */
export const IMPORTANT_IGNORES = [
  ".env",
  ".env.local",
  "node_modules",
  "dist",
  "build",
  ".next",
];

/**
 * Expected entries per ecosystem. Suggesting node_modules to a Go project
 * (or target/ to a Python one) is noise that erodes trust in the tool, so
 * each ecosystem only gets entries that actually apply to it.
 */
const ECOSYSTEM_IGNORES: Partial<Record<Framework, string[]>> = {
  Python: [".env", "__pycache__", ".venv"],
  Go: [".env"],
  Rust: [".env", "target"],
  PHP: [".env", "vendor"],
  Ruby: [".env", ".bundle"],
  Java: [".env", "target", "build"],
  Deno: [".env"],
  "Static HTML": [".env"],
  unknown: [".env"],
};

/** Returns the entries a project of the given framework should ignore. */
export function importantIgnoresFor(framework?: Framework): string[] {
  if (!framework || isNodeEcosystem(framework)) return IMPORTANT_IGNORES;
  return ECOSYSTEM_IGNORES[framework] ?? [".env"];
}

/** Returns which important entries are missing from gitignore content. */
export function missingIgnoreEntries(content: string, framework?: Framework): string[] {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const covers = (entry: string): boolean =>
    lines.some((l) => {
      const normalized = l.replace(/\/+$/, "").replace(/^\//, "");
      if (normalized === entry) return true;
      // ".env*" covers ".env" and ".env.local"
      if (normalized === ".env*" && entry.startsWith(".env")) return true;
      // "node_modules/" style already normalized above
      return false;
    });

  return importantIgnoresFor(framework).filter((e) => !covers(e));
}

/** Checks .gitignore existence and important entries. */
export function checkGitignore(root: string, framework?: Framework): CheckResult {
  const findings: Finding[] = [];
  const content = readTextFile(root, ".gitignore");

  if (content === null) {
    findings.push({
      severity: "error",
      rule: "gitignore.missing",
      message: ".gitignore missing",
    });
    return { name: "gitignore", findings };
  }

  const missing = missingIgnoreEntries(content, framework);
  if (missing.length > 0) {
    findings.push({
      severity: "warning",
      rule: "gitignore.incomplete",
      message: `.gitignore missing entries: ${missing.join(", ")}`,
    });
  } else {
    findings.push({
      severity: "success",
      rule: "gitignore.complete",
      message: ".gitignore covers important entries",
    });
  }

  return { name: "gitignore", findings };
}
