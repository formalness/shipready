import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { detectProject, runScan, scanFiles } from "./scanner.js";
import { loadConfig } from "./config.js";
import { fixAgentFiles } from "./fixers/agentFiles.js";
import { fixEnvExample, type FixResult } from "./fixers/envExample.js";
import { fixGitignore } from "./fixers/gitignore.js";
import { renderReport } from "./utils/report.js";

function printFixResults(results: FixResult[]): void {
  for (const r of results) {
    if (r.action === "created") {
      console.log(`${pc.green("+")} created ${pc.bold(r.file)}`);
    } else if (r.action === "updated") {
      console.log(`${pc.yellow("~")} updated ${pc.bold(r.file)}`);
    } else {
      console.log(`${pc.dim("-")} skipped ${r.file}${r.reason ? pc.dim(` (${r.reason})`) : ""}`);
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
async function applyFixes(root: string, force: boolean): Promise<FixResult[]> {
  const config = loadConfig(root);
  const project = await detectProject(root, config);
  const { envUsages } = scanFiles(root, project.sourceFiles, config.secretAllowlist);
  return [
    fixEnvExample(root, envUsages, force),
    fixGitignore(root),
    ...fixAgentFiles(root, project, force),
  ];
}

/** Reads the CLI's own version from its package.json (works from dist/ at runtime). */
function ownVersion(): string {
  try {
    const pkgPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
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
    .option("--fix", "apply safe fixes, then re-scan and show the improved report")
    .action(async (dir: string | undefined, opts: { verbose?: boolean; json?: boolean; fix?: boolean }) => {
      try {
        const root = resolveRoot(dir);
        let report = await runScan(root);

        if (opts.fix) {
          const before = report.score;
          const results = await applyFixes(root, false);
          report = await runScan(root);

          if (!opts.json) {
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

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(renderReport(report, opts.verbose ?? false));
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
    .action(async (dir: string | undefined, opts: { force?: boolean }) => {
      try {
        const root = resolveRoot(dir);

        console.log("");
        console.log(pc.bold(pc.magenta("shipready fix")));
        console.log("");

        const results = await applyFixes(root, opts.force ?? false);
        printFixResults(results);

        const changed = results.filter((r) => r.action !== "skipped").length;
        console.log("");
        console.log(
          changed > 0
            ? pc.green(`${changed} file${changed > 1 ? "s" : ""} changed.`)
            : pc.dim("Nothing to fix - everything already in place.")
        );
        console.log("");
      } catch (err) {
        console.error(pc.red(`shipready fix failed: ${(err as Error).message}`));
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
