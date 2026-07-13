import path from "node:path";
import type {
  CheckResult,
  EnvUsage,
  PackageJsonLike,
  ProjectInfo,
  Report,
  SecretFinding,
} from "./types.js";
import { checkEnv, extractEnvUsages } from "./checks/env.js";
import { checkGitignore } from "./checks/gitignore.js";
import { checkPackageJson } from "./checks/packageJson.js";
import { checkReadme } from "./checks/readme.js";
import { checkSecrets, scanContentForSecrets } from "./checks/secrets.js";
import { checkHistory, isGitRepo, scanGitHistory } from "./checks/history.js";
import { verifySecrets } from "./checks/verify.js";
import { checkTodos, scanContentForTodos, type TodoFinding } from "./checks/todos.js";
import {
  fileExists,
  findSourceFiles,
  isProbablyBinary,
  readJsonFile,
  readTextFile,
} from "./utils/files.js";
import { detectExtraLanguages, detectFramework, detectPackageManager, findWorkspaceDirs } from "./utils/framework.js";
import { isRuleDisabled, loadConfig, type ShipreadyConfig } from "./config.js";

/** File extensions considered code for content scanning (not config/data). */
const CODE_ONLY = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
  ".vue", ".svelte", ".py", ".rb", ".go", ".rs", ".java", ".php",
  // Inline <script> in static sites carries console.log/TODO noise too
  ".html", ".htm",
]);

/** Gathers structured project info from the given root. */
export async function detectProject(
  root: string,
  config?: ShipreadyConfig
): Promise<ProjectInfo> {
  const pkg = readJsonFile<PackageJsonLike>(root, "package.json");
  const sourceFiles = await findSourceFiles(root, config?.ignore ?? []);
  const workspaceDirs = findWorkspaceDirs(root, pkg);

  return {
    root,
    hasPackageJson: fileExists(root, "package.json"),
    packageJson: pkg,
    packageManager: detectPackageManager(root),
    framework: detectFramework(pkg, root, sourceFiles, workspaceDirs),
    scripts: pkg?.scripts ?? {},
    sourceFiles,
    workspaceDirs,
    extraLanguages: detectExtraLanguages(root, detectFramework(pkg, root, sourceFiles, workspaceDirs)),
  };
}

/** Extracts env usages, secrets, and todos from all source files. */
export function scanFiles(
  root: string,
  files: string[],
  secretAllowlist: string[] = []
): {
  envUsages: EnvUsage[];
  secrets: SecretFinding[];
  todos: TodoFinding[];
} {
  const envUsages: EnvUsage[] = [];
  const secrets: SecretFinding[] = [];
  const todos: TodoFinding[] = [];

  /**
   * Directories where console.log and friends are intentional (demo code,
   * benchmarks, scripts). Secrets are still scanned there - a leaked key in
   * an example is just as dangerous - but hygiene noise is skipped.
   */
  const HYGIENE_EXEMPT_RE =
    /(?:^|\/)(?:examples?|demos?|benchmarks?|scripts?|playground)\//;

  /**
   * Standard env file names that legitimately hold real values and are
   * expected to be gitignored - the env check owns those. Anything else
   * that merely starts with ".env" (.env.backup, .env.old, .env.prod)
   * is a copy someone made and MUST be scanned: benchmark testing showed
   * gitleaks catches committed .env backups while we used to skip them.
   */
  const STANDARD_ENV_RE =
    /^\.env(?:\.(?:local|development|production|test|staging))?(?:\.local)?$/;

  for (const file of files) {
    const base = path.basename(file);
    const isStandardEnv = STANDARD_ENV_RE.test(base);
    const isEnvTemplate = base === ".env.example" || base === ".env.sample" || base === ".env.template";
    const ext = path.extname(file).toLowerCase();
    const isCode = CODE_ONLY.has(ext);

    if (isProbablyBinary(root, file)) continue;
    const content = readTextFile(root, file);
    if (content === null) continue;

    if (isCode) {
      envUsages.push(...extractEnvUsages(content, file));
      if (!HYGIENE_EXEMPT_RE.test(file)) {
        todos.push(...scanContentForTodos(content, file));
      }
    }
    if (!isStandardEnv && !isEnvTemplate) {
      secrets.push(...scanContentForSecrets(content, file, secretAllowlist));
    }
  }

  return { envUsages, secrets, todos };
}

