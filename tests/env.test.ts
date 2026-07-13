import { describe, expect, it } from "vitest";
import {
  checkEnv,
  extractEnvUsages,
  findRealLookingExampleValues,
  parseEnvKeys,
} from "../src/checks/env.js";

describe("extractEnvUsages", () => {
  it("extracts process.env variables", () => {
    const code = `
const key = process.env.OPENAI_API_KEY;
const url = process.env.DATABASE_URL ?? "";
`;
    const usages = extractEnvUsages(code, "src/app.ts");
    expect(usages.map((u) => u.name)).toEqual(["OPENAI_API_KEY", "DATABASE_URL"]);
    expect(usages[0].line).toBe(2);
    expect(usages[1].line).toBe(3);
  });

  it("extracts import.meta.env variables", () => {
    const code = `const api = import.meta.env.VITE_API_URL;`;
    const usages = extractEnvUsages(code, "src/main.ts");
    expect(usages.map((u) => u.name)).toEqual(["VITE_API_URL"]);
  });

  it("ignores built-in variables like NODE_ENV", () => {
    const code = `if (process.env.NODE_ENV === "production") {}`;
    expect(extractEnvUsages(code, "src/app.ts")).toEqual([]);
  });

  it("handles multiple usages on one line", () => {
    const code = `const x = process.env.A_KEY + process.env.B_KEY;`;
    const usages = extractEnvUsages(code, "f.ts");
    expect(usages.map((u) => u.name)).toEqual(["A_KEY", "B_KEY"]);
  });
});

describe("parseEnvKeys", () => {
  it("parses keys from dotenv content", () => {
    const content = `
# comment
API_KEY=abc
DATABASE_URL="postgres://localhost"
export EXPORTED_VAR=1

INVALID LINE
`;
    expect(parseEnvKeys(content)).toEqual(["API_KEY", "DATABASE_URL", "EXPORTED_VAR"]);
  });
});

describe("findRealLookingExampleValues", () => {
  it("flags long opaque values", () => {
    const content = `API_KEY=abcd1234efgh5678ijkl9012mnop`;
    expect(findRealLookingExampleValues(content)).toEqual(["API_KEY"]);
  });

  it("ignores placeholders", () => {
    const content = `
API_KEY=your-api-key-here
SECRET=changeme
TOKEN=<insert-token>
FLAG=true
PORT=3000
`;
    expect(findRealLookingExampleValues(content)).toEqual([]);
  });
});

describe("checkEnv monorepo awareness", () => {
  it("accepts workspace-level .env.example files instead of a root one", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-ws-"));
    try {
      fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
      fs.writeFileSync(path.join(root, "apps", "web", ".env.example"), "API_KEY=your-key\n");
      const result = checkEnv(
        root,
        [{ name: "API_KEY", file: "apps/web/index.ts", line: 1 }],
        ["apps/web"]
      );
      const rules = result.findings.map((f) => f.rule);
      expect(rules).toContain("env.example-found-workspaces");
      expect(rules).not.toContain("env.example-missing");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("still errors when neither root nor workspaces have .env.example", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-ws-"));
    try {
      fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
      const result = checkEnv(
        root,
        [{ name: "API_KEY", file: "apps/web/index.ts", line: 1 }],
        ["apps/web"]
      );
      expect(result.findings.map((f) => f.rule)).toContain("env.example-missing");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

