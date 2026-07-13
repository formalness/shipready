import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { detectProject, runScan, scanFiles } from "./scanner.js";
import { loadConfig } from "./config.js";
import { fixAgentFiles } from "./fixers/agentFiles.js";
import { fixEnvExample, type FixResult } from "./fixers/envExample.js";
import { fixGitignore } from "./fixers/gitignore.js";
import { renderReport } from "./utils/report.js";
import { toSarif } from "./utils/sarif.js";
import { scanStaged } from "./checks/staged.js";
import { isGitRepo } from "./checks/history.js";

function printFixResults(results: FixResult[], showPreview = false): void {
  for (const r of results) {
    const verb = (v: string) => (r.dryRun ? `would ${v.replace(/ed$/, "e")}` : v);
    if (r.action === "created") {
      console.log(`${pc.green("+")} ${verb("created")} ${pc.bold(r.file)}`);
    } else if (r.action === "updated") {
      console.log(`${pc.yellow("~")} ${verb("updated")} ${pc.bold(r.file)}`);
    } else {
      console.log(`${pc.dim("-")} skipped ${r.file}${r.reason ? pc.dim(` (${r.reason})`) : ""}`);
    }
    if (showPreview && r.preview && r.action !== "skipped") {
      const lines = r.preview.trimEnd().split("\n");
      for (const l of lines) {
        console.log(pc.dim("    | ") + pc.green(l));
      }
    }
  }
}

/** Resolves and validates the target directory argument. */
function resolveRoot(dir: string | undefined): string {
  const root = path.resolve(dir ?? process.cwd());
  if (!fs.existsSync(root)) {
    throw new Error(`directory not found: ${root}`);
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }
  return root;
}

/** Applies all safe fixes for the given root; returns the results. */
async function applyFixes(root: string, force: boolean, dryRun = false): Promise<FixResult[]> {
  const config = loadConfig(root);
  const project = await detectProject(root, config);
  const { envUsages } = scanFiles(root, project.sourceFiles, config.secretAllowlist);
  return [
    fixEnvExample(root, envUsages, force, dryRun),
    fixGitignore(root, dryRun),
    ...fixAgentFiles(root, project, force, dryRun),
  ];
}

