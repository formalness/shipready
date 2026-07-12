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

Exits with code `1` when errors are found, so you can use it in CI pipelines.

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
shipready report

Project: Next.js
Package manager: pnpm

Summary:
✓ package.json found
✓ README.md found
✗ .env.example missing
✗ .env is not ignored
⚠ 4 TODO/FIXME comments found
⚠ 2 console.log calls found
✓ No obvious secrets found

Score: 72/100

Recommended next steps:
1. Add .env to .gitignore
2. Create .env.example (run: shipready fix)
3. Remove debug logs before shipping
```

## What it checks

| Check | What it looks for |
| --- | --- |
| **package.json** | Existence, package manager (lockfiles), framework, `dev`/`build`/`test`/`lint` scripts |
| **README** | Existence, installation/usage/license sections, not-too-empty |
| **Env safety** | `.env` gitignored, `.env.example` present and complete, no real values in examples |
| **Secrets** | 18 token patterns, all masked in output (see table below) |
| **Debug leftovers** | `TODO`, `FIXME`, `HACK`, `XXX`, `console.log`, `debugger`, `throw new Error("Not implemented")` |
| **.gitignore** | Existence and important entries (`.env`, `node_modules`, `dist`, `build`, `.next`) |

Ignored during scans: `node_modules`, `.git`, `dist`, `build`, `.next`, `out`, `coverage`, `.cache`.

## Detected secrets

| Type | Recognized by |
| --- | --- |
| OpenAI | `sk-`, `sk-proj-` |
| Anthropic | `sk-ant-` |
| Google / Gemini | `AIza...` |
| GitHub | `ghp_`, `github_pat_` |
| Stripe (live) | `sk_live_`, `rk_live_` |
| Slack | `xoxb-`, `xoxp-` |
| AWS | `AKIA...` |
| Supabase | `sbp_...` |
| Vercel | `vercel_...` |
| npm | `npm_...` |
| SendGrid | `SG.xxx.xxx` |
| Twilio | `AC` / `SK` + 32 hex |
| Telegram bot | `123456789:AA...` |
| Database URL with password | `postgres://user:pass@host` (also mysql, mongodb, redis, amqp) |
| GCP service account | `"private_key_id"` in JSON |
| Private key block | `-----BEGIN ... PRIVATE KEY-----` |
| JWT | `eyJ...` |
| Generic credential | `API_KEY=`, `SECRET=`, `PASSWORD=` assignments |

Placeholders (`your-api-key`, `changeme`, `xxxx`, ...) are ignored. Matched values are always masked — shipready never prints a full secret.

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

`shipready check` exits with code `1` when errors are found:

```yaml
# .github/workflows/quality.yml
name: Quality gate
on: [push, pull_request]
jobs:
  shipready:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
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
