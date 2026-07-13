import fs from "node:fs";
import path from "node:path";
import type { CheckResult, Finding, PackageJsonLike, ProjectInfo } from "../types.js";
import { fileExists } from "../utils/files.js";
import { isNodeEcosystem } from "../utils/framework.js";

const IMPORTANT_SCRIPTS = ["dev", "build", "test", "lint"] as const;

/** Linter configs that count as lint coverage even without a lint script. */
const LINTER_CONFIGS = [
  "biome.json",
  "biome.jsonc",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
];

/** Checks package.json existence and important scripts. */
export function checkPackageJson(project: ProjectInfo): CheckResult {
  const findings: Finding[] = [];

  if (!project.hasPackageJson) {
    // Static sites, Python, Go, Rust, etc. don't need a package.json -
    // penalizing them for it would be unfair noise.
    if (!isNodeEcosystem(project.framework)) {
      findings.push({
        severity: "info",
        rule: "package-json.not-applicable",
        message: `package.json not required for a ${project.framework} project`,
      });
      return { name: "package.json", findings };
    }
    findings.push({
      severity: "error",
      rule: "package-json.missing",
      message: "package.json missing",
    });
    return { name: "package.json", findings };
  }

  findings.push({
    severity: "success",
    rule: "package-json.found",
    message: "package.json found",
  });

  const hasLinterConfig = LINTER_CONFIGS.some((f) => fileExists(project.root, f));

  // Published libraries (a "files" allowlist, not private) ship source, not
  // a running app - requiring dev/build scripts of e.g. express is noise.
  const pkg = project.packageJson;
  const isLibrary =
    Array.isArray(pkg?.["files"]) && pkg?.["private"] !== true;

  // In monorepos the scripts live in workspace packages, not the root.
  const workspaceScripts = new Set<string>();
  for (const dir of project.workspaceDirs ?? []) {
    try {
      const wsPkg = JSON.parse(
        fs.readFileSync(path.join(project.root, dir, "package.json"), "utf8")
      ) as PackageJsonLike;
      for (const name of Object.keys(wsPkg.scripts ?? {})) workspaceScripts.add(name);
    } catch { /* skip unreadable workspace */ }
  }

  const missing = IMPORTANT_SCRIPTS.filter((s) => {
    if (project.scripts[s]) return false;
    if (workspaceScripts.has(s)) return false;
    if (isLibrary && (s === "dev" || s === "build")) return false;
    // A biome/eslint config means linting is set up; the script name is
    // a convention, not a requirement (e.g. Biome repos run "biome check").
    if (s === "lint" && hasLinterConfig) return false;
    return true;
  });
  if (missing.length > 0) {
    findings.push({
      severity: "warning",
      rule: "scripts.missing",
      message: `Missing script${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    });
  } else {
    findings.push({
      severity: "success",
      rule: "scripts.found",
      message: "All important scripts present (dev, build, test, lint)",
    });
  }

  return { name: "package.json", findings };
}
