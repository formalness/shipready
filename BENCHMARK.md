# Benchmark: shipready vs gitleaks

> Date: 2026-07-13 · shipready v1.5.1 vs gitleaks v8.24.3 (latest release)
> Full corpus and methodology below - reproduce it yourself in 2 minutes.

## Corpus

A 3-file project modeled on real-world leaks in vibe-coded apps:

- `src/leaks.js` - 5 real-format secrets: OpenAI (`sk-proj-`), Stripe live, GitHub PAT, Slack bot token, Anthropic (`sk-ant-`)
- `config/.env.backup` - a committed env backup with a production DB URL and a 64-hex JWT secret
- `src/fakes.js` - 10 false-positive baits: placeholders, `sk-proj-XXXX...`, `process.env` references, localhost dev passwords, the Stripe docs test key, a UUID, a bare SHA-1

Total: **7 real leaks, 10 baits.** (AWS docs example keys `AKIAIOSFODNN7EXAMPLE` / `wJalrX...EXAMPLEKEY` were excluded from scoring - both tools correctly skip these documented examples.)

## Results

| Metric | shipready | gitleaks |
| --- | --- | --- |
| Real leaks caught | **7 / 7** | 4 / 7 |
| OpenAI `sk-proj-` key | ✓ error | ✗ missed |
| Anthropic `sk-ant-` key | ✓ error | ✗ missed |
| Prod DB URL in `.env.backup` | ✓ error | ✗ missed |
| JWT secret in `.env.backup` | ✓ warning | ✓ |
| Stripe live / GitHub / Slack | ✓ ✓ ✓ | ✓ ✓ ✓ |
| False positives (error level) | **0** | 1 (Stripe docs test key) |
| Stripe docs test key handling | warning ("rotate if real") | error |
| Scan time (this corpus) | 126 ms | 418 ms |

## Interpretation - being fair to gitleaks

- gitleaks is a **history-focused** tool with hundreds of rules; its default ruleset simply lagged on the newer `sk-proj-` and `sk-ant-` key formats at the time of testing. Rules can be extended by hand.
- gitleaks scans **git history by default**, which shipready only does with `--history`. On history scanning depth, gitleaks remains more battle-tested.
- shipready checks more than secrets (README, env hygiene, .gitignore, code hygiene) - the comparison here covers only the secrets overlap.
- Scan time on a 3-file corpus is not a meaningful throughput benchmark; treat it as startup overhead only.

## What this benchmark changed in shipready

Benchmarking found two real gaps, fixed in v1.5.1:

1. **Committed `.env.backup` files were skipped entirely** (the `.env*` skip rule was too broad). Now only standard names (`.env`, `.env.local`, `.env.production`, ...) are exempt; backups like `.env.backup`/`.env.old` are scanned.
2. **Unquoted dotenv-style assignments** (`JWT_SECRET=c8f3...` with no quotes) were missed by the generic credential pattern. A line-anchored unquoted variant now catches them.

## Reproduce

```bash
mkdir bench && cd bench
# create the corpus files as listed above, then:
npx shipready check . --json
gitleaks dir . --no-banner --report-format json --report-path gl.json --exit-code 0
```
