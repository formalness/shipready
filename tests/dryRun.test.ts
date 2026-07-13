import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixEnvExample } from "../src/fixers/envExample.js";
import { fixGitignore } from "../src/fixers/gitignore.js";
import { scanContentForTodos } from "../src/checks/todos.js";

describe("fix --dry-run", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-dry-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not write .env.example in dry-run mode", () => {
    const usages = [{ name: "API_URL", file: "a.ts", line: 1 }];
    const result = fixEnvExample(tmp, usages, false, true);
    expect(result.action).toBe("created");
    expect(result.dryRun).toBe(true);
    expect(result.preview).toContain("API_URL=");
    expect(fs.existsSync(path.join(tmp, ".env.example"))).toBe(false);
  });

  it("does not write .gitignore in dry-run mode", () => {
    const result = fixGitignore(tmp, true);
    expect(result.action).toBe("created");
    expect(result.dryRun).toBe(true);
    expect(result.preview).toContain(".env");
    expect(fs.existsSync(path.join(tmp, ".gitignore"))).toBe(false);
  });

  it("previews only the appended entries for an existing .gitignore", () => {
    fs.writeFileSync(path.join(tmp, ".gitignore"), "node_modules\n");
    const result = fixGitignore(tmp, true);
    expect(result.action).toBe("updated");
    expect(result.preview).toContain(".env");
    expect(result.preview).not.toContain("node_modules\n# Added");
    // Original file untouched.
    expect(fs.readFileSync(path.join(tmp, ".gitignore"), "utf8")).toBe("node_modules\n");
  });

  it("still writes files when dry-run is off", () => {
    const result = fixGitignore(tmp, false);
    expect(result.action).toBe("created");
    expect(fs.existsSync(path.join(tmp, ".gitignore"))).toBe(true);
  });
});

describe("shipready-ignore for hygiene checks", () => {
  it("suppresses console.log on marked lines", () => {
    const content = [
      `console.log("keep me quiet"); // shipready-ignore`,
      `console.log("flag me");`,
    ].join("\n");
    const found = scanContentForTodos(content, "src/app.ts");
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("suppresses TODO markers on marked lines", () => {
    const content = [
      `// TODO: legacy, tracked in JIRA-123 - shipready-ignore`,
      `// TODO: real one`,
    ].join("\n");
    const found = scanContentForTodos(content, "src/app.ts");
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("suppresses debugger statements on marked lines", () => {
    const content = `debugger; // shipready-ignore\n`;
    expect(scanContentForTodos(content, "src/app.ts")).toEqual([]);
  });
});

describe("framework-aware gitignore fixing", () => {
  it("does not suggest Node entries for a Go repo", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-gofix-"));
    try {
      fs.writeFileSync(path.join(root, ".gitignore"), "bin/\n");
      const result = fixGitignore(root, true, "Go", { usesEnv: false });
      const preview = result.preview ?? "";
      expect(preview).not.toContain(".next");
      expect(preview).not.toContain("node_modules");
      expect(preview).not.toContain(".env");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

