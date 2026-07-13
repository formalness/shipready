/** Severity levels for findings. */
export type Severity = "error" | "warning" | "info" | "success";

/** A single finding produced by a check. */
export interface Finding {
  severity: Severity;
  /** Short id for the rule, e.g. "env.example-missing" */
  rule: string;
  /** Human readable message */
  message: string;
  /** Relative file path, if applicable */
  file?: string;
  /** 1-based line number, if applicable */
  line?: number;
}

/** Result of a single check module. */
export interface CheckResult {
  name: string;
  findings: Finding[];
}

export type PackageManager =
  | "npm"
  | "pnpm"
  | "yarn"
  | "bun"
  | "deno"
  | "pip"
  | "poetry"
  | "uv"
  | "cargo"
  | "go"
  | "composer"
  | "bundler"
  | "none"
  | "unknown";

export type Framework =
  | "Next.js"
  | "Astro"
  | "Remix"
  | "Angular"
  | "Gatsby"
  | "Vite"
  | "React"
  | "Vue"
  | "Svelte"
  | "Express"
  | "NestJS"
  | "Node.js"
  | "Deno"
  | "Static HTML"
  | "Python"
  | "Go"
  | "Rust"
  | "PHP"
  | "Ruby"
  | "Java"
  | "unknown";

/** Info detected from the project. */
export interface ProjectInfo {
  root: string;
  hasPackageJson: boolean;
  packageJson: PackageJsonLike | null;
  packageManager: PackageManager;
  framework: Framework;
  scripts: Record<string, string>;
  /** Source files found during scan (relative paths). */
  sourceFiles: string[];
  /** Workspace package dirs (relative) when the repo is a monorepo. */
  workspaceDirs: string[];
}

export interface PackageJsonLike {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Full report returned by the scanner. */
export interface Report {
  project: ProjectInfo;
  results: CheckResult[];
  score: number;
}

/** A detected process.env variable usage. */
export interface EnvUsage {
  name: string;
  file: string;
  line: number;
}

/** A detected potential secret. */
export interface SecretFinding {
  kind: string;
  file: string;
  line: number;
  masked: string;
  /** high -> error, medium -> warning. Defaults to high when absent. */
  confidence?: "high" | "medium";
  /**
   * Raw matched value. Kept in memory only for --verify; never printed,
   * never serialized into the report.
   */
  raw?: string;
  /** Result of live verification against the provider API. */
  verified?: "active" | "inactive" | "unknown";
  /** Where the secret was found. Defaults to the working tree. */
  source?: "working-tree" | "history";
  /** Commit hash (abbreviated) for history findings. */
  commit?: string;
}
