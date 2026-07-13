import pc from "picocolors";
import type { Finding, Report, Severity } from "../types.js";

const ICONS: Record<Severity, string> = {
  success: pc.green("\u2713"),
  error: pc.red("\u2717"),
  warning: pc.yellow("\u26a0"),
  info: pc.cyan("\u2139"),
};

/** Inner width of the report layout (visible characters). */
const WIDTH = 56;

/** Visible length of a string, ignoring ANSI escape codes. */
function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/** Pads a string (which may contain ANSI codes) to a visible width. */
function padVisible(s: string, width: number): string {
  const len = visibleLength(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

/** Draws a rounded box around the given lines. */
function box(lines: string[]): string[] {
  const top = pc.dim("\u256d" + "\u2500".repeat(WIDTH + 2) + "\u256e");
  const bottom = pc.dim("\u2570" + "\u2500".repeat(WIDTH + 2) + "\u256f");
  const body = lines.map(
    (l) => `${pc.dim("\u2502")} ${padVisible(l, WIDTH)} ${pc.dim("\u2502")}`
  );
  return [top, ...body, bottom];
}

/** Renders the score progress bar. */
function scoreBar(score: number): string {
  const total = 28;
  const filled = Math.max(0, Math.min(total, Math.round((score / 100) * total)));
  const fill = "\u2588".repeat(filled);
  const rest = "\u2591".repeat(total - filled);
  const painted =
    score >= 85 ? pc.green(fill) : score >= 60 ? pc.yellow(fill) : pc.red(fill);
  return painted + pc.dim(rest);
}

function scoreLabel(score: number): string {
  const label = `${score}/100`;
  if (score >= 85) return pc.bold(pc.green(label));
  if (score >= 60) return pc.bold(pc.yellow(label));
  return pc.bold(pc.red(label));
}

function verdict(score: number): string {
  if (score >= 85) return pc.green("ready to ship");
  if (score >= 60) return pc.yellow("almost there");
  return pc.red("not ready to ship");
}

/** Human-friendly labels for check names. */
const CHECK_LABELS: Record<string, string> = {
  "package.json": "package.json",
  README: "README",
  env: "Env safety",
  secrets: "Secrets",
  todos: "Code hygiene",
  gitignore: ".gitignore",
  "git-history": "Git history",
};

function colorFor(severity: Severity, text: string): string {
  switch (severity) {
    case "success":
      return pc.green(text);
    case "error":
      return pc.red(text);
    case "warning":
      return pc.yellow(text);
    case "info":
      return pc.cyan(text);
  }
}

/** Builds recommended next steps from findings, highest severity first. */
export function nextSteps(report: Report): string[] {
  const steps: string[] = [];
  const all = report.results.flatMap((r) => r.findings);

  const has = (rule: string) => all.some((f) => f.rule === rule);

  if (has("secrets.verified-active"))
    steps.push("A key was VERIFIED ACTIVE - rotate it right now");
  if (has("package-json.missing")) steps.push("Add a package.json (npm init -y)");
  if (has("secrets.detected")) steps.push("Rotate and remove hardcoded secrets immediately");
  if (has("history.secret"))
    steps.push("Purge leaked secrets from git history (BFG or git filter-repo) and rotate them");
  if (has("env.not-ignored")) steps.push("Add .env to .gitignore");
  if (has("env.example-missing")) steps.push("Create .env.example (run: shipready fix)");
  if (has("env.example-incomplete")) steps.push("Add missing variables to .env.example");
  if (has("readme.missing")) steps.push("Write a README with setup instructions");
  if (has("readme.weak")) steps.push("Expand README with installation and usage sections");
  if (has("gitignore.missing")) steps.push("Create a .gitignore (run: shipready fix)");
  if (has("gitignore.incomplete")) steps.push("Add missing entries to .gitignore (run: shipready fix)");
  if (has("scripts.missing")) steps.push("Add missing package.json scripts (build/test/lint)");
  if (has("todos.debug")) steps.push("Remove debug logs and debugger statements before shipping");
  if (has("todos.markers")) steps.push("Resolve TODO/FIXME comments or track them as issues");

  return steps;
}

/** Worst severity across a set of findings (error > warning > info > success). */
function worst(findings: Finding[]): Severity {
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  if (findings.some((f) => f.severity === "info")) return "info";
  return "success";
}

/** Renders the full report to a printable string. */
export function renderReport(report: Report, verbose = false, version?: string): string {
  const lines: string[] = [];
  const { project } = report;

  const title = pc.bold(pc.magenta("shipready")) + (version ? pc.dim(` v${version}`) : "");
  const pmLabel =
    project.packageManager === "none" || project.packageManager === "unknown"
      ? pc.dim("\u2014")
      : project.packageManager;
  const meta =
    pc.dim("project ") +
    project.framework +
    (project.extraLanguages.length > 0 ? " + " + project.extraLanguages.join(" + ") : "") +
    pc.dim("  \u00b7  ") +
    pc.dim("pm ") +
    pmLabel;

  lines.push("");
  lines.push(...box([title, meta]));
  lines.push("");
  lines.push(
    `  ${pc.bold("Score")}  ${scoreBar(report.score)}  ${scoreLabel(report.score)}  ${verdict(report.score)}`
  );
  if (report.deductions.length > 0) {
    lines.push(
      "  " +
        pc.dim(
          report.deductions
            .map((d) => `-${d.points} ${d.reason}`)
            .join("  \u00b7  ")
        )
    );
  }
  lines.push("");

  // Aligned checks table: one row per check, then its top-level findings.
  const labelWidth = Math.max(
    ...report.results.map((r) => (CHECK_LABELS[r.name] ?? r.name).length)
  );

  for (const result of report.results) {
    const label = CHECK_LABELS[result.name] ?? result.name;
    const summaryFindings = result.findings.filter((f) => !f.file);
    const status = worst(result.findings);

    if (summaryFindings.length === 0) {
      lines.push(
        `  ${ICONS[status]} ${pc.bold(padVisible(label, labelWidth))}  ${pc.dim("ok")}`
      );
      continue;
    }

    summaryFindings.forEach((finding, i) => {
      const name = i === 0 ? pc.bold(padVisible(label, labelWidth)) : " ".repeat(labelWidth);
      lines.push(`  ${ICONS[finding.severity]} ${name}  ${finding.message}`);
    });
  }

  // Detailed findings with file locations
  const located = report.results
    .flatMap((r) => r.findings)
    .filter((f) => f.file && f.severity !== "success");

  if (located.length > 0 && verbose) {
    lines.push("");
    lines.push(`  ${pc.bold("Details")}`);
    for (const f of located) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`    ${ICONS[f.severity]} ${pc.dim(loc ?? "")} ${colorFor(f.severity, f.message)}`);
    }
  }

  const steps = nextSteps(report);
  if (steps.length > 0) {
    lines.push("");
    lines.push(`  ${pc.bold("Next steps")}`);
    steps.forEach((step, i) =>
      lines.push(`    ${pc.dim(`${i + 1}.`)} ${step}`)
    );
  }

  if (located.length > 0 && !verbose) {
    lines.push("");
    lines.push(pc.dim("  Run with --verbose to see file locations."));
  }

  lines.push("");
  return lines.join("\n");
}
