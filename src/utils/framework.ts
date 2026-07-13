import fs from "node:fs";
import path from "node:path";
import type { Framework, PackageJsonLike, PackageManager } from "../types.js";
import { fileExists } from "./files.js";

/**
 * Finds workspace package directories for monorepos. Reads patterns from
 * package.json "workspaces" and pnpm-workspace.yaml, expanding one level of
 * trailing-star globs ("apps/*"). Only dirs that contain a package.json
 * count - that's what makes them workspace packages.
 */
export function findWorkspaceDirs(root: string, pkg: PackageJsonLike | null): string[] {
  const patterns: string[] = [];

  const ws = pkg?.["workspaces"];
  if (Array.isArray(ws)) patterns.push(...(ws as string[]));
  else if (ws && typeof ws === "object" && Array.isArray((ws as { packages?: string[] }).packages)) {
    patterns.push(...((ws as { packages: string[] }).packages));
  }

  const pnpmWs = path.join(root, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWs)) {
    try {
      // Minimal YAML: only the common "packages:" list form is supported.
      const lines = fs.readFileSync(pnpmWs, "utf8").split("\n");
      let inPackages = false;
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith("packages:")) { inPackages = true; continue; }
        if (inPackages) {
          if (line.startsWith("- ")) patterns.push(line.slice(2).trim().replace(/^["']|["']$/g, ""));
          else if (line && !line.startsWith("#")) inPackages = false;
        }
      }
    } catch { /* unreadable yaml: treat as no workspaces */ }
  }

  const dirs = new Set<string>();
  const addPackagesUnder = (base: string, depth: number) => {
    const abs = path.join(root, base);
    if (!fs.existsSync(abs)) return;
    try {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "node_modules") continue;
        const rel = path.join(base, entry.name);
        if (fs.existsSync(path.join(root, rel, "package.json"))) dirs.add(rel);
        // "packages/**/*" style patterns nest one extra level (e.g. astro's
        // packages/integrations/react). Depth-capped to avoid crawling.
        else if (depth > 1) addPackagesUnder(rel, depth - 1);
      }
    } catch { /* unreadable dir */ }
  };

  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    if (pattern.includes("**")) {
      addPackagesUnder(pattern.slice(0, pattern.indexOf("**")).replace(/\/$/, ""), 3);
    } else if (pattern.endsWith("/*")) {
      addPackagesUnder(pattern.slice(0, -2), 1);
    } else if (fs.existsSync(path.join(root, pattern, "package.json"))) {
      dirs.add(pattern);
    }
  }

  // Repos without workspace config often still split into conventional
  // app dirs (frontend/ + backend/, client/ + server/). Treating those as
  // pseudo-workspaces makes env/script checks see the whole project.
  if (dirs.size === 0) {
    for (const conventional of ["frontend", "backend", "client", "server", "web", "app", "api"]) {
      if (fs.existsSync(path.join(root, conventional, "package.json"))) {
        dirs.add(conventional);
      }
    }
  }
  return [...dirs].sort();
}

/**
 * Detects non-JS languages living alongside the primary framework, so a
 * FastAPI + React template reads "Vite + Python" instead of hiding half
 * the project.
 */
export function detectExtraLanguages(root: string, framework: Framework): string[] {
  const markers: Array<[string, string]> = [
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["Gemfile", "Ruby"],
    ["composer.json", "PHP"],
  ];
  const found = new Set<string>();
  for (const [file, lang] of markers) {
    if (lang !== framework && fs.existsSync(path.join(root, file))) found.add(lang);
  }
  return [...found];
}

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
  sourceFiles: string[] = [],
  workspaceDirs: string[] = []
): Framework {
  if (pkg) {
    const deps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    // Monorepo roots rarely depend on the framework directly - check the
    // workspace packages so a Turborepo of Next.js apps reads "Next.js",
    // not "Node.js".
    if (root && workspaceDirs.length > 0 && !deps["next"] && !deps["react"] && !deps["vue"] && !deps["svelte"]) {
      for (const dir of workspaceDirs) {
        try {
          const wsPkg = JSON.parse(
            fs.readFileSync(path.join(root, dir, "package.json"), "utf8")
          ) as PackageJsonLike;
          const wsResult = detectFramework(wsPkg, undefined, []);
          if (wsResult !== "Node.js") return wsResult;
        } catch { /* skip unreadable workspace */ }
      }
    }
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
