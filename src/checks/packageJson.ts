import type { CheckResult, Finding, ProjectInfo } from "../types.js";

const IMPORTANT_SCRIPTS = ["dev", "build", "test", "lint"] as const;

/** Checks package.json existence and important scripts. */
export function checkPackageJson(project: ProjectInfo): CheckResult {
  const findings: Finding[] = [];

  if (!project.hasPackageJson) {
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

  const missing = IMPORTANT_SCRIPTS.filter((s) => !project.scripts[s]);
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
