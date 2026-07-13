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

  it("catches DB passwords even when the host mentions example.com", () => {
    const found = scanContentForSecrets(
      `const DB_URL = "postgres://admin:hunter2password@db.example.com:5432/prod";`,
      "config.js"
    );
    expect(found[0].kind).toBe("Database URL with password");
    expect(found[0].confidence).toBe("high");
  });

  it("skips DB URLs whose password itself is a placeholder", () => {
    const found = scanContentForSecrets(
      `const DB_URL = "postgres://user:example@db.host.com:5432/db";`,
      "docs.md"
    );
    expect(found).toEqual([]);
  });

  it("skips scaffolding defaults like root:password@localhost", () => {
    const found = scanContentForSecrets(
      `DATABASE_URL="mysql://root:password@localhost:3306/myapp"`,
      "cli/installers/envVars.ts"
    );
    expect(found).toEqual([]);
  });

  it("skips root:root style docker-compose credentials", () => {
    const found = scanContentForSecrets(
      `DATABASE_URL: mysql://root:root@localhost:3306/test`,
      ".github/workflows/e2e.yml"
    );
    expect(found).toEqual([]);
  });

  it("downgrades real-looking passwords on localhost to medium", () => {
    const found = scanContentForSecrets(
      `const DB = "postgres://app:Xk9mQ2vR8tN4wY6b@localhost:5432/dev";`,
      "src/db.ts"
    );
    expect(found[0].kind).toBe("Database URL with password");
    expect(found[0].confidence).toBe("medium");
  });

  it("keeps high confidence for real passwords on remote hosts", () => {
    const found = scanContentForSecrets(
      `const DB = "postgres://app:Xk9mQ2vR8tN4wY6b@db.company.io:5432/prod";`,
      "src/db.ts"
    );
    expect(found[0].confidence).toBe("high");
  });

  it("catches unquoted dotenv-style credentials (committed .env backups)", () => {
    const found = scanContentForSecrets(
      "JWT_SECRET=c8f3a9d2e7b1f4a6c0d5e8b3f7a2c9d4e1b6f0a5c8d3e7b2f9a4c1d6e0b5f8a3",
      ".env.backup"
    );
    expect(found[0].kind).toBe("Hardcoded credential");
  });

  it("does not flag unquoted env references to other variables", () => {
    const found = scanContentForSecrets(
      "API_KEY=${SHARED_API_KEY}",
      ".env.backup"
    );
    expect(found).toEqual([]);
  });

  it("catches real keys on lines that merely mention example.com", () => {
    const found = scanContentForSecrets(
      `fetch("https://api.example.com", { headers: { t: "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN" } })`,
      "src/client.ts"
    );
    expect(found[0].kind).toBe("GitHub token");
  });

  it("honors shipready-ignore line marker", () => {
    const found = scanContentForSecrets(
      `const k = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN"; // shipready-ignore`,
      "src/client.ts"
    );
    expect(found).toEqual([]);
  });

  it("detects GitLab tokens", () => {
    // Fixture is concatenated at runtime so GitHub push protection
    // does not mistake it for a real credential in source.
    const v = "glpat-" + "Zq9rT3mN8v" + "L2wX5cB7dF";
    const found = scanContentForSecrets(`token = "${v}"`, "ci.ts");
    expect(found[0].kind).toBe("GitLab token");
    expect(found[0].confidence).toBe("high");
  });

  it("detects DigitalOcean tokens", () => {
    const hex = "9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c" + "3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a";
    const found = scanContentForSecrets(`t = "dop_v1_${hex}"`, "do.ts");
    expect(found[0].kind).toBe("DigitalOcean token");
  });

  it("detects Hugging Face tokens", () => {
    const found = scanContentForSecrets(
      `hf = "hf_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN"`,
      "ml.ts"
    );
    expect(found[0].kind).toBe("Hugging Face token");
  });

  it("detects Shopify tokens", () => {
    const v = "shpat_" + "9f8a7b6c5d4e3f2a" + "1b0c9d8e7f6a5b4c";
    const found = scanContentForSecrets(`s = "${v}"`, "shop.ts");
    expect(found[0].kind).toBe("Shopify token");
  });

  it("detects Mailchimp keys", () => {
    const v = "9f8a7b6c5d4e3f2a" + "1b0c9d8e7f6a5b4c" + "-us12";
    const found = scanContentForSecrets(`mc = "${v}"`, "mail.ts");
    expect(found[0].kind).toBe("Mailchimp key");
  });

  it("detects Slack webhook URLs", () => {
    // Concatenated so GitHub push protection does not flag the fixture.
    const u =
      "https://hooks.slack.com" +
      "/services/T0AB1CD2E" +
      "/B9XY8ZW7V" +
      "/Zq9rT3mN8vL2" +
      "wX5cB7dF1gH4";
    const found = scanContentForSecrets(`url = "${u}"`, "notify.ts");
    expect(found[0].kind).toBe("Slack webhook URL");
  });

  it("detects Discord webhook URLs", () => {
    const path = "Zq9rT3mN8vL2wX5cB7dF1gH4" + "Zq9rT3mN8vL2wX5cB7dF1gH4" + "Zq9rT3mN8vL2";
    const found = scanContentForSecrets(
      `hook = "https://discord.com/api/webhooks/993057288103746591/${path}"`,
      "bot.ts"
    );
    expect(found[0].kind).toBe("Discord webhook URL");
  });

  it("detects Stripe webhook secrets", () => {
    const found = scanContentForSecrets(
      `whs = "whsec_Zq9rT3mN8vL2wX5cB7dF1gH4Zq"`,
      "stripe.ts"
    );
    expect(found[0].kind).toBe("Stripe webhook secret");
  });

  it("flags Stripe test keys as medium confidence", () => {
    const found = scanContentForSecrets(
      `k = "sk_test_Zq9rT3mN8vL2wX5cB7dF"`,
      "pay.ts"
    );
    expect(found[0].kind).toBe("Stripe test key");
    expect(found[0].confidence).toBe("medium");
  });

  it("detects AWS access key IDs", () => {
    const found = scanContentForSecrets(
      `key = "AKIAZQ9RT3MN8VL2WX5C"`,
      "aws.ts"
    );
    expect(found[0].kind).toBe("AWS access key ID");
  });

  it("detects AWS secret access keys by assignment", () => {
    const v = "Zq9rT3mN8vL2wX5cB7dF" + "1gH4Jk6Pq2Rs8Tu0Vw3X";
    const found = scanContentForSecrets(
      `aws_secret_access_key = "${v}"`,
      "aws.ts"
    );
    expect(found[0].kind).toBe("AWS secret access key");
  });

  it("skips values with long character repeats", () => {
    const found = scanContentForSecrets(
      `const k = "sk-proj-aaaaaaaaaaaaaaaaaaaaaa";`,
      "src/ai.ts"
    );
    expect(found).toEqual([]);
  });

  it("skips templated values", () => {
    const found = scanContentForSecrets(
      "const h = `Authorization: Bearer ${process.env.TOKEN}`;",
      "api.ts"
    );
    expect(found).toEqual([]);
  });

  it("skips low-entropy credential assignments", () => {
    const found = scanContentForSecrets(
      `const PASSWORD = "correcthorsebattery";`,
      "auth.ts"
    );
    expect(found).toEqual([]);
  });

  it("flags high-entropy credential assignments as medium", () => {
    const found = scanContentForSecrets(
      `const API_KEY = "9fQ3kZ8vLmXcR2tB7dNpW4Ys6Ju1Hg5E";`,
      "config.ts"
    );
    expect(found[0].kind).toBe("Hardcoded credential");
    expect(found[0].confidence).toBe("medium");
  });

  it("downgrades findings in test files to medium confidence", () => {
    const found = scanContentForSecrets(
      `token: "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN9xW2"`,
      "tests/fixtures.test.ts"
    );
    expect(found[0].confidence).toBe("medium");
  });

  it("keeps high confidence outside test paths", () => {
    const found = scanContentForSecrets(
      `token: "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN9xW2"`,
      "src/deploy.ts"
    );
    expect(found[0].confidence).toBe("high");
  });

  it("skips bundled single-line blobs", () => {
    const blob = `x = "ghp_Zq9rT3mN8vL2wX5cB7dF1gH4Zq9rT3mN9xW2";` + "y".repeat(10001);
    const found = scanContentForSecrets(blob, "app.js");
    expect(found).toEqual([]);
  });
});

describe("checkSecrets severity mapping", () => {
  it("maps high confidence to errors and medium to warnings", async () => {
    const { checkSecrets } = await import("../src/checks/secrets.js");
    const result = checkSecrets([
      { kind: "GitHub token", file: "a.ts", line: 1, masked: "ghp_...111", confidence: "high" },
      { kind: "JWT", file: "b.ts", line: 2, masked: "eyJ...222", confidence: "medium" },
    ]);
    const errors = result.findings.filter((f) => f.severity === "error");
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(errors.some((f) => f.rule === "secrets.detected-item")).toBe(true);
    expect(warnings.some((f) => f.rule === "secrets.possible-item")).toBe(true);
  });

  it("treats missing confidence as high", async () => {
    const { checkSecrets } = await import("../src/checks/secrets.js");
    const result = checkSecrets([
      { kind: "OpenAI key", file: "a.ts", line: 1, masked: "sk-...111" },
    ]);
    expect(result.findings[0].severity).toBe("error");
  });
});
