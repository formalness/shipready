import type { CheckResult, Finding, SecretFinding } from "../types.js";
import {
  hasLongRepeat,
  hasSequentialRun,
  shannonEntropy,
} from "../utils/entropy.js";

/** Confidence of a finding: high -> error, medium -> warning. */
export type Confidence = "high" | "medium";

interface SecretPattern {
  kind: string;
  re: RegExp;
  confidence: Confidence;
  /** Capture group index holding the secret value (defaults to whole match). */
  group?: number;
  /**
   * Capture group holding the host of a credential URL. Localhost hosts
   * downgrade the finding to medium; common dev passwords are skipped.
   */
  hostGroup?: number;
  /** Minimum Shannon entropy required for the matched value. */
  minEntropy?: number;
  /** Skip placeholder/randomness value checks (e.g. PEM headers are structural). */
  skipValueChecks?: boolean;
  /**
   * True for shape-based patterns (generic assignments, opaque hex, URLs)
   * that often match fabricated values in test fixtures. Only these are
   * downgraded to medium confidence under test paths - provider-prefixed
   * keys (AKIA..., ghp_..., sk-ant-...) look real wherever they appear,
   * and AI tools paste real keys into test files all the time.
   */
  generic?: boolean;
}

/**
 * Ordered pattern list: most specific first. The first matching pattern
 * wins for a given line.
 */