/** Reads the CLI's own version from its package.json (works from dist/ at runtime). */
function ownVersion(): string {
  try {
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json"
    );
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Builds the commander program. Exported for testing. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("shipready")
    .description("Pre-flight check for your repo before shipping.")
    .version(ownVersion());

  program
    .command("check")
    .description("Scan a project for shipping blockers")
    .argument("[path]", "project directory to scan (defaults to current directory)")
    .option("-v, --verbose", "show file locations for every finding")
    .option("--json", "output the raw report as JSON")
    .option("--sarif", "output the report as SARIF 2.1.0 for GitHub code scanning")
    .option("--fix", "apply safe fixes, then re-scan and show the improved report")
    .option("--history", "also scan the full git history for leaked secrets")
    .option("--verify", "check detected keys against provider APIs to see if they are live")
    .action(async (dir: string | undefined, opts: { verbose?: boolean; json?: boolean; sarif?: boolean; fix?: boolean; history?: boolean; verify?: boolean }) => {
      try {
        const root = resolveRoot(dir);
        const machineOutput = Boolean(opts.json || opts.sarif);
        const scanOpts = { history: opts.history, verify: opts.verify };
        if (opts.verify && !machineOutput) {
          console.log(pc.dim("\n  Verifying detected keys against provider APIs..."));
        }
        let report = await runScan(root, scanOpts);

        if (opts.fix) {
          const before = report.score;
          const results = await applyFixes(root, false);
          report = await runScan(root, scanOpts);

          if (!machineOutput) {
            console.log("");
            console.log(pc.bold(pc.magenta("shipready check --fix")));
            console.log("");
            printFixResults(results);
            console.log("");
            const delta = report.score - before;
            console.log(
              `Score: ${pc.bold(String(before))} -> ${pc.bold(String(report.score))}` +
                (delta > 0 ? pc.green(` (+${delta})`) : pc.dim(" (no change)"))
            );
          }
        }

        if (opts.sarif) {
          console.log(toSarif(report, ownVersion()));
        } else if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(renderReport(report, opts.verbose ?? false, ownVersion()));
        }
        // Non-zero exit when errors are present, useful for CI.
        const hasErrors = report.results.some((r) =>
          r.findings.some((f) => f.severity === "error")
        );
        process.exitCode = hasErrors ? 1 : 0;
      } catch (err) {
        console.error(pc.red(`shipready check failed: ${(err as Error).message}`));
        process.exitCode = 1;
      }
    });

  program
    .command("init")
    .description("Generate AI-agent instruction files (AGENTS.md, CLAUDE.md, Cursor rules)")
    .argument("[path]", "project directory (defaults to current directory)")
    .option("-f, --force", "overwrite existing files")
    .action(async (dir: string | undefined, opts: { force?: boolean }) => {
      try {
        const root = resolveRoot(dir);
        const project = await detectProject(root, loadConfig(root));
        console.log("");
        console.log(pc.bold(pc.magenta("shipready init")));
        console.log("");
        const results = fixAgentFiles(root, project, opts.force ?? false);
        printFixResults(results);
        const skipped = results.filter((r) => r.action === "skipped").length;
        if (skipped > 0 && !opts.force) {
          console.log("");
          console.log(pc.dim("Some files already exist. Re-run with --force to overwrite."));
        }
        console.log("");
      } catch (err) {
        console.error(pc.red(`shipready init failed: ${(err as Error).message}`));
        process.exitCode = 1;
      }
    });

  program
    .command("fix")
    .description("Apply safe automatic fixes (.env.example, .gitignore, agent files)")
    .argument("[path]", "project directory (defaults to current directory)")
    .option("-f, --force", "overwrite existing files")
    .option("--dry-run", "show what would change without writing anything")
    .action(async (dir: string | undefined, opts: { force?: boolean; dryRun?: boolean }) => {
      try {
        const root = resolveRoot(dir);
        const dryRun = opts.dryRun ?? false;

        console.log("");
        console.log(pc.bold(pc.magenta(`shipready fix${dryRun ? " --dry-run" : ""}`)));
        console.log("");

        const results = await applyFixes(root, opts.force ?? false, dryRun);
        printFixResults(results, dryRun);

        const changed = results.filter((r) => r.action !== "skipped").length;
        console.log("");
        if (dryRun) {
          console.log(
            changed > 0
              ? pc.yellow(`${changed} file${changed > 1 ? "s" : ""} would change. Run without --dry-run to apply.`)
              : pc.dim("Nothing to fix - everything already in place.")
          );
        } else {
          console.log(
            changed > 0
              ? pc.green(`${changed} file${changed > 1 ? "s" : ""} changed.`)
              : pc.dim("Nothing to fix - everything already in place.")
          );
        }
        console.log("");
      } catch (err) {
        console.error(pc.red(`shipready fix failed: ${(err as Error).message}`));
        process.exitCode = 1;
      }
    });

  program
    .command("staged")
    .description("Fast secrets-only scan of files staged for commit (pre-commit hook)")
    .argument("[path]", "project directory (defaults to current directory)")
    .action(async (dir: string | undefined) => {
      try {
        const root = resolveRoot(dir);
        if (!isGitRepo(root)) {
          console.error(pc.red("shipready staged: not a git repository"));
          process.exitCode = 1;
          return;
        }

        const config = loadConfig(root);
        const { files, secrets } = scanStaged(root, config.secretAllowlist);

        if (files.length === 0) {
          console.log(pc.dim("shipready staged: no staged files to scan."));
          return;
        }

        const high = secrets.filter((s) => s.confidence !== "medium");
        const medium = secrets.filter((s) => s.confidence === "medium");

        if (secrets.length === 0) {
          console.log(
            pc.green("✓") +
              ` shipready staged: ${files.length} file${files.length > 1 ? "s" : ""} clean.`
          );
          return;
        }

        console.log("");
        for (const s of high) {
          console.log(
            `${pc.red("✗")} ${s.kind}: ${s.masked} ${pc.dim(`${s.file}:${s.line}`)}`
          );
        }
        for (const s of medium) {
          console.log(
            `${pc.yellow("⚠")} ${s.kind}: ${s.masked} ${pc.dim(`${s.file}:${s.line}`)} ${pc.dim("(low confidence)")}`
          );
        }
        console.log("");

        if (high.length > 0) {
          console.log(
            pc.red(
              `Blocked: ${high.length} secret${high.length > 1 ? "s" : ""} in staged files. ` +
                `Remove them (or add // shipready-ignore for intentional values) and retry.`
            )
          );
          // Only high-confidence findings block the commit; medium is a warning.
          process.exitCode = 1;
        } else {
          console.log(pc.yellow("Warning only - commit not blocked."));
        }
      } catch (err) {
        console.error(pc.red(`shipready staged failed: ${(err as Error).message}`));
        process.exitCode = 1;
      }
    });

  return program;
}

/** CLI entry: parses argv and runs the matching command. */
export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
