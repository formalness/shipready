import { describe, expect, it } from "vitest";
import { checkHistory, extractAddedLines } from "../src/checks/history.js";
import type { SecretFinding } from "../src/types.js";

describe("extractAddedLines", () => {
  const diff = [
    "commit abc1234def5678900000000000000000000000000",
    "Author: dev <dev@example.com>",
    "",
    "    add config",
    "",
    "diff --git a/src/config.ts b/src/config.ts",
    "--- a/src/config.ts",
    "+++ b/src/config.ts",
    "@@ -0,0 +1,2 @@",
    '+const KEY = "value";',
    "+export default KEY;",
    "commit 9999999aaaaaaaabbbbbbbbcccccccc000000000",
    "diff --git a/old.ts b/old.ts",
    "--- a/old.ts",
    "+++ /dev/null",
    "@@ -1,1 +0,0 @@",
    "-const gone = 1;",
  ].join("\n");

  it("extracts added lines with commit and file attribution", () => {
    const lines = extractAddedLines(diff);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      commit: "abc1234",
      file: "src/config.ts",
      content: 'const KEY = "value";',
    });
    expect(lines[1].content).toBe("export default KEY;");
  });

  it("ignores removed lines and deleted files", () => {
    const lines = extractAddedLines(diff);
    expect(lines.some((l) => l.content.includes("gone"))).toBe(false);
  });

  it("skips vendor and lockfile paths", () => {
    const vendorDiff = [
      "commit 1234567000000000000000000000000000000000",
      "+++ b/node_modules/pkg/index.js",
      '+const x = "sk_live_' + "abcdefghijklmnop" + '";',
      "+++ b/pnpm-lock.yaml",
      "+  key: something",
    ].join("\n");
    expect(extractAddedLines(vendorDiff)).toHaveLength(0);
  });

  it("skips empty added lines", () => {
    const d = ["commit 1234567000000000000000000000000000000000", "+++ b/a.ts", "+", "+  "].join("\n");
    expect(extractAddedLines(d)).toHaveLength(0);
  });
});

describe("checkHistory", () => {
  const finding = (over: Partial<SecretFinding> = {}): SecretFinding => ({
    kind: "GitHub token",
    file: "src/api.ts",
    line: 0,
    masked: "ghp_...abcd",
    confidence: "high",
    source: "history",
    commit: "abc1234",
    ...over,
  });

  it("reports info when not a git repo", () => {
    const result = checkHistory([], false);
    expect(result.findings[0].severity).toBe("info");
    expect(result.findings[0].rule).toBe("history.skipped");
  });

  it("reports success when history is clean", () => {
    const result = checkHistory([], true);
    expect(result.findings[0].severity).toBe("success");
  });

  it("reports high-confidence history secrets as errors with commit hash", () => {
    const result = checkHistory([finding()], true);
    const summary = result.findings.find((f) => f.rule === "history.secret");
    const item = result.findings.find((f) => f.rule === "history.secret-item");
    expect(summary?.severity).toBe("error");
    expect(item?.message).toContain("commit abc1234");
  });

  it("reports medium-confidence history secrets as warnings", () => {
    const result = checkHistory([finding({ confidence: "medium" })], true);
    expect(result.findings.find((f) => f.rule === "history.possible")?.severity).toBe("warning");
  });

  it("never includes raw values in messages", () => {
    const result = checkHistory(
      [finding({ raw: "ghp_SUPERSECRETVALUE00000000000000000" })],
      true
    );
    for (const f of result.findings) {
      expect(f.message).not.toContain("SUPERSECRET");
    }
  });
});
