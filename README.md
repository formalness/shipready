# shipready

> Pre-flight check for your repo before shipping.

[![CI](https://github.com/formalness/shipready/actions/workflows/ci.yml/badge.svg)](https://github.com/formalness/shipready/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/shipready.svg)](https://www.npmjs.com/package/shipready)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

shipready is a CLI for developers who build with AI and vibe-coding tools. It scans your project for the things AI-generated code tends to leave behind — hardcoded secrets, missing `.env.example` files, debug logs, unfinished TODOs, and broken repo hygiene — and helps you fix them before you ship.

**No API key required. Works fully offline. No telemetry.**

## Why shipready exists

AI coding tools are great at producing working code fast, but they routinely:

- paste API keys directly into source files
- forget `.env.example` while sprinkling `process.env.X` everywhere
- leave `console.log`, `debugger`, and `TODO` breadcrumbs all over
- skip README setup instructions entirely
- ignore `.gitignore` hygiene

shipready catches all of that in seconds, scores your repo, and can auto-fix the safe stuff.

## Installation

```bash
# Run directly
npx shipready check

# Or install globally
npm install -g shipready
shipready check
```

## Usage

```bash
shipready check  [path]   # scan a project (current dir by default)
shipready staged [path]   # fast secrets-only scan of staged files (pre-commit)
shipready init   [path]   # generate AI-agent instruction files
shipready fix    [path]   # apply safe automatic fixes (--dry-run to preview)
```

## Commands

### `shipready check [path]`

Scans the project and prints a report with a 0-100 score.

| Flag | Effect |
| --- | --- |
| `-v, --verbose` | show file and line locations for every finding |
| `--json` | output the raw structured report as JSON (great for CI) |
| `--sarif` | output SARIF 2.1.0 for **GitHub code scanning** — findings become native PR alerts |
| `--fix` | apply safe fixes, re-scan, and show the score before/after |
| `--history` | also scan the **full git history** (all branches) for secrets that were committed and later removed |
| `--verify` | check detected keys against provider APIs to see if they are **live right now** |

Exits with code `1` when errors are found, so you can use it in CI pipelines.

#### `--history`: secrets buried in old commits

Deleting a leaked key from your code does not delete it from git history — anyone who clones the repo can still read it. `shipready check --history` scans every added line in every commit on every branch, dedupes findings, and skips anything still present in the working tree (the regular scan already covers those). Each finding shows the abbreviated commit hash so you know where to look.

If something is found: rotate the key, then purge it with [git filter-repo](https://github.com/newren/git-filter-repo) or [BFG](https://rtyley.github.io/bfg-repo-cleaner/).

#### `--verify`: is the key actually live?

For 12+ providers (OpenAI, Anthropic, GitHub, GitLab, Stripe, SendGrid, Google, npm, Hugging Face, Figma, and more) shipready can make a single read-only "who am I" request to the provider's API:

- `[VERIFIED ACTIVE]` — the key works right now; this upgrades the finding to an error and jumps to the top of next steps
- `[not active - rotate anyway]` — the provider rejected it (revoked or fake)
- no marker — the provider has no safe verification endpoint, or the network was unavailable

Verification requests contain only the key itself, go directly to the provider's official API host, and never mutate remote state. Nothing is ever sent to any third party.

### `shipready staged [path]`

Fast, secrets-only scan of the files **staged for commit** — built for pre-commit hooks. It reads content from the git index (`git show :file`), so partially staged files are checked exactly as they would be committed, not as they sit on disk.

- High-confidence secrets **block the commit** (exit code 1)
- Medium-confidence findings warn but do not block
- TODO/console.log are deliberately not checked — hooks must be fast and only stop real dangers

Hook setup with [husky](https://typicode.github.io/husky/):

```bash
npx husky init
echo "npx shipready staged" > .husky/pre-commit
```

Or plain git:

```bash
echo 'npx shipready staged' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

### `shipready init [path]`

Generates AI-agent instruction files based on your detected framework, package manager, and scripts:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/shipready.md`

Existing files are never overwritten unless you pass `--force`.

### `shipready fix [path]`

Applies safe automatic fixes:

- creates `.env.example` from detected `process.env.X` usages (keys only, no values)
- adds missing entries to `.gitignore` (`.env`, `node_modules`, `dist`, ...)
- generates the AI-agent files above if missing

It never deletes user code and never overwrites files without `--force`. A summary of changed files is printed at the end.

Pass `--dry-run` to preview exactly what would change — nothing is written to disk:

```txt
shipready fix --dry-run

+ would create .env.example
    | # Environment variables used by this project.
    | API_URL=
+ would create .gitignore
    | .env
    | node_modules

2 files would change. Run without --dry-run to apply.
```

## Example output

```txt
╭──────────────────────────────────────────────────────────╮
│ shipready v1.3.0                                         │
│ project Next.js  ·  pm pnpm                              │
╰──────────────────────────────────────────────────────────╯

  Score  ████████████████████░░░░░░░░  72/100  almost there

  ✓ package.json  ok
  ✓ README        ok
  ✗ Env safety    .env.example missing (3 env vars used in code)
  ✗                .env is not ignored by git
  ✓ Secrets       No obvious secrets found
  ✗ Git history   1 secret buried in git history (removed from code but still exposed)
  ⚠ Code hygiene  4 TODO/FIXME comments found
  ⚠                2 console.log calls found
  ✓ .gitignore    ok

  Next steps
    1. Purge leaked secrets from git history (BFG or git filter-repo) and rotate them
    2. Add .env to .gitignore
    3. Create .env.example (run: shipready fix)
    4. Remove debug logs and debugger statements before shipping
```

## What it checks

| Check | What it looks for |
| --- | --- |
| **package.json** | Existence, package manager (lockfiles), framework, `dev`/`build`/`test`/`lint` scripts |
| **README** | Existence, installation/usage/license sections, not-too-empty |
| **Env safety** | `.env` gitignored, `.env.example` present and complete, no real values in examples |
| **Secrets** | 30+ token patterns with entropy analysis and confidence levels, all masked in output (see table below) |
| **Debug leftovers** | `TODO`, `FIXME`, `HACK`, `XXX`, `console.log`, `debugger`, `throw new Error("Not implemented")` |
| **.gitignore** | Existence and important entries (`.env`, `node_modules`, `dist`, `build`, `.next`) |

Ignored during scans: `node_modules`, `.git`, `dist`, `build`, `.next`, `out`, `coverage`, `.cache`.

## Detected secrets

The scanner combines provider-specific patterns with **Shannon entropy analysis** so that placeholders, examples, and templated values never pollute the report.

**High confidence** (reported as errors):

| Type | Recognized by |
| --- | --- |
| OpenAI | `sk-`, `sk-proj-` |
| Anthropic | `sk-ant-` |
| Google / Gemini | `AIza...` |
| GitHub | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_` |
| GitLab | `glpat-...` |
| Stripe (live) | `sk_live_`, `rk_live_`, `whsec_` |
| Slack | `xoxb-`, `xoxp-`, `xapp-`, webhook URLs |
| Discord | bot tokens, webhook URLs |
| AWS | `AKIA...` key IDs, `aws_secret_access_key` assignments |
| Supabase | `sbp_...` |
| Vercel | `vercel_...` |
| npm | `npm_...` |
| SendGrid | `SG.xxx.xxx` |
| Twilio | `AC` / `SK` + 32 hex |
| Telegram bot | `123456789:AA...` |
| DigitalOcean | `dop_v1_`, `doo_v1_`, `dor_v1_` |
| Hugging Face | `hf_...` |
| Shopify | `shpat_`, `shpss_`, `shpca_` |
| Mailchimp | 32 hex + `-usNN` |
| Airtable | `pat...` |
| Fly.io | `fo1_...` |
| Cloudflare | `CLOUDFLARE_API_TOKEN=` assignments |
| Heroku | `HEROKU_API_KEY=` UUIDs |
| Database URL with password | `postgres://user:pass@host` (also mysql, mongodb, redis, amqp) |
| GCP service account | `"private_key_id"` in JSON |
| Private key block | `-----BEGIN ... PRIVATE KEY-----` |

**Medium confidence** (reported as warnings, so real keys never hide among noise):

| Type | Recognized by |
| --- | --- |
| Stripe (test) | `sk_test_`, `pk_test_` |
| JWT | `eyJ...` with valid structure |
| Generic credential | `API_KEY=`, `SECRET=`, `PASSWORD=` assignments — only when the value has high entropy |
| Generic-pattern findings (opaque assignments, URLs, JWTs) in test/fixture/mock files | automatically downgraded |
| Provider-prefixed keys (`AKIA...`, `ghp_...`, `sk-ant-...`) in test files | kept at full severity |

False-positive protection:

- **Entropy gate**: generic assignments are only flagged when the value is statistically random (real keys are; `changeme` is not)
- **Placeholder detection**: `your-api-key`, `xxxx`, `<token>`, `${VAR}`, `process.env.X`, and template literals are skipped
- **Repeat/sequence filter**: `aaaa...`, `1234...` never match
- **Bundle guard**: single-line minified blobs are skipped entirely
- Matched values are always masked — shipready never prints a full secret

### Suppressing a single finding

If shipready flags a line you know is safe (a demo value, an already-revoked key in docs), add the `shipready-ignore` marker to that line:

```js
const DEMO_TOKEN = "ghp_thisIsADocumentationExample000000"; // shipready-ignore
```

The marker works for **all checks** — secrets, `console.log`, `TODO`/`FIXME`, and `debugger` alike:

```js
console.log("startup banner"); // shipready-ignore
// TODO: legacy, tracked in JIRA-123 - shipready-ignore
```

For project-wide exceptions, prefer `secretAllowlist` in the config (see below) so the suppression is reviewable in one place.

## Secret autofix

`shipready fix` moves hardcoded secrets out of your code into `.env`:

```js
// before
const githubToken = "ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
// after
const githubToken = process.env.GITHUB_TOKEN;
```

The value lands in `.env` (gitignored), a placeholder lands in `.env.example`, and env var names are derived from your identifiers (`stripeApiKey` becomes `STRIPE_API_KEY`). TypeScript gets `process.env.NAME!` to keep strict mode compiling; Python gets `os.environ["NAME"]` with the `import os` added.

It never breaks your program - a rewrite only happens when it is provably safe:

- only complete quoted string literals are replaced; a password embedded in a database URL is flagged for manual restructuring instead
- client-side code (`"use client"`, `import.meta.env`) is never rewritten - an env var would still ship to the browser, so shipready tells you to move the call behind a server endpoint
- after rewriting, the file is re-scanned; if the secret somehow survived, the file is restored untouched
- identical values across files map to one env var; name collisions get numeric suffixes; existing `.env` entries are never overwritten
- if nothing in your project loads `.env` (no dotenv/Next.js/Vite), shipready tells you to run with `node --env-file=.env`

Use `--dry-run` to preview every change first. Remember to rotate any key that was already pushed - moving it to `.env` does not un-leak it.

## Scoring

The score starts at 100 and every deduction is itemized right under the score bar - the number is never a black box:

| Deduction | Points |
| --- | --- |
| No package.json | -20 |
| No README | -15 |
| Weak README | -8 |
| No build script | -8 |
| No test script | -6 |
| `.env.example` missing | -10 |
| `.env` not ignored by git | -15 |
| Hardcoded secret | -25 each (capped at -50) |
| Secret in git history | -10 each (capped at -30) |
| TODO/FIXME comment | -2 each (capped at -15) |

Checks adapt to what your repo actually is:

- **Monorepos** - workspaces (`package.json` `workspaces`, `pnpm-workspace.yaml`, including `**` globs) and conventional `frontend/` + `backend/` splits are detected; scripts and `.env.example` files in workspace packages count.
- **Libraries** - packages with a `files` allowlist aren't required to have `dev`/`build` scripts.
- **Non-JS ecosystems** - Go/Rust/Python/etc. projects get ecosystem-appropriate `.gitignore` expectations, and `.env` is only expected if the code actually reads env vars.
- **Mixed-language repos** - a FastAPI + React project reads "Vite + Python", not just "Vite".

## Configuration

Optional `shipready.config.json` in your project root:

```json
{
  "ignore": ["fixtures/**", "docs/**"],
  "disableRules": ["todos", "readme.weak"],
  "secretAllowlist": ["not-a-real-key-used-in-tests"]
}
```

| Field | Purpose |
| --- | --- |
| `ignore` | Extra glob patterns excluded from scanning (on top of the built-in ignores) |
| `disableRules` | Rule ids (`readme.weak`) or whole checks (`todos`) to disable; disabled rules don't affect the score |
| `secretAllowlist` | Substrings marking known false positives; matching lines are not reported |

## Using in CI

### GitHub Action (recommended)

Add the quality gate to any workflow with a single step:

```yaml
# .github/workflows/quality.yml
name: Quality gate
on: [push, pull_request]
jobs:
  shipready:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: formalness/shipready@v1
```

The job fails when errors (secrets, unignored `.env`, ...) are found.

| Input | Default | Purpose |
| --- | --- | --- |
| `path` | `.` | Project directory to scan |
| `verbose` | `true` | Show file/line locations for every finding |
| `version` | `latest` | shipready version to run (npm tag or exact version) |
| `args` | `""` | Extra arguments for `shipready check` (e.g. `--json`) |

Example with options:

```yaml
      - uses: formalness/shipready@v1
        with:
          path: apps/web
          verbose: "false"
          version: "1.0.3"
```

### GitHub code scanning (SARIF)

Turn shipready findings into **native code scanning alerts** on pull requests:

```yaml
# .github/workflows/shipready-sarif.yml
name: shipready code scanning
on: [push, pull_request]
permissions:
  security-events: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx shipready check --sarif > shipready.sarif || true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: shipready.sarif
```

Findings appear in the repository's **Security → Code scanning** tab and as inline PR annotations, with stable fingerprints so alerts track across pushes.

### Pre-commit hook

Catch secrets **before** they enter history at all — see [`shipready staged`](#shipready-staged-path) above.

### Manual setup

`shipready check` exits with code `1` when errors are found, so it works in any CI:

```yaml
      - run: npx shipready check --verbose
```

Use `--json` to feed the report into other tooling, or `--sarif` for anything that speaks SARIF.

## Scoring

Every project starts at 100 and loses points for issues:

| Issue | Deduction |
| --- | --- |
| Missing package.json | -20 |
| Missing README | -15 |
| Weak README | -8 |
| Missing build script | -8 |
| Missing test script | -6 |
| Missing .env.example (when env vars exist) | -10 |
| .env not gitignored | -15 |
| Possible secret | -25 each (max -50) |
| TODO/debug leftovers | -2 each (max -15) |

The score never goes below 0.

## Development

```bash
pnpm install
pnpm build    # compile TypeScript to dist/
pnpm test     # run Vitest suite
pnpm dev      # run the CLI from source (tsx)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project structure and how to add new checks or secret patterns.

## How does it compare to gitleaks?

Measured head-to-head on a corpus of 7 real-format leaks and 10 false-positive baits (gitleaks v8.24.3):

| | shipready | gitleaks |
| --- | --- | --- |
| Real leaks caught | **7 / 7** | 4 / 7 |
| Error-level false positives | **0** | 1 |
| Newer key formats (`sk-proj-`, `sk-ant-`) | ✓ | missed |
| Committed `.env.backup` | ✓ | partial |

gitleaks remains more battle-tested for deep git-history forensics with hundreds of rules. shipready covers the leaks that actually happen in modern AI-assisted projects — plus README, env hygiene, and code hygiene that gitleaks doesn't check at all. Full methodology, fairness notes, and reproduction steps: [BENCHMARK.md](./BENCHMARK.md).

## Roadmap

- [x] `shipready staged` for pre-commit hooks
- [x] SARIF report output for GitHub code scanning
- [x] Git history scanning (`--history`)
- [x] Live key verification (`--verify`)
- [x] Benchmark against gitleaks with published numbers ([BENCHMARK.md](./BENCHMARK.md))
- [ ] Framework-aware scoring (Next.js vs Vite vs Python have different needs)
- [ ] Optional AI-powered fix suggestions (bring your own key)

## License

[MIT](./LICENSE)
