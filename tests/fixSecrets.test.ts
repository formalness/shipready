import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixSecrets, projectLoadsDotenv } from "../src/fixers/secrets.js";
import { scanContentForSecrets } from "../src/checks/secrets.js";

const GH_TOKEN = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN9xW2";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-autofix-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string) {
  const abs = path.join(root, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function scan(file: string) {
  return scanContentForSecrets(read(file), file);
}

describe("fixSecrets", () => {
  it("moves a JS secret to .env and replaces it with process.env", () => {
    write("app.js", `const githubToken = "${GH_TOKEN}";\nconsole.log(githubToken);\n`);
    const secrets = scan("app.js");
    expect(secrets).toHaveLength(1);

    const outcome = fixSecrets(root, secrets);

    expect(read("app.js")).toContain("const githubToken = process.env.GITHUB_TOKEN;");
    expect(read("app.js")).not.toContain(GH_TOKEN);
    expect(read(".env")).toContain(`GITHUB_TOKEN=${GH_TOKEN}`);
    expect(read(".env.example")).toContain("GITHUB_TOKEN=");
    expect(outcome.manual).toEqual([]);
    // The fixed file must scan clean.
    expect(scan("app.js")).toEqual([]);
  });

  it("uses a non-null assertion in TypeScript files", () => {
    write("app.ts", `const githubToken = "${GH_TOKEN}";\n`);
    fixSecrets(root, scan("app.ts"));
    expect(read("app.ts")).toContain("process.env.GITHUB_TOKEN!;");
  });

  it("uses os.environ and adds the import in Python files", () => {
    write("app.py", `github_token = "${GH_TOKEN}"\nprint(github_token)\n`);
    fixSecrets(root, scan("app.py"));
    const content = read("app.py");
    expect(content).toContain('github_token = os.environ["GITHUB_TOKEN"]');
    expect(content.split("\n")[0]).toBe("import os");
  });

  it("does not duplicate an existing os import in Python", () => {
    write("app.py", `import os\ngithub_token = "${GH_TOKEN}"\n`);
    fixSecrets(root, scan("app.py"));
    expect(read("app.py").match(/^import os$/gm)).toHaveLength(1);
  });

  it("derives the env name from the assigned identifier", () => {
    write("cfg.js", `const myServiceToken = "${GH_TOKEN}";\n`);
    fixSecrets(root, scan("cfg.js"));
    expect(read("cfg.js")).toContain("process.env.MY_SERVICE_TOKEN");
  });

  it("reuses one env var for the same value in multiple places", () => {
    write("a.js", `const tokenA = "${GH_TOKEN}";\n`);
    write("b.js", `const tokenB = "${GH_TOKEN}";\n`);
    fixSecrets(root, [...scan("a.js"), ...scan("b.js")]);
    const env = read(".env");
    expect(env.match(new RegExp(GH_TOKEN, "g"))).toHaveLength(1);
  });

  it("suffixes colliding names that hold different values", () => {
    const other = "ghp_Aq1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2";
    write("a.js", `const githubToken = "${GH_TOKEN}";\n`);
    write("b.js", `const githubToken = "${other}";\n`);
    fixSecrets(root, [...scan("a.js"), ...scan("b.js")]);
    const env = read(".env");
    expect(env).toContain(`GITHUB_TOKEN=`);
    expect(env).toContain(`GITHUB_TOKEN_2=`);
  });

  it("never clobbers an existing .env entry", () => {
    write(".env", "GITHUB_TOKEN=already-here\n");
    write("a.js", `const githubToken = "${GH_TOKEN}";\n`);
    fixSecrets(root, scan("a.js"));
    expect(read(".env")).toContain("GITHUB_TOKEN=already-here");
    expect(read(".env")).toContain(`GITHUB_TOKEN_2=${GH_TOKEN}`);
    expect(read("a.js")).toContain("process.env.GITHUB_TOKEN_2");
  });

  it("refuses secrets embedded inside larger strings", () => {
    write("db.js", `const url = "postgres://admin:s3cr3tPassw0rdXyZ981@db.prod.io:5432/app";\n`);
    const secrets = scan("db.js");
    expect(secrets.length).toBeGreaterThan(0);
    const outcome = fixSecrets(root, secrets);
    expect(outcome.manual.length).toBeGreaterThan(0);
    expect(outcome.manual[0].reason).toContain("embedded");
    // File untouched.
    expect(read("db.js")).toContain("s3cr3tPassw0rdXyZ981");
  });

  it("refuses client-side code where env vars still leak", () => {
    write("component.tsx", `"use client";\nconst githubToken = "${GH_TOKEN}";\n`);
    const outcome = fixSecrets(root, scan("component.tsx"));
    expect(outcome.manual[0].reason).toContain("client-side");
    expect(read("component.tsx")).toContain(GH_TOKEN);
  });

  it("refuses unsupported file types", () => {
    write("config.yaml", `github_token: "${GH_TOKEN}"\n`);
    const outcome = fixSecrets(root, scan("config.yaml"));
    expect(outcome.manual[0].reason).toContain("unsupported file type");
  });

  it("dry run previews without touching anything", () => {
    write("app.js", `const githubToken = "${GH_TOKEN}";\n`);
    const outcome = fixSecrets(root, scan("app.js"), true);
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(read("app.js")).toContain(GH_TOKEN);
    expect(fs.existsSync(path.join(root, ".env"))).toBe(false);
  });

  it("fixes multiple secrets on the same line", () => {
    const slack = ["xoxb", "2847561930", "Zq9rT3mN8vL2wX5c"].join("-");
    write("cfg.js", `const cfg = { gh: "${GH_TOKEN}", slack: "${slack}" };\n`);
    fixSecrets(root, scan("cfg.js"));
    const content = read("cfg.js");
    expect(content).not.toContain(GH_TOKEN);
    expect(content).not.toContain(slack);
    expect(scan("cfg.js")).toEqual([]);
  });

  it("masks values in the .env preview", () => {
    write("app.js", `const githubToken = "${GH_TOKEN}";\n`);
    const outcome = fixSecrets(root, scan("app.js"));
    const envResult = outcome.results.find((r) => r.file === ".env");
    expect(envResult?.preview).not.toContain(GH_TOKEN);
  });
});

describe("projectLoadsDotenv", () => {
  it("recognizes dotenv and frameworks that auto-load .env", () => {
    write("package.json", JSON.stringify({ dependencies: { next: "16.0.0" } }));
    expect(projectLoadsDotenv(root)).toBe(true);
  });

  it("returns false for bare Node projects", () => {
    write("package.json", JSON.stringify({ dependencies: {} }));
    expect(projectLoadsDotenv(root)).toBe(false);
  });
});
