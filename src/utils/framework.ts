import type { Framework, PackageJsonLike, PackageManager } from "../types.js";
import { fileExists } from "./files.js";

/** Detects the package manager based on lockfiles and manifests. */
export function detectPackageManager(root: string): PackageManager {
  // Node ecosystems (lockfile wins over manifest)
  if (fileExists(root, "pnpm-lock.yaml")) return "pnpm";
  if (fileExists(root, "yarn.lock")) return "yarn";
  if (fileExists(root, "bun.lockb") || fileExists(root, "bun.lock")) return "bun";
  if (fileExists(root, "package-lock.json")) return "npm";
  if (fileExists(root, "deno.json") || fileExists(root, "deno.jsonc")) return "deno";
  // package.json without a lockfile is still an npm-family project
  if (fileExists(root, "package.json")) return "npm";

  // Other ecosystems
  if (fileExists(root, "uv.lock")) return "uv";
  if (fileExists(root, "poetry.lock")) return "poetry";
  if (
    fileExists(root, "requirements.txt") ||
    fileExists(root, "pyproject.toml") ||
    fileExists(root, "Pipfile")
  ) {
    return "pip";
  }
  if (fileExists(root, "Cargo.toml")) return "cargo";
  if (fileExists(root, "go.mod")) return "go";
  if (fileExists(root, "composer.json")) return "composer";
  if (fileExists(root, "Gemfile")) return "bundler";

  return "none";
}

/** Counts source files matching any of the given extensions. */
function countByExt(files: string[], exts: string[]): number {
  return files.filter((f) => exts.some((e) => f.toLowerCase().endsWith(e))).length;
}

/**
 * Detects the framework/project type. Checks package.json dependencies
 * first, then falls back to manifest files and source file extensions so
 * that static sites, Python, Go, Rust, PHP, and Ruby projects are
 * identified instead of reported as "unknown".
 */
export function detectFramework(
  pkg: PackageJsonLike | null,
  root?: string,
  sourceFiles: string[] = []
): Framework {
  if (pkg) {
    const deps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    // Order matters: meta-frameworks before their underlying libraries.
    if (deps["next"]) return "Next.js";
    if (deps["astro"]) return "Astro";
    if (deps["@remix-run/react"] || deps["@remix-run/node"]) return "Remix";
    if (deps["@angular/core"]) return "Angular";
    if (deps["gatsby"]) return "Gatsby";
    if (deps["@nestjs/core"]) return "NestJS";
    if (deps["nuxt"] || deps["vue"]) return "Vue";
    if (deps["svelte"] || deps["@sveltejs/kit"]) return "Svelte";
    if (deps["vite"]) return "Vite";
    if (deps["react"]) return "React";
    if (deps["express"]) return "Express";
    return "Node.js";
  }

  // No package.json: detect by manifests, then by dominant file type.
  if (root) {
    if (fileExists(root, "deno.json") || fileExists(root, "deno.jsonc")) return "Deno";
    if (
      fileExists(root, "pyproject.toml") ||
      fileExists(root, "requirements.txt") ||
      fileExists(root, "Pipfile")
    ) {
      return "Python";
    }
    if (fileExists(root, "Cargo.toml")) return "Rust";
    if (fileExists(root, "go.mod")) return "Go";
    if (fileExists(root, "composer.json")) return "PHP";
    if (fileExists(root, "Gemfile")) return "Ruby";
    if (fileExists(root, "pom.xml") || fileExists(root, "build.gradle") || fileExists(root, "build.gradle.kts")) {
      return "Java";
    }
  }

  const html = countByExt(sourceFiles, [".html", ".htm"]);
  const py = countByExt(sourceFiles, [".py"]);
  const go = countByExt(sourceFiles, [".go"]);
  const rs = countByExt(sourceFiles, [".rs"]);
  const php = countByExt(sourceFiles, [".php"]);
  const rb = countByExt(sourceFiles, [".rb"]);
  const js = countByExt(sourceFiles, [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

  const counts: Array<[Framework, number]> = [
    ["Python", py],
    ["Go", go],
    ["Rust", rs],
    ["PHP", php],
    ["Ruby", rb],
  ];
  const [lang, max] = counts.reduce((a, b) => (b[1] > a[1] ? b : a), ["unknown" as Framework, 0]);
  // A language wins only when it clearly dominates over HTML/JS glue files.
  if (max > 0 && max >= html && max >= js) return lang;

  // HTML pages with (or without) plain JS assets: a static site.
  if (html > 0) return "Static HTML";
  if (js > 0) return "Node.js";

  return "unknown";
}

/** True when the project belongs to the npm/Node ecosystem. */
export function isNodeEcosystem(framework: Framework): boolean {
  return ![
    "Static HTML",
    "Python",
    "Go",
    "Rust",
    "PHP",
    "Ruby",
    "Java",
    "Deno",
    "unknown",
  ].includes(framework);
}

/** Returns the install command for a given package manager. */
export function installCommand(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    case "poetry":
      return "poetry install";
    case "uv":
      return "uv sync";
    case "pip":
      return "pip install -r requirements.txt";
    case "cargo":
      return "cargo build";
    case "go":
      return "go mod download";
    case "composer":
      return "composer install";
    case "bundler":
      return "bundle install";
    default:
      return "npm install";
  }
}

/** Returns the run command prefix for a given package manager. */
export function runCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}
