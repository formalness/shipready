import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
/** Glob patterns that are always ignored when scanning. */
export const IGNORE_PATTERNS = [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    ".next/**",
    "out/**",
    "coverage/**",
    ".cache/**",
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
];
/** Returns true if the file exists (relative to root or absolute). */
export function fileExists(root, rel) {
    return fs.existsSync(path.join(root, rel));
}
/** Reads a text file safely; returns null on failure. */
export function readTextFile(root, rel) {
    try {
        return fs.readFileSync(path.join(root, rel), "utf8");
    }
    catch {
        return null;
    }
}
/** Reads and parses JSON safely; returns null on failure. */
export function readJsonFile(root, rel) {
    const raw = readTextFile(root, rel);
    if (raw === null)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/** Simple binary sniff: checks for NUL bytes in the first chunk. */
export function isProbablyBinary(root, rel) {
    try {
        const fd = fs.openSync(path.join(root, rel), "r");
        const buf = Buffer.alloc(512);
        const bytes = fs.readSync(fd, buf, 0, 512, 0);
        fs.closeSync(fd);
        for (let i = 0; i < bytes; i++) {
            if (buf[i] === 0)
                return true;
        }
        return false;
    }
    catch {
        return true;
    }
}
/** Finds all scannable source files under root, honoring ignore patterns. */
export async function findSourceFiles(root, extraIgnore = []) {
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
export function writeTextFile(root, rel, content) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
}
