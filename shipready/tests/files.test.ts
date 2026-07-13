import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSourceFiles } from "../src/utils/files.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-files-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, content = "// code") {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

describe("findSourceFiles default ignores", () => {
  it("includes regular source files", async () => {
    write("src/app.ts");
    const files = await findSourceFiles(tmp);
    expect(files).toContain("src/app.ts");
  });

  it("skips minified assets", async () => {
    write("assets/mermaid.min.js");
    write("styles/katex.min.css");
    write("src/app.ts");
    const files = await findSourceFiles(tmp);
    expect(files).toEqual(["src/app.ts"]);
  });

  it("skips nested build and dist directories", async () => {
    write("mobile/build/main.js");
    write("packages/ui/dist/index.js");
    write("src/app.ts");
    const files = await findSourceFiles(tmp);
    expect(files).toEqual(["src/app.ts"]);
  });

  it("skips vendor and bundle files", async () => {
    write("public/vendor/lib.js");
    write("static/app.bundle.js");
    write("src/app.ts");
    const files = await findSourceFiles(tmp);
    expect(files).toEqual(["src/app.ts"]);
  });

  it("skips python artifacts and nested node_modules", async () => {
    write("backend/__pycache__/mod.py");
    write("backend/.venv/lib/site.py");
    write("packages/a/node_modules/dep/index.js");
    write("backend/auth.py");
    const files = await findSourceFiles(tmp);
    expect(files).toEqual(["backend/auth.py"]);
  });

  it("still honors extra ignore patterns from config", async () => {
    write("legacy/old.js");
    write("src/app.ts");
    const files = await findSourceFiles(tmp, ["legacy/**"]);
    expect(files).toEqual(["src/app.ts"]);
  });
});
