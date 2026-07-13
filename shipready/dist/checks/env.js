import { fileExists, readTextFile } from "../utils/files.js";
const ENV_USAGE_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
/** Built-in variables that don't need to be in .env.example. */
const BUILTIN_VARS = new Set([
    "NODE_ENV",
    "CI",
    "PORT",
    "HOME",
    "PATH",
    "PWD",
    "TZ",
    "MODE",
    "DEV",
    "PROD",
    "SSR",
    "BASE_URL",
]);
/** Extracts `process.env` / `import.meta.env` variable usages from source code. */
export function extractEnvUsages(content, file) {
    const usages = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        for (const re of [ENV_USAGE_RE, IMPORT_META_ENV_RE]) {
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(lines[i])) !== null) {
                const name = match[1];
                if (!BUILTIN_VARS.has(name)) {
                    usages.push({ name, file, line: i + 1 });
                }
            }
        }
    }
    return usages;
}
/** Parses variable names from a dotenv-format file. */
export function parseEnvKeys(content) {
    const keys = [];
    for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const eq = line.indexOf("=");
        if (eq <= 0)
            continue;
        const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
            keys.push(key);
    }
    return keys;
}
/** Values in .env.example that look like real secrets rather than placeholders. */
export function findRealLookingExampleValues(content) {
    const suspicious = [];
    for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const eq = line.indexOf("=");
        if (eq <= 0)
            continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!value)
            continue;
        const lower = value.toLowerCase();
        const placeholder = lower.includes("your") ||
            lower.includes("example") ||
            lower.includes("placeholder") ||
            lower.includes("changeme") ||
            lower.includes("xxx") ||
            lower.includes("<") ||
            lower === "true" ||
            lower === "false" ||
            /^\d+$/.test(value) ||
            value.length < 8;
        // Long, high-entropy-looking values that aren't placeholders
        if (!placeholder && /^[A-Za-z0-9+/_.-]{20,}$/.test(value)) {
            suspicious.push(key);
        }
    }
    return suspicious;
}
/** Checks .env / .env.example / gitignore safety around env vars. */
export function checkEnv(root, envUsages) {
    const findings = [];
    const hasEnv = fileExists(root, ".env");
    const exampleContent = readTextFile(root, ".env.example") ?? readTextFile(root, ".env.sample");
    const hasExample = exampleContent !== null;
    const gitignore = readTextFile(root, ".gitignore") ?? "";
    const usedVars = [...new Set(envUsages.map((u) => u.name))];
    // .env should be gitignored if it exists
    if (hasEnv) {
        const ignored = gitignore
            .split("\n")
            .map((l) => l.trim())
            .some((l) => l === ".env" || l === ".env*" || l === "*.env");
        if (ignored) {
            findings.push({
                severity: "success",
                rule: "env.ignored",
                message: ".env is ignored by git",
            });
        }
        else {
            findings.push({
                severity: "error",
                rule: "env.not-ignored",
                message: ".env is not ignored by git",
            });
        }
    }
    // .env.example presence
    if (usedVars.length > 0 && !hasExample) {
        findings.push({
            severity: "error",
            rule: "env.example-missing",
            message: `.env.example missing (${usedVars.length} env var${usedVars.length > 1 ? "s" : ""} used in code)`,
        });
    }
    else if (hasExample) {
        findings.push({
            severity: "success",
            rule: "env.example-found",
            message: ".env.example found",
        });
        // Are all used vars documented?
        const exampleKeys = new Set(parseEnvKeys(exampleContent));
        const undocumented = usedVars.filter((v) => !exampleKeys.has(v));
        if (undocumented.length > 0) {
            findings.push({
                severity: "warning",
                rule: "env.example-incomplete",
                message: `.env.example missing variables: ${undocumented.join(", ")}`,
            });
        }
        // Real-looking secrets in the example file?
        const leaky = findRealLookingExampleValues(exampleContent);
        if (leaky.length > 0) {
            findings.push({
                severity: "warning",
                rule: "env.example-real-values",
                message: `.env.example has real-looking values for: ${leaky.join(", ")}`,
            });
        }
    }
    else if (usedVars.length === 0) {
        findings.push({
            severity: "info",
            rule: "env.none-used",
            message: "No environment variables detected in code",
        });
    }
    return { name: "env", findings };
}
