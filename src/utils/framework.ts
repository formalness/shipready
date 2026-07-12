import type { Framework, PackageJsonLike, PackageManager } from "../types.js";
import { fileExists } from "./files.js";

/** Detects the package manager based on lockfiles. */
export function detectPackageManager(root: string): PackageManager {
  if (fileExists(root, "pnpm-lock.yaml")) return "pnpm";
  if (fileExists(root, "yarn.lock")) return "yarn";
  if (fileExists(root, "bun.lockb") || fileExists(root, "bun.lock")) return "bun";
  if (fileExists(root, "package-lock.json")) return "npm";
  return "unknown";
}

/** Detects the framework from package.json dependencies. */
export function detectFramework(pkg: PackageJsonLike | null): Framework {
  if (!pkg) return "unknown";
  const deps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  // Order matters: meta-frameworks before their underlying libraries.
  if (deps["next"]) return "Next.js";
  if (deps["@nestjs/core"]) return "NestJS";
  if (deps["nuxt"] || deps["vue"]) return "Vue";
  if (deps["svelte"] || deps["@sveltejs/kit"]) return "Svelte";
  if (deps["vite"] && deps["react"]) return "Vite";
  if (deps["vite"]) return "Vite";
  if (deps["react"]) return "React";
  if (deps["express"]) return "Express";
  return "Node.js";
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
    case "npm":
    case "unknown":
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
    case "npm":
    case "unknown":
      return `npm run ${script}`;
  }
}
