import type { Finding, Report } from "../types.js";

/**
 * SARIF 2.1.0 output for GitHub code scanning.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * GitHub ingests this via the codeql-action/upload-sarif action, turning
 * shipready findings into native code scanning alerts on PRs.
 */

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: "%SRCROOT%" };
      region?: { startLine: number };
    };
  }>;
  partialFingerprints?: Record<string, string>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: "error" | "warning" | "note" };
  helpUri: string;
}

/** Maps shipready severity to a SARIF level. */
function toLevel(severity: Finding["severity"]): "error" | "warning" | "note" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

/** Human-friendly rule names derived from rule ids ("secrets.detected-item" -> "SecretsDetectedItem"). */
function ruleName(ruleId: string): string {
  return ruleId
    .split(/[.-]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

/** Simple stable fingerprint so GitHub tracks alerts across pushes. */
function fingerprint(f: Finding): string {
  const raw = `${f.rule}|${f.file ?? ""}|${f.message}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/** Converts a shipready report to a SARIF 2.1.0 log string. */
export function toSarif(report: Report, version: string): string {
  const rules = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const check of report.results) {
    for (const f of check.findings) {
      // Success/info summary rows aren't actionable alerts.
      if (f.severity === "success") continue;
      if (f.severity === "info" && !f.file) continue;

      if (!rules.has(f.rule)) {
        rules.set(f.rule, {
          id: f.rule,
          name: ruleName(f.rule),
          shortDescription: { text: f.rule },
          defaultConfiguration: { level: toLevel(f.severity) },
          helpUri: "https://github.com/formalness/shipready#readme",
        });
      }

      results.push({
        ruleId: f.rule,
        level: toLevel(f.severity),
        message: { text: f.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                // SARIF requires a location; findings without a file anchor
                // to the repo root via package.json-ish convention.
                uri: f.file ?? ".",
                uriBaseId: "%SRCROOT%",
              },
              ...(f.line && f.line > 0 ? { region: { startLine: f.line } } : {}),
            },
          },
        ],
        partialFingerprints: { shipready: fingerprint(f) },
      });
    }
  }

  const log = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0" as const,
    runs: [
      {
        tool: {
          driver: {
            name: "shipready",
            version,
            informationUri: "https://github.com/formalness/shipready",
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}
