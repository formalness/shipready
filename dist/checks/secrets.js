const PATTERNS = [
    { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
    { kind: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/ },
    { kind: "Google/Gemini key", re: /\bAIza[A-Za-z0-9_-]{30,}\b/ },
    { kind: "GitHub token", re: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
    { kind: "Stripe live key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
    { kind: "Slack token", re: /\bxox[bp]-[A-Za-z0-9-]{10,}\b/ },
    { kind: "AWS access key", re: /\bAKIA[A-Z0-9]{16}\b/ },
    { kind: "Supabase personal token", re: /\bsbp_[a-f0-9]{40}\b/ },
    { kind: "Vercel token", re: /\bvercel_[A-Za-z0-9]{24,}\b/ },
    { kind: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/ },
    { kind: "SendGrid key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
    { kind: "Twilio credential", re: /\b(?:AC|SK)[a-f0-9]{32}\b/ },
    { kind: "Telegram bot token", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
    {
        kind: "Database URL with password",
        re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:\s"'@/]+:[^@\s"']+@/,
    },
    {
        kind: "Private key block",
        re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
    },
    {
        kind: "GCP service account key",
        re: /"private_key_id"\s*:\s*"[a-f0-9]{20,}"/,
    },
    {
        kind: "JWT",
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    },
    {
        // Credential-style assignment with a long opaque value
        kind: "Hardcoded credential",
        re: /\b(?:API_KEY|APIKEY|SECRET|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{16,}["']?/i,
    },
];
/** Values that indicate a placeholder, not a real secret. */
const PLACEHOLDER_RE = /your[-_ ]?|example|placeholder|changeme|change[-_ ]me|dummy|fake|test[-_ ]?key|<[^>]*>|x{4,}|\*{4,}|123456|abcdef/i;
/** Masks a secret, keeping a short prefix and suffix. */
export function maskSecret(secret) {
    if (secret.length <= 8)
        return "*".repeat(secret.length);
    // Keep a recognizable prefix (e.g. "sk-proj-ab") and last 4 chars.
    const prefixMatch = secret.match(/^(sk-ant-|sk-proj-|sk-|sk_live_|rk_live_|ghp_|github_pat_|AIza|xoxb-|xoxp-|AKIA|sbp_|vercel_|npm_|SG\.|AC|SK|eyJ)/);
    const prefixLen = (prefixMatch?.[0].length ?? 0) + 2;
    const prefix = secret.slice(0, Math.min(prefixLen, secret.length - 4));
    const suffix = secret.slice(-4);
    return `${prefix}...${suffix}`;
}
/** Scans a single file's content for potential secrets. */
export function scanContentForSecrets(content, file, allowlist = []) {
    const found = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip obvious placeholder lines and comments about examples
        if (PLACEHOLDER_RE.test(line))
            continue;
        for (const { kind, re } of PATTERNS) {
            const match = line.match(re);
            if (match) {
                // User-configured false positives (substring match on the value or line)
                if (allowlist.some((a) => match[0].includes(a) || line.includes(a))) {
                    continue;
                }
                found.push({
                    kind,
                    file,
                    line: i + 1,
                    masked: maskSecret(match[0]),
                });
                break; // one finding per line is enough
            }
        }
    }
    return found;
}
/** Builds the CheckResult from all secret findings. */
export function checkSecrets(secretFindings) {
    const findings = [];
    if (secretFindings.length === 0) {
        findings.push({
            severity: "success",
            rule: "secrets.none",
            message: "No obvious secrets found",
        });
    }
    else {
        findings.push({
            severity: "error",
            rule: "secrets.detected",
            message: `${secretFindings.length} potential secret${secretFindings.length > 1 ? "s" : ""} detected`,
        });
        for (const s of secretFindings) {
            findings.push({
                severity: "error",
                rule: "secrets.detected-item",
                message: `${s.kind}: ${s.masked}`,
                file: s.file,
                line: s.line,
            });
        }
    }
    return { name: "secrets", findings };
}
