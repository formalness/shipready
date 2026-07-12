import type { CheckResult, Finding } from "../types.js";
import { readTextFile } from "../utils/files.js";

const SECTION_KEYWORDS = [
  "installation",
  "install",
  "usage",
  "quickstart",
  "quick start",
  "getting started",
  "environment variables",
  "development",
  "build",
  "license",
];

/** Minimum character count for a README to not be considered "too empty". */
const MIN_README_LENGTH = 200;

/** Minimum number of keyword hits for a README to be considered useful. */
const MIN_KEYWORD_HITS = 2;

/** Checks README existence and quality heuristics. */
export function checkReadme(root: string): CheckResult {
  const findings: Finding[] = [];

  const content =
    readTextFile(root, "README.md") ??
    readTextFile(root, "readme.md") ??
    readTextFile(root, "Readme.md");

  if (content === null) {
    findings.push({
      severity: "error",
      rule: "readme.missing",
      message: "README.md missing",
    });
    return { name: "README", findings };
  }

  findings.push({
    severity: "success",
    rule: "readme.found",
    message: "README.md found",
  });

  const lower = content.toLowerCase();
  const hits = SECTION_KEYWORDS.filter((k) => lower.includes(k)).length;

  if (content.trim().length < MIN_README_LENGTH || hits < MIN_KEYWORD_HITS) {
    findings.push({
      severity: "warning",
      rule: "readme.weak",
      message: "README looks thin - add installation and usage instructions",
    });
  }

  return { name: "README", findings };
}
