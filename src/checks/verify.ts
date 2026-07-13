import type { SecretFinding } from "../types.js";

/**
 * A verifier makes a single, read-only, unauthenticated-side-effect-free
 * request to the provider to determine whether a key is live. It must never
 * mutate remote state. Returns "active" | "inactive" | "unknown".
 */
type Verifier = (raw: string) => Promise<"active" | "inactive" | "unknown">;

const TIMEOUT_MS = 6000;

/** fetch with an AbortController timeout; never throws. */
async function timedFetch(
  url: string,
  init: RequestInit
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps an HTTP status to a verification result using a common convention:
 * 401/403 => the key was understood but rejected (inactive/revoked),
 * 2xx     => accepted (active),
 * anything else (network, 404, 5xx, rate limit) => unknown.
 */
function statusToResult(res: Response | null): "active" | "inactive" | "unknown" {
  if (!res) return "unknown";
  if (res.ok) return "active";
  if (res.status === 401 || res.status === 403) return "inactive";
  return "unknown";
}

/**
 * Verifiers keyed by finding.kind. Only providers with a safe, well-known
 * "who am I" endpoint are included. Everything else stays "unknown".
 */
const VERIFIERS: Record<string, Verifier> = {
  "OpenAI key": async (raw) =>
    statusToResult(
      await timedFetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "Anthropic key": async (raw) => {
    // /v1/models requires the key; 401 => bad key, 200 => good.
    const res = await timedFetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": raw, "anthropic-version": "2023-06-01" },
    });
    return statusToResult(res);
  },
  "GitHub token": async (raw) =>
    statusToResult(
      await timedFetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${raw}`,
          "User-Agent": "shipready",
          Accept: "application/vnd.github+json",
        },
      })
    ),
  "GitLab token": async (raw) =>
    statusToResult(
      await timedFetch("https://gitlab.com/api/v4/user", {
        headers: { "PRIVATE-TOKEN": raw },
      })
    ),
  "Stripe live key": async (raw) =>
    statusToResult(
      await timedFetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "Stripe test key": async (raw) =>
    statusToResult(
      await timedFetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "SendGrid key": async (raw) =>
    statusToResult(
      await timedFetch("https://api.sendgrid.com/v3/scopes", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "Google/Gemini key": async (raw) =>
    statusToResult(
      await timedFetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(raw)}`,
        {}
      )
    ),
  "npm token": async (raw) =>
    statusToResult(
      await timedFetch("https://registry.npmjs.org/-/whoami", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "Hugging Face token": async (raw) =>
    statusToResult(
      await timedFetch("https://huggingface.co/api/whoami-v2", {
        headers: { Authorization: `Bearer ${raw}` },
      })
    ),
  "Figma token": async (raw) =>
    statusToResult(
      await timedFetch("https://api.figma.com/v1/me", {
        headers: { "X-Figma-Token": raw },
      })
    ),
  "GitHub fine-grained token": async (raw) =>
    statusToResult(
      await timedFetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${raw}`,
          "User-Agent": "shipready",
        },
      })
    ),
};

/** Number of providers shipready can actively verify. */
export const VERIFIABLE_KINDS = Object.keys(VERIFIERS);

/**
 * Verifies findings against provider APIs, mutating each finding's
 * `verified` field in place. Runs with limited concurrency and only for
 * findings whose `kind` has a known verifier and whose `raw` value is present.
 */
export async function verifySecrets(
  findings: SecretFinding[],
  concurrency = 5
): Promise<SecretFinding[]> {
  const targets = findings.filter((f) => f.raw && VERIFIERS[f.kind]);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const finding = targets[cursor++];
      try {
        finding.verified = await VERIFIERS[finding.kind](finding.raw as string);
      } catch {
        finding.verified = "unknown";
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker)
  );

  // Findings we didn't verify stay undefined (rendered as no live info).
  return findings;
}
