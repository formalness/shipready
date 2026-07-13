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
shipready check [path]   # scan a project (current dir by default)
shipready init  [path]   # generate AI-agent instruction files
shipready fix   [path]   # apply safe automatic fixes
```

## Commands

### `shipready check [path]`

Scans the project and prints a report with a 0-100 score.

| Flag | Effect |
| --- | --- |
| `-v, --verbose` | show file and line locations for every finding |
| `--json` | output the raw structured report as JSON (great for CI) |
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
| Any finding in test/fixture/mock files | automatically downgraded |

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

The scanner skips any line containing `shipready-ignore`. For project-wide exceptions, prefer `secretAllowlist` in the config (see below) so the suppression is reviewable in one place.

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

### Manual setup

`shipready check` exits with code `1` when errors are found, so it works in any CI:

```yaml
      - run: npx shipready check --verbose
```

Use `--json` to feed the report into other tooling.

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

## Roadmap

- [ ] Optional AI-powered fix suggestions (bring your own key)
- [ ] `shipready check --staged` for pre-commit hooks
- [ ] Markdown/SARIF report output for GitHub code scanning
- [ ] More frameworks and secret providers

## License

[MIT](./LICENSE)
