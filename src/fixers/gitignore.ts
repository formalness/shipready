import { importantIgnoresFor, missingIgnoreEntries } from "../checks/gitignore.js";
import { readTextFile, writeTextFile } from "../utils/files.js";
import type { Framework } from "../types.js";
import type { FixResult } from "./envExample.js";

/** Adds missing important entries to .gitignore (creates it if absent). */
export function fixGitignore(root: string, dryRun = false, framework?: Framework): FixResult {
  const file = ".gitignore";
  const existing = readTextFile(root, file);

  if (existing === null) {
    const content = [
      "# Added by shipready",
      ...importantIgnoresFor(framework),
      "",
    ].join("\n");
    if (!dryRun) {
      writeTextFile(root, file, content);
    }
    return { file, action: "created", dryRun, preview: content };
  }

  const missing = missingIgnoreEntries(existing, framework);
  if (missing.length === 0) {
    return { file, action: "skipped", reason: "already complete" };
  }

  const suffix = existing.endsWith("\n") ? "" : "\n";
  const addition = `${suffix}\n# Added by shipready\n${missing.join("\n")}\n`;
  if (!dryRun) {
    writeTextFile(root, file, existing + addition);
  }
  // Preview shows only what gets appended, not the whole file.
  return { file, action: "updated", dryRun, preview: addition.trimStart() };
}
