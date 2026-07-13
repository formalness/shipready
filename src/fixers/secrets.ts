import path from "node:path";
import { scanContentForSecrets } from "../checks/secrets.js";
import type { SecretFinding } from "../types.js";
import { fileExists, readTextFile, writeTextFile } from "../utils/files.js";
import type { FixResult } from "./envExample.js";

/** File extensions where we know how to rewrite a string literal safely. */
const CODE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py",
]);

const QUOTES = new Set(["'", '"', "`"]);

/**
 * Converts an identifier (stripeKey, api_key, STRIPE_KEY) to
 * SCREAMING_SNAKE_CASE for use as an env var name.
 */
function toEnvName(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/** Names too vague to stand alone as env vars. */
const GENERIC_NAMES = new Set(["KEY", "TOKEN", "SECRET", "PASSWORD", "AUTH", "API_KEY"]);

/** Derives an env var name from the secret's kind ("GitHub token" -> GITHUB_TOKEN). */
function nameFromKind(kind: string): string {
  return toEnvName(kind);
}

/**
 * Derives an env var name from the code context: the identifier being
 * assigned right before the literal, falling back to the finding's kind.
 */
function deriveEnvName(linePrefix: string, kind: string): string {
  const m = linePrefix.match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*["']?\s*[:=]\s*$/);
  if (m) {
    const name = toEnvName(m[1]);
    // "key" or "token" alone says nothing - qualify it with the kind.
    if (GENERIC_NAMES.has(name)) return nameFromKind(kind);
    if (name.length >= 3) return name;
  }
  return nameFromKind(kind);
}

/** Builds the language-appropriate replacement expression. */
function replacementFor(file: string, envName: string): string {
  const ext = path.extname(file);
  if (ext === ".py") return `os.environ["${envName}"]`;
  // Non-null assertion keeps TS strict mode compiling; at runtime the
  // behavior matches plain JS (undefined if unset).
  if (ext === ".ts" || ext === ".tsx") return `process.env.${envName}!`;
  return `process.env.${envName}`;
}

/** True when the file is client-bundle code where env vars still leak. */
function looksLikeClientCode(content: string): boolean {
  return (
    /^\s*["']use client["']/m.test(content) || content.includes("import.meta.env")
  );
}

/** Ensures `import os` exists in a Python file, inserting it if needed. */
function ensurePythonOsImport(lines: string[]): void {
  if (lines.some((l) => /^\s*(import os\b|from os\b)/.test(l))) return;
  // Insert after shebang / encoding comments, before the first real line.
  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].startsWith("#!") || /^#.*coding[:=]/.test(lines[insertAt]))
  ) {
    insertAt++;
  }
  lines.splice(insertAt, 0, "import os");
}

export interface SecretFixOutcome {
  results: FixResult[];
  /** Env entries (name=value) that were added to .env. */
  envAdditions: Array<{ name: string; value: string }>;
  /** Findings that could not be fixed automatically, with reasons. */
  manual: Array<{ finding: SecretFinding; reason: string }>;
}

/**
 * Moves hardcoded secrets out of source code into .env, replacing each
 * literal with the language's env accessor.
 *
 * Safety rules - a replacement only happens when ALL hold, otherwise the
 * finding is reported for manual fixing:
 * - the file is a known code type (JS/TS family or Python)
 * - the file is not client-bundle code (env vars still ship to the browser)
 * - the secret is a COMPLETE quoted string literal, not a substring of one
 *   (a password inside a URL needs restructuring, not substitution)
 * - after rewriting, a re-scan of the file confirms the raw value is gone;
 *   if not, the file is restored untouched
 */
export function fixSecrets(
  root: string,
  secrets: SecretFinding[],
  dryRun = false
): SecretFixOutcome {
  const results: FixResult[] = [];
  const manual: SecretFixOutcome["manual"] = [];
  const envAdditions: Array<{ name: string; value: string }> = [];

  // Same raw value everywhere maps to one env var; name collisions with
  // different values get numeric suffixes.
  const valueToName = new Map<string, string>();
  const nameToValue = new Map<string, string>();

  // Pre-seed with existing .env so we never clobber an existing entry.
  const existingEnv = readTextFile(root, ".env") ?? "";
  for (const line of existingEnv.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) nameToValue.set(m[1], m[2]);
  }

  const claimName = (wanted: string, value: string): string => {
    const known = valueToName.get(value);
    if (known) return known;
    let name = wanted;
    let n = 2;
    while (nameToValue.has(name) && nameToValue.get(name) !== value) {
      name = `${wanted}_${n++}`;
    }
    valueToName.set(value, name);
    nameToValue.set(name, value);
    return name;
  };

  const byFile = new Map<string, SecretFinding[]>();
  for (const f of secrets) {
    if (!f.raw) continue;
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  for (const [file, findings] of byFile) {
    const ext = path.extname(file);
    if (!CODE_EXTENSIONS.has(ext)) {
      for (const f of findings) {
        manual.push({ finding: f, reason: `unsupported file type (${ext || "no extension"}) - move the value manually` });
      }
      continue;
    }

    const original = readTextFile(root, file);
    if (original === null) {
      for (const f of findings) manual.push({ finding: f, reason: "file unreadable" });
      continue;
    }

    if (looksLikeClientCode(original)) {
      for (const f of findings) {
        manual.push({
          finding: f,
          reason: "client-side code - an env var would still ship to the browser; move this call behind a server endpoint",
        });
      }
      continue;
    }

    const lines = original.split("\n");
    const fixedNames: string[] = [];
    let changed = false;

    // Bottom-up so earlier line numbers stay valid if we insert imports.
    const sorted = [...findings].sort((a, b) => b.line - a.line);
    for (const f of sorted) {
      const raw = f.raw as string;
      const lineIdx = f.line - 1;
      const line = lines[lineIdx];
      if (line === undefined) {
        manual.push({ finding: f, reason: "line not found (file changed since scan)" });
        continue;
      }

      const idx = line.indexOf(raw);
      if (idx === -1) {
        manual.push({ finding: f, reason: "value not found on its line (file changed since scan)" });
        continue;
      }

      const before = line[idx - 1];
      const after = line[idx + raw.length];
      const isWholeLiteral =
        before !== undefined && after !== undefined && before === after && QUOTES.has(before);
      if (!isWholeLiteral) {
        manual.push({
          finding: f,
          reason: "secret is embedded inside a larger string (e.g. a URL) - restructure it manually",
        });
        continue;
      }

      const envName = claimName(deriveEnvName(line.slice(0, idx - 1), f.kind), raw);
      const replacement = replacementFor(file, envName);
      lines[lineIdx] =
        line.slice(0, idx - 1) + replacement + line.slice(idx + raw.length + 1);
      envAdditions.push({ name: envName, value: raw });
      fixedNames.push(envName);
      changed = true;
    }

    if (!changed) continue;

    if (ext === ".py") ensurePythonOsImport(lines);
    const updated = lines.join("\n");

    // Verification gate: the raw values must be gone from a fresh scan.
    const stillLeaking = scanContentForSecrets(updated, file).some((s) =>
      findings.some((f) => f.raw === s.raw && fixedNames.length > 0)
    );
    const rawsGone = findings
      .filter((f) => f.raw && fixedNames.length > 0)
      .every((f) => !updated.includes(f.raw as string) || manual.some((m) => m.finding === f));
    if (stillLeaking || !rawsGone) {
      // Restore and report rather than half-fix.
      for (const f of findings) {
        manual.push({ finding: f, reason: "post-fix verification failed - file left untouched" });
      }
      // Roll back env additions for this file.
      for (const name of fixedNames) {
        const value = nameToValue.get(name);
        if (value !== undefined) {
          valueToName.delete(value);
          nameToValue.delete(name);
        }
        const i = envAdditions.findIndex((e) => e.name === name);
        if (i !== -1) envAdditions.splice(i, 1);
      }
      continue;
    }

    if (!dryRun) writeTextFile(root, file, updated);
    results.push({
      file,
      action: "updated",
      dryRun,
      preview: fixedNames.map((n) => `-> ${replacementFor(file, n)}`).join("\n"),
    });
  }

  // Write .env and .env.example additions.
  if (envAdditions.length > 0) {
    const uniqueAdditions = envAdditions.filter(
      (e, i) => envAdditions.findIndex((x) => x.name === e.name) === i
    );
    const newEnvLines = uniqueAdditions
      .filter((e) => !new RegExp(`^${e.name}=`, "m").test(existingEnv))
      .map((e) => `${e.name}=${e.value}`);
    if (newEnvLines.length > 0) {
      const envContent =
        existingEnv.length > 0
          ? existingEnv.replace(/\n*$/, "\n") + newEnvLines.join("\n") + "\n"
          : "# Managed by shipready - do not commit this file.\n" + newEnvLines.join("\n") + "\n";
      if (!dryRun) writeTextFile(root, ".env", envContent);
      results.push({
        file: ".env",
        action: existingEnv ? "updated" : "created",
        dryRun,
        preview: newEnvLines.map((l) => l.replace(/=.*/, "=***")).join("\n"),
      });
    }

    const existingExample = readTextFile(root, ".env.example") ?? "";
    const newExampleLines = uniqueAdditions
      .filter((e) => !new RegExp(`^${e.name}=`, "m").test(existingExample))
      .map((e) => `${e.name}=`);
    if (newExampleLines.length > 0) {
      const exampleContent =
        existingExample.length > 0
          ? existingExample.replace(/\n*$/, "\n") + newExampleLines.join("\n") + "\n"
          : newExampleLines.join("\n") + "\n";
      if (!dryRun) writeTextFile(root, ".env.example", exampleContent);
      results.push({
        file: ".env.example",
        action: fileExists(root, ".env.example") && existingExample ? "updated" : "created",
        dryRun,
        preview: newExampleLines.join("\n"),
      });
    }
  }

  return { results, envAdditions, manual };
}

/**
 * True when the project will pick up .env automatically at runtime; when
 * false the caller should tell the user how to load it.
 */
export function projectLoadsDotenv(root: string): boolean {
  const pkgRaw = readTextFile(root, "package.json");
  if (!pkgRaw) return false;
  try {
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["dotenv"] || deps["next"] || deps["vite"] || deps["@dotenvx/dotenvx"]);
  } catch {
    return false;
  }
}
