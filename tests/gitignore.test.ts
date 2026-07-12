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
