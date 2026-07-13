import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

/** Glob patterns that are always ignored when scanning. */
export const IGNORE_PATTERNS = [
  // Dependencies and VCS (at any depth)
  "**/node_modules/**",
  "**/.git/**",
  // Build output (at any depth, e.g. mobile/build/)
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/.output/**",
  // Minified/bundled vendor assets — not user code
  "**/*.min.js",
  "**/*.min.css",
  "**/*.bundle.js",
  "**/*.chunk.js",
  "**/vendor/**",
  "**/vendors/**",
  // Python artifacts
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  // Lockfiles and maps
  "**/*.map",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
];

/** Extensions we treat as scannable text/code files. */
export const CODE_EXTENSIONS = [
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "vue",
  "svelte",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "php",
  "json",
  "yml",
  "yaml",
  "toml",
  "env",
  "sh",
  // Static sites: inline <script> blocks can leak keys just as easily
  "html",
  "htm",
];

/** Returns true if the file exists (relative to root or absolute). */
export function fileExists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

/** Reads a text file safely; returns null on failure. */
export function readTextFile(root: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Reads and parses JSON safely; returns null on failure. */
export function readJsonFile<T>(root: string, rel: string): T | null {
  const raw = readTextFile(root, rel);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Simple binary sniff: checks for NUL bytes in the first chunk. */
export function isProbablyBinary(root: string, rel: string): boolean {
  try {
    const fd = fs.openSync(path.join(root, rel), "r");
    const buf = Buffer.alloc(512);
    const bytes = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytes; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Finds all scannable source files under root, honoring ignore patterns. */
export async function findSourceFiles(
  root: string,
  extraIgnore: string[] = []
): Promise<string[]> {
  const pattern = `**/*.{${CODE_EXTENSIONS.join(",")}}`;
  const files = await fg([pattern, ".env*", "**/.env*"], {
    cwd: root,
    ignore: [...IGNORE_PATTERNS, ...extraIgnore],
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    unique: true,
  });
  return files.sort();
}

/** Writes a text file, creating parent directories as needed. */
export function writeTextFile(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}
