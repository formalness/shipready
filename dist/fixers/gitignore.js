import { missingIgnoreEntries } from "../checks/gitignore.js";
import { readTextFile, writeTextFile } from "../utils/files.js";
/** Adds missing important entries to .gitignore (creates it if absent). */
export function fixGitignore(root) {
    const file = ".gitignore";
    const existing = readTextFile(root, file);
    if (existing === null) {
        const content = [
            "# Added by shipready",
            ".env",
            ".env.local",
            "node_modules",
            "dist",
            "build",
            ".next",
            "",
        ].join("\n");
        writeTextFile(root, file, content);
        return { file, action: "created" };
    }
    const missing = missingIgnoreEntries(existing);
    if (missing.length === 0) {
        return { file, action: "skipped", reason: "already complete" };
    }
    const suffix = existing.endsWith("\n") ? "" : "\n";
    const addition = `${suffix}\n# Added by shipready\n${missing.join("\n")}\n`;
    writeTextFile(root, file, existing + addition);
    return { file, action: "updated" };
}
