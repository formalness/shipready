import { describe, expect, it } from "vitest";
import { missingIgnoreEntries } from "../src/checks/gitignore.js";

describe("missingIgnoreEntries", () => {
  it("returns nothing when all important entries present", () => {
    const content = `.env
.env.local
node_modules
dist
build
.next`;
    expect(missingIgnoreEntries(content)).toEqual([]);
  });

  it("detects missing entries", () => {
    const content = `node_modules\ndist`;
    expect(missingIgnoreEntries(content)).toEqual([
      ".env",
      ".env.local",
      "build",
      ".next",
    ]);
  });

  it("treats .env* as covering .env and .env.local", () => {
    const content = `.env*
node_modules
dist
build
.next`;
    expect(missingIgnoreEntries(content)).toEqual([]);
  });

  it("handles trailing slashes and leading slashes", () => {
    const content = `/node_modules/
.env
.env.local
dist/
build
.next`;
    expect(missingIgnoreEntries(content)).toEqual([]);
  });

  it("ignores comments", () => {
    const content = `# .env\nnode_modules`;
    expect(missingIgnoreEntries(content)).toContain(".env");
  });
});

describe("importantIgnoresFor", () => {
  it("suggests only ecosystem-relevant entries for Go projects", () => {
    // Suggesting node_modules to a Go repo is noise that erodes trust.
    const missing = missingIgnoreEntries("", "Go");
    expect(missing).toEqual([".env"]);
    expect(missing).not.toContain("node_modules");
    expect(missing).not.toContain(".next");
  });

  it("suggests Python-specific entries for Python projects", () => {
    const missing = missingIgnoreEntries("", "Python");
    expect(missing).toEqual([".env", "__pycache__", ".venv"]);
  });

  it("suggests target for Rust projects", () => {
    expect(missingIgnoreEntries("", "Rust")).toContain("target");
  });

  it("keeps the full Node list for Node-ecosystem frameworks", () => {
    const missing = missingIgnoreEntries("", "Next.js");
    expect(missing).toContain("node_modules");
    expect(missing).toContain(".next");
  });

  it("defaults to the Node list when framework is not provided", () => {
    expect(missingIgnoreEntries("")).toContain("node_modules");
  });
});

