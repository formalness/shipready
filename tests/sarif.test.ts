import { describe, expect, it } from "vitest";
import { toSarif } from "../src/utils/sarif.js";
import type { Report } from "../src/types.js";

const baseReport = (): Report => ({
  project: {
    root: "/tmp/x",
    hasPackageJson: true,
    packageJson: null,
    packageManager: "npm",
    framework: "Next.js",
    scripts: {},
    sourceFiles: [],
  },
  results: [
    {
      name: "secrets",
      findings: [
        {
          severity: "error",
          rule: "secrets.detected-item",
          message: "OpenAI key: sk-p****T0",
          file: "src/config.ts",
          line: 12,
        },
        {
          severity: "warning",
          rule: "todos.debug",
          message: "3 console.log calls found",
        },
        {
          severity: "success",
          rule: "readme.ok",
          message: "README found",
        },
      ],
    },
  ],
  score: 55,
});

describe("toSarif", () => {
  it("produces valid SARIF 2.1.0 structure", () => {
    const sarif = JSON.parse(toSarif(baseReport(), "1.5.0"));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("shipready");
    expect(sarif.runs[0].tool.driver.version).toBe("1.5.0");
  });

  it("maps severities to SARIF levels", () => {
    const sarif = JSON.parse(toSarif(baseReport(), "1.5.0"));
    const levels = sarif.runs[0].results.map((r: { level: string }) => r.level);
    expect(levels).toContain("error");
    expect(levels).toContain("warning");
  });

  it("excludes success findings from results", () => {
    const sarif = JSON.parse(toSarif(baseReport(), "1.5.0"));
    const rules = sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId);
    expect(rules).not.toContain("readme.ok");
  });

  it("includes file location and line region", () => {
    const sarif = JSON.parse(toSarif(baseReport(), "1.5.0"));
    const secret = sarif.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === "secrets.detected-item"
    );
    expect(secret.locations[0].physicalLocation.artifactLocation.uri).toBe("src/config.ts");
    expect(secret.locations[0].physicalLocation.region.startLine).toBe(12);
  });

  it("declares each rule once in the driver", () => {
    const sarif = JSON.parse(toSarif(baseReport(), "1.5.0"));
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(ruleIds).toContain("secrets.detected-item");
  });

  it("adds stable partial fingerprints for alert tracking", () => {
    const a = JSON.parse(toSarif(baseReport(), "1.5.0"));
    const b = JSON.parse(toSarif(baseReport(), "1.5.0"));
    expect(a.runs[0].results[0].partialFingerprints.shipready).toBe(
      b.runs[0].results[0].partialFingerprints.shipready
    );
  });
});
