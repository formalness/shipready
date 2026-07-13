import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listStagedFiles, readStagedContent, scanStaged } from "../src/checks/staged.js";

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });

describe("staged scan", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-staged-"));
    git(tmp, ["init", "-q"]);
    git(tmp, ["config", "user.email", "t@t"]);
    git(tmp, ["config", "user.name", "t"]);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const writeAndStage = (rel: string, content: string) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    git(tmp, ["add", rel]);
  };

  it("lists staged files", () => {
    writeAndStage("a.js", "const x = 1;\n");
    writeAndStage("b.ts", "const y = 2;\n");
    expect(listStagedFiles(tmp).sort()).toEqual(["a.js", "b.ts"]);
  });

  it("returns empty list when nothing is staged", () => {
    expect(listStagedFiles(tmp)).toEqual([]);
  });

  it("reads staged content from the index, not the working tree", () => {
    writeAndStage("a.js", "staged version\n");
    // Modify the file on disk AFTER staging - staged content must win.
    fs.writeFileSync(path.join(tmp, "a.js"), "disk version\n");
    expect(readStagedContent(tmp, "a.js")).toBe("staged version\n");
  });

  it("detects a secret in staged content only", () => {
    const key = "ghp_" + "Zq9rT3mN8vL2wX5cB7dF" + "1gH4jK6pW0eR2y";
    writeAndStage("leak.js", `const t = "${key}";\n`);
    // Clean the working tree copy - the leak lives only in the index.
    fs.writeFileSync(path.join(tmp, "leak.js"), "const t = process.env.TOKEN;\n");

    const { secrets } = scanStaged(tmp);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].kind).toBe("GitHub token");
    expect(secrets[0].file).toBe("leak.js");
  });

  it("reports clean when staged files have no secrets", () => {
    writeAndStage("ok.js", "export const n = 42;\n");
    const { files, secrets } = scanStaged(tmp);
    expect(files).toEqual(["ok.js"]);
    expect(secrets).toEqual([]);
  });

  it("catches secrets in a staged .env file", () => {
    const key = "sk-proj-" + "Xk9mQ2vR8tN4wY6bC1dZ" + "pJ5sL3fG7hT0";
    writeAndStage(".env", `OPENAI_API_KEY=${key}\n`);
    const { secrets } = scanStaged(tmp);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it("skips lockfiles and vendor paths", () => {
    writeAndStage("package-lock.json", "{}");
    writeAndStage("src/app.js", "const ok = true;\n");
    expect(listStagedFiles(tmp)).toEqual(["src/app.js"]);
  });

  it("honors the allowlist", () => {
    const key = "ghp_" + "Zq9rT3mN8vL2wX5cB7dF" + "1gH4jK6pW0eR2y";
    writeAndStage("leak.js", `const t = "${key}";\n`);
    const { secrets } = scanStaged(tmp, [key]);
    expect(secrets).toEqual([]);
  });
});
