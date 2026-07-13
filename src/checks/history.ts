import { execFileSync } from "node:child_process";
import type { CheckResult, Finding, SecretFinding } from "../types.js";
import { scanContentForSecrets } from "./secrets.js";

/** Paths in history we never scan (vendor noise, lockfiles, build output). */
const HISTORY_SKIP_RE =
  /(^|\/)(node_modules|vendor|dist|build|\.next|out|coverage)(\/|$)|\.(lock|min\.js|min\.css|map|png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|woff2?)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i;

/** A line added at some point in git history. */
export interface AddedLine {
  commit: string;
  file: string;
  content: string;
}

/**
 * Parses `git log -p --unified=0` output into added lines.
 * Exported for testing.
 */
export function extractAddedLines(diffText: string): AddedLine[] {
  const added: AddedLine[] = [];
  let commit = "";
  let file = "";

  for (const line of diffText.split("\n")) {
    if (line.startsWith("commit ")) {
      commit = line.slice(7, 14); // abbreviated hash
      continue;
    }
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      continue;
    }
    if (line.startsWith("+++")) {
      // +++ /dev/null (file deletion)
      file = "";
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++") && file) {
      const content = line.slice(1);
      // Skip empty lines and vendor/binary-ish paths early.
      if (content.trim().length === 0) continue;
      if (HISTORY_SKIP_RE.test(file)) continue;
      // Minified blobs are noise, mirroring the working-tree scanner.
      if (content.length > 10000) continue;
      added.push({ commit, file, content });
    }
  }
  return added;
}

/** True when the directory is inside a git repository. */
export function isGitRepo(root: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans the entire git history (all branches) for secrets in added lines.
 * Findings that still exist in the working tree are excluded - the regular
 * scanner already reports those; this check surfaces the ones hiding only
 * in old commits.
 */
export function scanGitHistory(
  root: string,
  allowlist: string[] = [],
  workingTreeSecrets: SecretFinding[] = []
): SecretFinding[] {
  let diffText: string;
  try {
    diffText = execFileSync(
      "git",
      ["log", "--all", "-p", "--unified=0", "--no-color", "--diff-filter=AM"],
      { cwd: root, maxBuffer: 512 * 1024 * 1024, encoding: "utf8" }
    );
  } catch {
    return [];
  }

  const addedLines = extractAddedLines(diffText);
  const currentMasks = new Set(workingTreeSecrets.map((s) => `${s.file}::${s.masked}`));
  const seen = new Set<string>();
  const found: SecretFinding[] = [];

  for (const { commit, file, content } of addedLines) {
    const hits = scanContentForSecrets(content, file, allowlist);
    for (const hit of hits) {
      // Skip if the same secret is already reported from the working tree.
      if (currentMasks.has(`${hit.file}::${hit.masked}`)) continue;
      // Dedupe repeats across commits (same value in the same file).
      const key = `${hit.file}::${hit.masked}::${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);

      found.push({
        ...hit,
        line: 0,
        source: "history",
        commit,
      });
    }
  }
  return found;
}

/** Builds the CheckResult for git-history findings. */
export function checkHistory(
  historySecrets: SecretFinding[],
  scanned: boolean
): CheckResult {
  const findings: Finding[] = [];

  if (!scanned) {
    findings.push({
      severity: "info",
      rule: "history.skipped",
      message: "Not a git repository - history scan skipped",
    });
    return { name: "git-history", findings };
  }

  if (historySecrets.length === 0) {
    findings.push({
      severity: "success",
      rule: "history.clean",
      message: "No secrets found in git history",
    });
    return { name: "git-history", findings };
  }

  const high = historySecrets.filter((s) => s.confidence !== "medium");
  const medium = historySecrets.filter((s) => s.confidence === "medium");

  if (high.length > 0) {
    findings.push({
      severity: "error",
      rule: "history.secret",
      message: `${high.length} secret${high.length > 1 ? "s" : ""} buried in git history (removed from code but still exposed)`,
    });
    for (const s of high) {
      findings.push({
        severity: "error",
        rule: "history.secret-item",
        message: `${s.kind}: ${s.masked} (commit ${s.commit})`,
        file: s.file,
      });
    }
  }

  if (medium.length > 0) {
    findings.push({
      severity: "warning",
      rule: "history.possible",
      message: `${medium.length} possible secret${medium.length > 1 ? "s" : ""} in git history (lower confidence)`,
    });
    for (const s of medium) {
      findings.push({
        severity: "warning",
        rule: "history.possible-item",
        message: `${s.kind}: ${s.masked} (commit ${s.commit})`,
        file: s.file,
      });
    }
  }

  return { name: "git-history", findings };
}
