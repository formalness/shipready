import type { CheckResult, Finding } from "../types.js";
import { readTextFile } from "../utils/files.js";

export const IMPORTANT_IGNORES = [
  ".env",
  ".env.local",
  "node_modules",
  "dist",
  "build",
  ".next",
];

/** Returns which important entries are missing from gitignore content. */
export function missingIgnoreEntries(content: string): string[] {
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

  return IMPORTANT_IGNORES.filter((e) => !covers(e));
}

/** Checks .gitignore existence and important entries. */
export function checkGitignore(root: string): CheckResult {
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

  const missing = missingIgnoreEntries(content);
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
