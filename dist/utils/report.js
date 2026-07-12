import pc from "picocolors";
const ICONS = {
    success: pc.green("\u2713"),
    error: pc.red("\u2717"),
    warning: pc.yellow("\u26a0"),
    info: pc.cyan("\u2139"),
};
function colorFor(severity, text) {
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
function scoreColor(score) {
    const label = `${score}/100`;
    if (score >= 85)
        return pc.green(label);
    if (score >= 60)
        return pc.yellow(label);
    return pc.red(label);
}
/** Builds recommended next steps from findings, highest severity first. */
export function nextSteps(report) {
    const steps = [];
    const all = report.results.flatMap((r) => r.findings);
    const has = (rule) => all.some((f) => f.rule === rule);
    if (has("package-json.missing"))
        steps.push("Add a package.json (npm init -y)");
    if (has("secrets.detected"))
        steps.push("Rotate and remove hardcoded secrets immediately");
    if (has("env.not-ignored"))
        steps.push("Add .env to .gitignore");
    if (has("env.example-missing"))
        steps.push("Create .env.example (run: shipready fix)");
    if (has("env.example-incomplete"))
        steps.push("Add missing variables to .env.example");
    if (has("readme.missing"))
        steps.push("Write a README with setup instructions");
    if (has("readme.weak"))
        steps.push("Expand README with installation and usage sections");
    if (has("gitignore.missing"))
        steps.push("Create a .gitignore (run: shipready fix)");
    if (has("gitignore.incomplete"))
        steps.push("Add missing entries to .gitignore (run: shipready fix)");
    if (has("scripts.missing"))
        steps.push("Add missing package.json scripts (build/test/lint)");
    if (has("todos.debug"))
        steps.push("Remove debug logs and debugger statements before shipping");
    if (has("todos.markers"))
        steps.push("Resolve TODO/FIXME comments or track them as issues");
    return steps;
}
/** Renders the full report to a printable string. */
export function renderReport(report, verbose = false) {
    const lines = [];
    const { project } = report;
    lines.push("");
    lines.push(pc.bold(pc.magenta("shipready report")));
    lines.push("");
    lines.push(`${pc.dim("Project:")} ${project.framework}`);
    lines.push(`${pc.dim("Package manager:")} ${project.packageManager}`);
    lines.push("");
    lines.push(pc.bold("Summary:"));
    for (const result of report.results) {
        for (const finding of summarize(result.findings)) {
            lines.push(`${ICONS[finding.severity]} ${finding.message}`);
        }
    }
    // Detailed findings with file locations
    const located = report.results
        .flatMap((r) => r.findings)
        .filter((f) => f.file && f.severity !== "success");
    if (located.length > 0 && verbose) {
        lines.push("");
        lines.push(pc.bold("Details:"));
        for (const f of located) {
            const loc = f.line ? `${f.file}:${f.line}` : f.file;
            lines.push(`  ${ICONS[f.severity]} ${pc.dim(loc ?? "")} ${colorFor(f.severity, f.message)}`);
        }
    }
    lines.push("");
    lines.push(`${pc.bold("Score:")} ${scoreColor(report.score)}`);
    const steps = nextSteps(report);
    if (steps.length > 0) {
        lines.push("");
        lines.push(pc.bold("Recommended next steps:"));
        steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (located.length > 0 && !verbose) {
        lines.push("");
        lines.push(pc.dim("Run with --verbose to see file locations."));
    }
    lines.push("");
    return lines.join("\n");
}
/**
 * Collapses per-file findings into summary lines while keeping
 * top-level findings (those without a file) as-is.
 */
function summarize(findings) {
    return findings.filter((f) => !f.file);
}
