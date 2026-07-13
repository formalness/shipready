import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPackageJson } from "../src/checks/packageJson.js";
import { detectPackageManager } from "../src/utils/framework.js";
import type { ProjectInfo } from "../src/types.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("detectPackageManager", () => {
  it("detects pnpm from pnpm-lock.yaml", () => {
    fs.writeFileSync(path.join(tmp, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(tmp)).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", () => {
    fs.writeFileSync(path.join(tmp, "yarn.lock"), "");
    expect(detectPackageManager(tmp)).toBe("yarn");
  });

  it("detects bun from bun.lockb", () => {
    fs.writeFileSync(path.join(tmp, "bun.lockb"), "");
    expect(detectPackageManager(tmp)).toBe("bun");
  });

  it("detects npm from package-lock.json", () => {
    fs.writeFileSync(path.join(tmp, "package-lock.json"), "{}");
    expect(detectPackageManager(tmp)).toBe("npm");
  });

  it("returns none for an empty directory", () => {
    expect(detectPackageManager(tmp)).toBe("none");
  });
});

function projectWith(overrides: Partial<ProjectInfo>): ProjectInfo {
  return {
    root: tmp,
    hasPackageJson: true,
    packageJson: {},
    packageManager: "npm",
    framework: "Node.js",
    scripts: {},
    sourceFiles: [],
    ...overrides,
  };
}

describe("checkPackageJson", () => {
  it("errors when package.json is missing", () => {
    const result = checkPackageJson(projectWith({ hasPackageJson: false }));
    expect(result.findings.some((f) => f.rule === "package-json.missing")).toBe(true);
  });

  it("warns about missing scripts", () => {
    const result = checkPackageJson(projectWith({ scripts: { dev: "x", build: "y" } }));
    const warning = result.findings.find((f) => f.rule === "scripts.missing");
    expect(warning).toBeDefined();
    expect(warning!.message).toContain("test");
    expect(warning!.message).toContain("lint");
    expect(warning!.message).not.toContain("build");
  });

  it("passes with all important scripts", () => {
    const result = checkPackageJson(
      projectWith({ scripts: { dev: "a", build: "b", test: "c", lint: "d" } })
    );
    expect(result.findings.some((f) => f.rule === "scripts.found")).toBe(true);
  });
});
