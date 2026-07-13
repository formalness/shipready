import { describe, expect, it } from "vitest";
import { maskSecret, scanContentForSecrets } from "../src/checks/secrets.js";

describe("maskSecret", () => {
  it("masks keeping prefix and suffix", () => {
    const masked = maskSecret("sk-proj-abc123456789");
    expect(masked.startsWith("sk-proj-ab")).toBe(true);
    expect(masked.endsWith("6789")).toBe(true);
    expect(masked).toContain("...");
    expect(masked).not.toContain("abc12345");
  });

  it("fully masks very short values", () => {
    expect(maskSecret("abcd")).toBe("****");
  });
});

describe("scanContentForSecrets", () => {
  it("detects OpenAI keys", () => {
    const found = scanContentForSecrets(
      `const k = "sk-proj-Zq9rT3mN8vL2wX5cB7dF1gH4";`,
      "src/ai.ts"
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("OpenAI key");
    expect(found[0].line).toBe(1);
    expect(found[0].masked).toContain("...");
  });

  it("detects GitHub tokens", () => {
    const found = scanContentForSecrets(
      `token: "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN"`,
      "deploy.yml"
    );
    expect(found[0].kind).toBe("GitHub token");
  });

  it("detects Stripe live keys", () => {
    const found = scanContentForSecrets(
      `const stripe = "sk_live_Zq9rT3mN8vL2wX5cB7dF"`,
      "pay.ts"
    );
    expect(found[0].kind).toBe("Stripe live key");
  });

  it("detects private key blocks", () => {
    const found = scanContentForSecrets(
      `-----BEGIN RSA PRIVATE KEY-----`,
      "key.pem"
    );
    expect(found[0].kind).toBe("Private key block");
  });

  it("ignores placeholder values", () => {
    const found = scanContentForSecrets(
      `const k = "sk-your-api-key-goes-here-ok";`,
      "src/ai.ts"
    );
    expect(found).toEqual([]);
  });

  it("reports line numbers", () => {
    const content = `const a = 1;\nconst k = "AIzaZq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN";`;
    const found = scanContentForSecrets(content, "f.ts");
    expect(found[0].line).toBe(2);
  });

  it("detects Anthropic keys", () => {
    const found = scanContentForSecrets(
      `const k = "sk-ant-api03-Zq9rT3mN8vL2wX5cB7dF1gH4";`,
      "ai.ts"
    );
    expect(found[0].kind).toBe("Anthropic key");
  });

  it("detects Supabase personal tokens", () => {
    // Fixture is concatenated so GitHub push protection doesn't flag it as a real token.
    const token = "sbp_" + "01020304050607080910" + "11121314151617181920";
    const found = scanContentForSecrets(`token = "${token}"`, "db.ts");
    expect(found[0].kind).toBe("Supabase personal token");
  });

  it("detects Vercel tokens", () => {
    const found = scanContentForSecrets(
      `const t = "vercel_Zq9rT3mN8vL2wX5cB7dF1gH4Zq";`,
      "deploy.ts"
    );
    expect(found[0].kind).toBe("Vercel token");
  });

  it("detects npm tokens", () => {
    const found = scanContentForSecrets(
      `//registry.npmjs.org/:_authToken=npm_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN8vL2`,
      ".npmrc"
    );
    expect(found[0].kind).toBe("npm token");
  });

  it("detects SendGrid keys", () => {
    // Fixture is concatenated so GitHub push protection doesn't flag it as a real key.
    const key =
      "SG." + "Zq9rT3mN8vL2wX5cB7dF1g" + "." + "Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN8vL2wX5cB7d";
    const found = scanContentForSecrets(`sg = "${key}"`, "mail.ts");
    expect(found[0].kind).toBe("SendGrid key");
  });

  it("detects Twilio credentials", () => {
    const found = scanContentForSecrets(
      `const sid = "AC0102030405060708090a0b0c0d0e0f01";`,
      "sms.ts"
    );
    expect(found[0].kind).toBe("Twilio credential");
  });

  it("detects Telegram bot tokens", () => {
    const found = scanContentForSecrets(
      `bot = "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw_"`,
      "bot.ts"
    );
    expect(found[0].kind).toBe("Telegram bot token");
  });

  it("detects database URLs with passwords", () => {
    const found = scanContentForSecrets(
      `const url = "postgres://admin:supersecretpw@db.host.io:5432/app";`,
      "db.ts"
    );
    expect(found[0].kind).toBe("Database URL with password");
  });

  it("detects GCP service account keys", () => {
    const found = scanContentForSecrets(
      `{"type": "service_account", "private_key_id": "0102030405060708091011121314151617181920"}`,
      "sa.json"
    );
    expect(found[0].kind).toBe("GCP service account key");
  });

  it("skips database URLs without a password", () => {
    const found = scanContentForSecrets(
      `const url = "postgres://localhost:5432/app";`,
      "db.ts"
    );
    expect(found).toEqual([]);
  });

  it("respects the allowlist", () => {
    const found = scanContentForSecrets(
      `const k = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN";`,
      "f.ts",
      ["ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN"]
    );
    expect(found).toEqual([]);
  });
});
