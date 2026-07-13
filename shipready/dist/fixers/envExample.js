import { fileExists, writeTextFile } from "../utils/files.js";
/** Builds .env.example content from detected env var usages. */
export function buildEnvExample(usages) {
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
/** Creates .env.example if missing (or with force). */
export function fixEnvExample(root, usages, force) {
    const file = ".env.example";
    const names = [...new Set(usages.map((u) => u.name))];
    if (names.length === 0) {
        return { file, action: "skipped", reason: "no env vars detected in code" };
    }
    if (fileExists(root, file) && !force) {
        return { file, action: "skipped", reason: "already exists (use --force)" };
    }
    const existed = fileExists(root, file);
    writeTextFile(root, file, buildEnvExample(usages));
    return { file, action: existed ? "updated" : "created" };
}
