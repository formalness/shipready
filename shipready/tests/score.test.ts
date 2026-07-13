import { describe, expect, it } from "vitest";
import { calculateScore } from "../src/scanner.js";
import type { CheckResult } from "../src/types.js";

function result(name: string, rules: Array<{ rule: string; message?: string }>): CheckResult {
  return {
    name,
    findings: rules.map((r) => ({
      severity: "error" as const,
      rule: r.rule,
      message: r.message ?? r.rule,
    })),
  };
}

describe("calculateScore", () => {
  it("returns 100 for a clean project", () => {
    expect(calculateScore([])).toBe(100);
  });

  it("deducts 20 for missing package.json", () => {
    expect(calculateScore([result("pkg", [{ rule: "package-json.missing" }])])).toBe(80);
  });

  it("deducts 15 for missing README", () => {
    expect(calculateScore([result("readme", [{ rule: "readme.missing" }])])).toBe(85);
  });

  it("deducts 8 for weak README", () => {
    expect(calculateScore([result("readme", [{ rule: "readme.weak" }])])).toBe(92);
  });

  it("deducts for missing build and test scripts", () => {
    const r = result("pkg", [
      { rule: "scripts.missing", message: "Missing scripts: build, test" },
    ]);
    expect(calculateScore([r])).toBe(100 - 8 - 6);
  });

  it("deducts 10 for missing .env.example", () => {
    expect(calculateScore([result("env", [{ rule: "env.example-missing" }])])).toBe(90);
  });

  it("deducts 15 when .env is not ignored", () => {
    expect(calculateScore([result("env", [{ rule: "env.not-ignored" }])])).toBe(85);
  });

  it("deducts 25 per secret, capped at 50", () => {
    const one = result("secrets", [{ rule: "secrets.detected-item" }]);
    expect(calculateScore([one])).toBe(75);

    const three = result("secrets", [
      { rule: "secrets.detected-item" },
      { rule: "secrets.detected-item" },
      { rule: "secrets.detected-item" },
    ]);
    expect(calculateScore([three])).toBe(50);
  });

  it("caps todo deductions at 15", () => {
    const many = result(
      "todos",
      Array.from({ length: 20 }, () => ({ rule: "todos.item" }))
    );
    expect(calculateScore([many])).toBe(85);
  });

  it("never goes below 0", () => {
    const results = [
      result("pkg", [{ rule: "package-json.missing" }]),
      result("readme", [{ rule: "readme.missing" }]),
      result("env", [{ rule: "env.example-missing" }, { rule: "env.not-ignored" }]),
      result("secrets", [
        { rule: "secrets.detected-item" },
        { rule: "secrets.detected-item" },
        { rule: "secrets.detected-item" },
      ]),
      result(
        "todos",
        Array.from({ length: 20 }, () => ({ rule: "todos.item" }))
      ),
    ];
    expect(calculateScore(results)).toBe(0);
  });
});