const PATTERNS: SecretPattern[] = [
  {
    kind: "Private key block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
    confidence: "high",
    skipValueChecks: true,
  },
  {
    kind: "AWS access key ID",
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/,
    confidence: "high",
  },
  {
    kind: "AWS secret access key",
    re: /\baws_?secret_?access_?key\b.{0,10}[=:]\s*["']?([A-Za-z0-9/+=]{40})\b/i,
    confidence: "high",
    group: 1,
    minEntropy: 3.5,
  },
  {
    kind: "GitHub token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    confidence: "high",
  },
  {
    kind: "GitLab token",
    re: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
    confidence: "high",
  },
  { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, confidence: "high" },
  {
    kind: "OpenAI key",
    re: /\bsk-(?:proj-|svcacct-|None-)?[A-Za-z0-9_-]{16,}\b/,
    confidence: "high",
    minEntropy: 3.2,
  },
  {
    kind: "Google/Gemini key",
    re: /\bAIza[A-Za-z0-9_-]{30,}\b/,
    confidence: "high",
  },
  {
    kind: "Stripe live key",
    re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
    confidence: "high",
  },
  {
    kind: "Stripe webhook secret",
    re: /\bwhsec_[A-Za-z0-9]{24,}\b/,
    confidence: "high",
  },
  {
    kind: "Stripe test key",
    re: /\b(?:sk|rk)_test_[A-Za-z0-9]{16,}\b/,
    confidence: "medium",
  },
  {
    kind: "Slack token",
    re: /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/,
    confidence: "high",
  },
  {
    kind: "Slack webhook URL",
    re: /hooks\.slack\.com\/services\/T[A-Z0-9]{5,}\/B[A-Z0-9]{5,}\/[A-Za-z0-9]{18,}/,
    confidence: "high",
  },
  {
    kind: "SendGrid key",
    re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
    confidence: "high",
  },
  {
    kind: "Twilio credential",
    generic: true,
    re: /\b(?:AC|SK)[a-f0-9]{32}\b/,
    confidence: "high",
  },
  {
    kind: "Telegram bot token",
    generic: true,
    re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/,
    confidence: "high",
  },
  { kind: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/, confidence: "high" },
  {
    kind: "Supabase personal token",
    re: /\bsbp_[a-f0-9]{40}\b/,
    confidence: "high",
  },
  {
    kind: "Vercel token",
    re: /\bvercel_[A-Za-z0-9]{24,}\b/,
    confidence: "high",
  },
  {
    kind: "DigitalOcean token",
    re: /\bdo[pors]_v1_[a-f0-9]{64}\b/,
    confidence: "high",
  },
  {
    kind: "Shopify token",
    re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/,
    confidence: "high",
  },
  {
    kind: "Mailchimp key",
    generic: true,
    re: /\b[a-f0-9]{32}-us\d{1,2}\b/,
    confidence: "high",
  },
  {
    kind: "Mailgun key",
    generic: true,
    re: /\bkey-[a-f0-9]{32}\b/,
    confidence: "high",
  },
  {
    kind: "Airtable token",
    re: /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{64}\b/,
    confidence: "high",
  },
  {
    kind: "Notion token",
    re: /\b(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{40,})\b/,
    confidence: "high",
  },
  {
    kind: "Linear key",
    re: /\blin_api_[A-Za-z0-9]{40,}\b/,
    confidence: "high",
  },
  {
    kind: "Figma token",
    re: /\bfigd_[A-Za-z0-9_-]{40,}\b/,
    confidence: "high",
  },
  {
    kind: "Hugging Face token",
    re: /\bhf_[A-Za-z0-9]{30,}\b/,
    confidence: "high",
  },
  { kind: "Groq key", re: /\bgsk_[A-Za-z0-9]{30,}\b/, confidence: "high" },
  {
    kind: "Replicate token",
    re: /\br8_[A-Za-z0-9]{30,}\b/,
    confidence: "high",
  },
  {
    kind: "Perplexity key",
    re: /\bpplx-[A-Za-z0-9]{40,}\b/,
    confidence: "high",
  },
  {
    kind: "Databricks token",
    re: /\bdapi[a-f0-9]{32}\b/,
    confidence: "high",
  },
  {
    kind: "Doppler token",
    re: /\bdp\.pt\.[A-Za-z0-9]{40,}\b/,
    confidence: "high",
  },
  {
    kind: "Postman key",
    re: /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/,
    confidence: "high",
  },
  {
    kind: "PyPI token",
    re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/,
    confidence: "high",
  },
  {
    kind: "Sentry token",
    re: /\bsntrys_[A-Za-z0-9_+/=.-]{40,}\b/,
    confidence: "high",
  },
  {
    kind: "GCP service account key",
    re: /"private_key_id"\s*:\s*"[a-f0-9]{20,}"/,
    confidence: "high",
    skipValueChecks: true,
  },
  {
    kind: "Discord webhook URL",
    re: /discord(?:app)?\.com\/api\/webhooks\/\d{15,20}\/[A-Za-z0-9_-]{60,}/,
    confidence: "high",
  },
  {
    kind: "Discord bot token",
    generic: true,
    re: /\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/,
    confidence: "medium",
    minEntropy: 4.0,
  },
  {
    // Placeholder checks run against the password only (group 1), so
    // documentation hosts like db.example.com don't suppress real leaks.
    // The host (group 2) downgrades localhost URLs to medium confidence.
    kind: "Database URL with password",
    generic: true,
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:\s"'@/]+:([^@\s"']+)@([^\s"'/:?]+)/,
    confidence: "high",
    group: 1,
    hostGroup: 2,
  },
  {
    kind: "Basic auth in URL",
    generic: true,
    re: /https?:\/\/[^:\s"'/@]{3,}:([^@\s"']{8,})@([^\s"'/:?]+)/,
    confidence: "medium",
    group: 1,
    hostGroup: 2,
    minEntropy: 3.0,
  },
  {
    kind: "JWT",
    generic: true,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    confidence: "medium",
    minEntropy: 4.0,
  },
  {
    kind: "Authorization header",
    generic: true,
    re: /\b(?:authorization|x-api-key)["']?\s*[:=]\s*["']?(?:Bearer|Basic|token)\s+([A-Za-z0-9+/_.=-]{20,})\b/i,
    confidence: "medium",
    group: 1,
    minEntropy: 3.5,
  },
  {
    // Credential-style assignment with a long opaque quoted value
    kind: "Hardcoded credential",
    generic: true,
    re: /\b[A-Z0-9_]*(?:API_?KEY|SECRET(?:_KEY)?|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*\s*[=:]\s*["']([A-Za-z0-9+/_.=-]{16,})["']/i,
    confidence: "medium",
    group: 1,
    minEntropy: 3.8,
  },
  {
    // Unquoted dotenv-style assignment (KEY=value at line start). Catches
    // committed .env backups where values carry no quotes - a gap found by
    // benchmarking against gitleaks. Anchored to line start so ordinary
    // code assignments (always quoted) don't double-match.
    kind: "Hardcoded credential",
    generic: true,
    re: /^[A-Z0-9_]*(?:API_?KEY|SECRET(?:_KEY)?|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*=([A-Za-z0-9+/_.=-]{16,})\s*$/,
    confidence: "medium",
    group: 1,
    minEntropy: 3.8,
  },
];

/** Words and shapes that indicate a placeholder, not a real secret. */
const PLACEHOLDER_VALUE_RE =
  /your[-_ ]?|example|sample|placeholder|change[-_ ]?me|dummy|fake|insert|replace|redacted|deadbeef|lorem|goes[-_ ]?here|test[-_ ]?key|x{4,}|\*{3,}|\.\.\.|123456|abcdef/i;

/**
 * Line-level markers for documentation/example lines. Deliberately narrow:
 * broad words like "example" would hide real keys on lines that merely
 * mention example.com. Value-level checks handle those instead.
 */
const PLACEHOLDER_LINE_RE =
  /\b(?:do not commit|for docs only|shipready-ignore)\b|<[A-Z_][A-Z0-9_ -]*>/i;

/** Paths whose findings are downgraded to medium confidence. */
const TEST_PATH_RE =
  /(^|[/\\])(tests?|__tests__|__mocks__|spec|specs|fixtures?|mocks?|examples?|samples?|docs?)([/\\]|$)|\.(test|spec)\.[a-z]+$/i;

/**
 * Default/dev passwords that appear in scaffolding templates and docker
 * compose files. A URL credential equal to one of these is not a leak.
 */
const COMMON_DEV_PASSWORD_RE =
  /^(?:password|passwd|pass|root|admin|postgres|mysql|mongo|redis|rabbitmq|secret|test|dev|guest|user|toor|changeit|letmein|qwerty)$/i;

/** Hosts that indicate a local dev database, not a production leak. */
const LOCAL_HOST_RE =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal|db|database|postgres|mysql|mongo|redis)$/i;

/** True when a matched value looks like a placeholder or templated string. */
function isPlaceholderValue(value: string): boolean {
  if (PLACEHOLDER_VALUE_RE.test(value)) return true;
  if (value.includes("${") || value.includes("{{") || value.includes("%s")) {
    return true;
  }
  if (hasLongRepeat(value)) return true;
  if (hasSequentialRun(value)) return true;
  return false;
}

/** Masks a secret, keeping a short recognizable prefix and last 4 chars. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "*".repeat(secret.length);
  const prefixMatch = secret.match(
    /^(sk-ant-|sk-proj-|sk-svcacct-|sk-|sk_live_|sk_test_|rk_live_|rk_test_|whsec_|gh[pousr]_|github_pat_|glpat-|AIza|xox[abpsr]-|AKIA|ASIA|sbp_|vercel_|npm_|SG\.|dop_v1_|doo_v1_|dor_v1_|dos_v1_|shpat_|shpca_|shppa_|shpss_|hf_|gsk_|r8_|pplx-|lin_api_|figd_|secret_|ntn_|dapi|dp\.pt\.|PMAK-|pypi-|sntrys_|key-|glsa_|AC|SK|eyJ|pat)/
  );
  const prefixLen = (prefixMatch?.[0].length ?? 0) + 2;
  const prefix = secret.slice(0, Math.min(prefixLen, secret.length - 4));
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Global-flag copies of each pattern for matchAll. Compiled once - the
 * originals stay non-global so .test()/.match() callers keep working.
 */
const GLOBAL_PATTERN_RES: RegExp[] = PATTERNS.map(
  (p) => new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`)
);

/** Credential-keyword assignment with no value on the same line. */
const DANGLING_ASSIGNMENT_RE =
  /\b[A-Z0-9_]*(?:API_?KEY|SECRET(?:_KEY)?|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*\s*[=:]\s*$/i;

/** Quoted opaque value at the start of a continuation line. */
const CONTINUATION_VALUE_RE = /^\s*["']([A-Za-z0-9+/_.=-]{16,})["']/;

/** Scans a single file's content for potential secrets. */
export function scanContentForSecrets(
  content: string,
  file: string,
  allowlist: string[] = []
): SecretFinding[] {
  const found: SecretFinding[] = [];
  const lines = content.split("\n");
  const isTestPath = TEST_PATH_RE.test(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bundled/minified single-line blobs are noise, not user code.
    if (line.length > 10000) continue;
    // Documentation/example lines are not real leaks.
    if (PLACEHOLDER_LINE_RE.test(line)) continue;

    // Character spans already claimed by a more specific pattern. Patterns
    // are ordered most specific first, so the first pattern to claim a span
    // wins - but distinct secrets elsewhere on the same line (e.g. two keys
    // in one config object) are still reported.
    const claimed: Array<[number, number]> = [];
    const overlapsClaimed = (start: number, end: number) =>
      claimed.some(([s, e]) => start < e && end > s);

    for (let pi = 0; pi < PATTERNS.length; pi++) {
      const pattern = PATTERNS[pi];
      for (const match of line.matchAll(GLOBAL_PATTERN_RES[pi])) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (overlapsClaimed(start, end)) continue;

        const value = match[pattern.group ?? 0];

        if (!pattern.skipValueChecks) {
          if (isPlaceholderValue(value)) continue;
          if (
            pattern.minEntropy !== undefined &&
            shannonEntropy(value) < pattern.minEntropy
          ) {
            continue;
          }
        }

        // User-configured false positives (substring match on the value or line)
        if (allowlist.some((a) => match[0].includes(a) || line.includes(a))) {
          continue;
        }

        let effective: Confidence = pattern.confidence;
        if (pattern.hostGroup !== undefined) {
          // Scaffolding defaults like root:password@localhost are not leaks.
          if (COMMON_DEV_PASSWORD_RE.test(value)) continue;
          const host = match[pattern.hostGroup] ?? "";
          if (LOCAL_HOST_RE.test(host)) effective = "medium";
        }

        // Test paths only downgrade shape-based patterns. A provider-prefixed
        // key that survived the entropy/placeholder gates looks real, and a
        // real key in a test fixture is just as leaked as one in src/.
        const confidence: Confidence =
          isTestPath && pattern.generic ? "medium" : effective;

        claimed.push([start, end]);
        found.push({
          kind: pattern.kind,
          file,
          line: i + 1,
          masked: maskSecret(value),
          confidence,
          // Raw value stays in memory only; used by --verify, never printed.
          raw: value,
        });
      }
    }

    // Multiline credential assignment: keyword on one line, quoted value on
    // the next (formatters wrap long lines this way). Only runs when the
    // value line alone matches no pattern - provider-prefixed values are
    // caught by the normal per-line scan on the next iteration.
    if (i + 1 < lines.length && DANGLING_ASSIGNMENT_RE.test(line)) {
      const next = lines[i + 1];
      const valueMatch = next.match(CONTINUATION_VALUE_RE);
      if (
        valueMatch &&
        !PLACEHOLDER_LINE_RE.test(next) &&
        !PATTERNS.some((p) => p.re.test(valueMatch[1]))
      ) {
        const value = valueMatch[1];
        if (
          !isPlaceholderValue(value) &&
          shannonEntropy(value) >= 3.8 &&
          !allowlist.some((a) => value.includes(a) || next.includes(a))
        ) {
          found.push({
            kind: "Hardcoded credential",
            file,
            line: i + 2,
            masked: maskSecret(value),
            confidence: "medium",
            raw: value,
          });
        }
      }
    }
  }
  return found;
}

/** Builds the CheckResult from all secret findings. */
export function checkSecrets(secretFindings: SecretFinding[]): CheckResult {
  const findings: Finding[] = [];
  const high = secretFindings.filter((s) => s.confidence !== "medium");
  const medium = secretFindings.filter((s) => s.confidence === "medium");

  if (secretFindings.length === 0) {
    findings.push({
      severity: "success",
      rule: "secrets.none",
      message: "No obvious secrets found",
    });
    return { name: "secrets", findings };
  }

  const verifiedActive = secretFindings.filter((s) => s.verified === "active");
  if (verifiedActive.length > 0) {
    findings.push({
      severity: "error",
      rule: "secrets.verified-active",
      message: `${verifiedActive.length} key${verifiedActive.length > 1 ? "s" : ""} VERIFIED ACTIVE - rotate immediately`,
    });
  }

  /** Suffix describing the live verification result, when available. */
  const verifyNote = (s: SecretFinding): string => {
    if (s.verified === "active") return " [VERIFIED ACTIVE]";
    if (s.verified === "inactive") return " [not active - rotate anyway]";
    return "";
  };

  if (high.length > 0) {
    findings.push({
      severity: "error",
      rule: "secrets.detected",
      message: `${high.length} potential secret${high.length > 1 ? "s" : ""} detected`,
    });
    for (const s of high) {
      findings.push({
        severity: "error",
        rule: "secrets.detected-item",
        message: `${s.kind}: ${s.masked}${verifyNote(s)}`,
        file: s.file,
        line: s.line,
      });
    }
  }

  if (medium.length > 0) {
    findings.push({
      severity: "warning",
      rule: "secrets.possible",
      message: `${medium.length} possible secret${medium.length > 1 ? "s" : ""} detected (lower confidence)`,
    });
    for (const s of medium) {
      findings.push({
        // A verified-active key is an error no matter the pattern confidence.
        severity: s.verified === "active" ? "error" : "warning",
        rule: s.verified === "active" ? "secrets.detected-item" : "secrets.possible-item",
        message: `${s.kind}: ${s.masked}${verifyNote(s)}`,
        file: s.file,
        line: s.line,
      });
    }
  }

  return { name: "secrets", findings };
}
