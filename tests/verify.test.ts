import { afterEach, describe, expect, it, vi } from "vitest";
import { VERIFIABLE_KINDS, verifySecrets } from "../src/checks/verify.js";
import type { SecretFinding } from "../src/types.js";

const finding = (over: Partial<SecretFinding> = {}): SecretFinding => ({
  kind: "GitHub token",
  file: "src/api.ts",
  line: 3,
  masked: "ghp_...abcd",
  confidence: "high",
  raw: "ghp_" + "fakeTokenForTests000000000000000",
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status }))
  );
}

describe("verifySecrets", () => {
  it("marks a key active on 200", async () => {
    stubFetch(200);
    const [f] = await verifySecrets([finding()]);
    expect(f.verified).toBe("active");
  });

  it("marks a key inactive on 401", async () => {
    stubFetch(401);
    const [f] = await verifySecrets([finding()]);
    expect(f.verified).toBe("inactive");
  });

  it("marks a key inactive on 403", async () => {
    stubFetch(403);
    const [f] = await verifySecrets([finding()]);
    expect(f.verified).toBe("inactive");
  });

  it("marks a key unknown on 500 or rate limit", async () => {
    stubFetch(500);
    const [f] = await verifySecrets([finding()]);
    expect(f.verified).toBe("unknown");
  });

  it("marks a key unknown on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const [f] = await verifySecrets([finding()]);
    expect(f.verified).toBe("unknown");
  });

  it("skips findings without a verifier for their kind", async () => {
    stubFetch(200);
    const [f] = await verifySecrets([finding({ kind: "Telegram bot token" })]);
    expect(f.verified).toBeUndefined();
  });

  it("skips findings without a raw value", async () => {
    stubFetch(200);
    const [f] = await verifySecrets([finding({ raw: undefined })]);
    expect(f.verified).toBeUndefined();
  });

  it("verifies multiple findings concurrently", async () => {
    stubFetch(200);
    const results = await verifySecrets([
      finding(),
      finding({ kind: "OpenAI key", raw: "sk-" + "fakeKeyForTests0000000000" }),
      finding({ kind: "GitLab token", raw: "glpat-" + "fakeForTests00000000" }),
    ]);
    expect(results.every((f) => f.verified === "active")).toBe(true);
  });

  it("covers at least 10 providers", () => {
    expect(VERIFIABLE_KINDS.length).toBeGreaterThanOrEqual(10);
  });

  it("never sends the key anywhere except the provider host", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response("{}", { status: 200 });
      })
    );
    await verifySecrets([finding()]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api.github.com");
  });
});
