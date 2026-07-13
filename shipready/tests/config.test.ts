import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, isRuleDisabled, loadConfig } from "../src/config.js";
import { runScan } from "../src/scanner.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-config-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(obj: unknown): void {
  fs.writeFileSync(path.join(tmp, CONFIG_FILE), JSON.stringify(obj), "utf8");
}

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const cfg = loadConfig(tmp);
    expect(cfg).toEqual({ ignore: [], disableRules: [], secretAllowlist: [] });
  });

  it("loads a valid config", () => {
    writeConfig({
      ignore: ["fixtures/**"],
      disableRules: ["todos"],
      secretAllowlist: ["not-a-real-key"],
    });
    const cfg = loadConfig(tmp);
    expect(cfg.ignore).toEqual(["fixtures/**"]);
    expect(cfg.disableRules).toEqual(["todos"]);
    expect(cfg.secretAllowlist).toEqual(["not-a-real-key"]);
  });

  it("throws on invalid JSON", () => {
    fs.writeFileSync(path.join(tmp, CONFIG_FILE), "{ nope", "utf8");
    expect(() => loadConfig(tmp)).toThrow(/not valid JSON/);
  });

  it("throws on unknown fields", () => {
    writeConfig({ unknownField: true });
    expect(() => loadConfig(tmp)).toThrow(/unknown field/);
  });

  it("throws when a field has the wrong type", () => {
    writeConfig({ ignore: "not-an-array" });
    expect(() => loadConfig(tmp)).toThrow(/must be an array of strings/);
  });
});

describe("isRuleDisabled", () => {
  it("matches exact rule ids", () => {
    expect(isRuleDisabled("readme.weak", ["readme.weak"])).toBe(true);
    expect(isRuleDisabled("readme.missing", ["readme.weak"])).toBe(false);
  });

  it("matches whole checks by prefix", () => {
    expect(isRuleDisabled("todos.item", ["todos"])).toBe(true);
    expect(isRuleDisabled("todos", ["todos"])).toBe(true);
  });
});

describe("config integration with runScan", () => {
  it("disableRules removes findings and improves score", async () => {
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "t", scripts: { build: "x", test: "y" } }),
      "utf8"
    );
    fs.writeFileSync(path.join(tmp, "app.ts"), "// TODO: one\n// TODO: two\n", "utf8");

    const withTodos = await runScan(tmp);
    const todoFindings = withTodos.results
      .flatMap((r) => r.findings)
      .filter((f) => f.rule === "todos.item");
    expect(todoFindings.length).toBe(2);

    writeConfig({ disableRules: ["todos"] });
    const without = await runScan(tmp);
    const remaining = without.results
      .flatMap((r) => r.findings)
      .filter((f) => f.rule.startsWith("todos"));
    expect(remaining.length).toBe(0);
    expect(without.score).toBeGreaterThan(withTodos.score);
  });

  it("ignore patterns exclude files from the scan", async () => {
    fs.mkdirSync(path.join(tmp, "fixtures"));
    fs.writeFileSync(
      path.join(tmp, "fixtures", "sample.ts"),
      'const k = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN";\n',
      "utf8"
    );
    writeConfig({ ignore: ["fixtures/**"] });

    const report = await runScan(tmp);
    const secretItems = report.results
      .flatMap((r) => r.findings)
      .filter((f) => f.rule === "secrets.detected-item");
    expect(secretItems.length).toBe(0);
  });

  it("secretAllowlist suppresses known false positives", async () => {
    fs.writeFileSync(
      path.join(tmp, "app.ts"),
      'const k = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN";\n',
      "utf8"
    );
    writeConfig({ secretAllowlist: ["ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN"] });

    const report = await runScan(tmp);
    const secretItems = report.results
      .flatMap((r) => r.findings)
      .filter((f) => f.rule === "secrets.detected-item");
    expect(secretItems.length).toBe(0);
  });
});
