import type { EnvUsage } from "../types.js";
import { fileExists, writeTextFile } from "../utils/files.js";

/** Builds .env.example content from detected env var usages. */
export function buildEnvExample(usages: EnvUsage[]): string {
  const names = [...new Set(usages.map((u) => u.name))].sort();
  const lines = [
    "# Environment variables used by this project.",
    "# Copy to .env and fill in real values. Do not commit .env.",
    "",
    ...names.map((n) => `${n}=`),
    "",
  ];
  return lines.join("\n");
}

export interface FixResult {
  file: string;
  action: "created" | "updated" | "skipped";
  reason?: string;
  /** True when produced by --dry-run: nothing was written to disk. */
  dryRun?: boolean;
  /** Content (or content diff) that was/would be written, for preview. */
  preview?: string;
}

/** Creates .env.example if missing (or with force). */
export function fixEnvExample(
  root: string,
  usages: EnvUsage[],
  force: boolean,
  dryRun = false
): FixResult {
  const file = ".env.example";
  const names = [...new Set(usages.map((u) => u.name))];

  if (names.length === 0) {
    return { file, action: "skipped", reason: "no env vars detected in code" };
  }
  if (fileExists(root, file) && !force) {
    return { file, action: "skipped", reason: "already exists (use --force)" };
  }

  const existed = fileExists(root, file);
  const content = buildEnvExample(usages);
  if (!dryRun) {
    writeTextFile(root, file, content);
  }
  return {
    file,
    action: existed ? "updated" : "created",
    dryRun,
    preview: content,
  };
}