/** A single score deduction with its human-readable reason. */
export interface ScoreDeduction {
  reason: string;
  points: number;
}

/**
 * Score deductions per the shipready scoring model. Returns the breakdown
 * so users can see exactly where every point went instead of trusting an
 * opaque number.
 */
export function calculateScoreBreakdown(results: CheckResult[]): {
  score: number;
  deductions: ScoreDeduction[];
} {
  const all = results.flatMap((r) => r.findings);
  const has = (rule: string) => all.some((f) => f.rule === rule);
  const count = (rule: string) => all.filter((f) => f.rule === rule).length;
  const deductions: ScoreDeduction[] = [];
  const deduct = (points: number, reason: string) => {
    if (points > 0) deductions.push({ reason, points });
  };

  if (has("package-json.missing")) deduct(20, "no package.json");
  if (has("readme.missing")) deduct(15, "no README");
  if (has("readme.weak")) deduct(8, "weak README");

  // Missing scripts: look at message to determine which ones
  const scriptsFinding = all.find((f) => f.rule === "scripts.missing");
  if (scriptsFinding) {
    if (scriptsFinding.message.includes("build")) deduct(8, "no build script");
    if (scriptsFinding.message.includes("test")) deduct(6, "no test script");
  }

  if (has("env.example-missing")) deduct(10, ".env.example missing");
  if (has("env.not-ignored")) deduct(15, ".env not ignored");

  const secretCount = count("secrets.detected-item");
  deduct(
    Math.min(secretCount * 25, 50),
    secretCount === 1 ? "hardcoded secret" : `hardcoded secrets (${secretCount})`
  );

  const historyCount = count("history.secret-item");
  deduct(
    Math.min(historyCount * 10, 30),
    historyCount === 1 ? "secret in git history" : `secrets in git history (${historyCount})`
  );

  const todoCount = count("todos.item");
  deduct(
    Math.min(todoCount * 2, 15),
    todoCount === 1 ? "TODO comment" : `TODO comments (${todoCount})`
  );

  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  return { score: Math.max(0, 100 - total), deductions };
}

/** Score per the shipready scoring model (see calculateScoreBreakdown). */
export function calculateScore(results: CheckResult[]): number {
  return calculateScoreBreakdown(results).score;
}

/** Removes findings whose rules are disabled by config. */
function applyDisabledRules(
  results: CheckResult[],
  disableRules: string[]
): CheckResult[] {
  if (disableRules.length === 0) return results;
  return results.map((r) => ({
    ...r,
    findings: r.findings.filter(
      (f) => !isRuleDisabled(f.rule, disableRules) && !isRuleDisabled(r.name, disableRules)
    ),
  }));
}

/** Options for runScan. */
export interface ScanOptions {
  /** Also scan the full git history for secrets. */
  history?: boolean;
  /** Verify detected keys against provider APIs (network calls). */
  verify?: boolean;
}

/** Runs the full scan and returns a structured report. */
export async function runScan(root: string, options: ScanOptions = {}): Promise<Report> {
  const config = loadConfig(root);
  const project = await detectProject(root, config);
  const { envUsages, secrets, todos } = scanFiles(
    root,
    project.sourceFiles,
    config.secretAllowlist
  );

  let historySecrets: SecretFinding[] = [];
  let historyScanned = false;
  if (options.history) {
    historyScanned = isGitRepo(root);
    if (historyScanned) {
      historySecrets = scanGitHistory(root, config.secretAllowlist, secrets);
    }
  }

  if (options.verify) {
    await verifySecrets([...secrets, ...historySecrets]);
  }

  const rawResults: CheckResult[] = [
    checkPackageJson(project),
    checkReadme(root),
    checkEnv(root, envUsages, project.workspaceDirs),
    checkSecrets(secrets),
    ...(options.history ? [checkHistory(historySecrets, historyScanned)] : []),
    checkTodos(todos),
    checkGitignore(root, project.framework, {
      hasBuildScript: Boolean(project.scripts["build"]),
      usesEnv: envUsages.length > 0,
    }),
  ];

  // Disabled rules are removed before scoring so they don't affect the score.
  const results = applyDisabledRules(rawResults, config.disableRules);

  return {
    project,
    results,
    ...calculateScoreBreakdown(results),
  };
}
