import { execFileSync } from "node:child_process";
import type { SecretFinding } from "../types.js";
import { scanContentForSecrets } from "./secrets.js";

/**
 * Pre-commit mode: scans only the files staged in the git index.
 * Reads content via `git show :<file>` so partially staged files are
 * checked exactly as they would be committed, not as they sit on disk.
 * Secrets-only by design - a pre-commit hook must be fast and only
 * block on real dangers, not TODO comments.
 */

/** Extensions and paths we skip in staged mode (binary/vendor noise). */
const STAGED_SKIP_RE =
  /(^|\/)(node_modules|vendor|dist|build|\.next|out|coverage)(\/|$)|\.(lock|min\.js|min\.css|map|png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|gz|woff2?|ttf|eot|mp3|mp4)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i;

/** Lists files staged for commit (added/copied/modified/renamed). */
export function listStagedFiles(root: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      { cwd: root, encoding: "utf8" }
    );
    return out.split("\0").filter((f) => f.length > 0 && !STAGED_SKIP_RE.test(f));
  } catch {
    return [];
  }
}

/** Reads a file's staged (index) content, not the working-tree version. */
export function readStagedContent(root: string, file: string): string | null {
  try {
    const buf = execFileSync("git", ["show", `:${file}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
    // Binary sniff: NUL byte in the first 512 bytes.
    const head = buf.subarray(0, 512);
    for (const byte of head) {
      if (byte === 0) return null;
    }
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/** Scans all staged files for secrets. */
export function scanStaged(
  root: string,
  allowlist: string[] = []
): { files: string[]; secrets: SecretFinding[] } {
  const files = listStagedFiles(root);
  const secrets: SecretFinding[] = [];

  for (const file of files) {
    // .env files are expected to hold real values; committing one at all is
    // the problem, and the gitignore check covers that. But since it IS
    // being committed here, flag everything inside it too.
    const content = readStagedContent(root, file);
    if (content === null) continue;
    secrets.push(...scanContentForSecrets(content, file, allowlist));
  }

  return { files, secrets };
}
