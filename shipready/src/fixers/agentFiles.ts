import type { ProjectInfo } from "../types.js";
import { generateAgentsMd } from "../generators/agentsMd.js";
import { generateClaudeMd } from "../generators/claudeMd.js";
import { generateCursorRules } from "../generators/cursorRules.js";
import { fileExists, writeTextFile } from "../utils/files.js";
import type { FixResult } from "./envExample.js";

const TARGETS: Array<{
  file: string;
  generate: (project: ProjectInfo) => string;
}> = [
  { file: "AGENTS.md", generate: generateAgentsMd },
  { file: "CLAUDE.md", generate: generateClaudeMd },
  { file: ".cursor/rules/shipready.md", generate: generateCursorRules },
];

/** Generates all agent instruction files, honoring --force. */
export function fixAgentFiles(
  root: string,
  project: ProjectInfo,
  force: boolean
): FixResult[] {
  const results: FixResult[] = [];
  for (const { file, generate } of TARGETS) {
    if (fileExists(root, file) && !force) {
      results.push({ file, action: "skipped", reason: "already exists (use --force)" });
      continue;
    }
    const existed = fileExists(root, file);
    writeTextFile(root, file, generate(project));
    results.push({ file, action: existed ? "updated" : "created" });
  }
  return results;
}
