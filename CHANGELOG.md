# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] - 2026-07-13

### Changed

- Default ignore patterns now match at any depth (e.g. `mobile/build/`, nested `node_modules`), not just the project root
- Minified and bundled vendor assets (`*.min.js`, `*.min.css`, `*.bundle.js`, `*.chunk.js`, `vendor/`) are skipped by default - they are not user code and flooded reports with TODO/console.log noise
- Python artifacts (`__pycache__/`, `.venv/`, `venv/`), source maps, and lockfiles are also skipped by default

## [1.0.0] - 2026-07-13

First public release.

### Added

- `shipready check [path]` - scans a project for shipping blockers and prints a scored report (0-100)
  - `--verbose` for file:line detail, `--json` for CI pipelines, `--fix` to apply safe fixes and re-scan
  - Non-zero exit code when errors are found (CI-friendly)
- `shipready init [path]` - generates AI-agent instruction files: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/shipready.md`
- `shipready fix [path]` - safe auto-fixes: `.env.example` from detected env usage, `.gitignore` entries, agent files
- Checks: package.json/scripts, README quality, env safety, secret scanning, TODO/debug markers, .gitignore coverage
- Secret detection for: OpenAI, Anthropic, Google/Gemini, GitHub, Stripe, Slack, AWS, Supabase, Vercel, npm, SendGrid, Twilio, Telegram bots, database URLs with passwords, GCP service accounts, private key blocks, JWTs, and generic hardcoded credentials
- `shipready.config.json` support: `ignore` globs, `disableRules`, `secretAllowlist`
- Framework detection (Next.js, Vite, React, Vue, Svelte, Express, NestJS, Node.js) and package manager detection (npm, pnpm, yarn, bun)
- Fully offline - no network calls, no telemetry
