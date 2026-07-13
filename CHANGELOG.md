# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.1] - 2026-07-13

### Fixed

- Code hygiene checks (console.log, TODO/FIXME) no longer flag files in `examples/`, `demos/`, `benchmarks/`, `scripts/`, and `playground/` directories, where logging is intentional. Found by field-testing on expressjs/express, where 36 of 38 flagged console.log calls were in example code. Secrets are still scanned in those directories - a leaked key in an example is just as dangerous.

## [1.3.0] - 2026-07-13

### Added

- **`--history`**: scans the full git history (all branches) for secrets that were committed and later removed; findings are deduped, attributed to their commit hash, and excluded when the same secret is already reported from the working tree
- **`--verify`**: live verification of detected keys against 12+ provider APIs (OpenAI, Anthropic, GitHub, GitLab, Stripe, SendGrid, Google, npm, Hugging Face, Figma, and more); active keys are marked `[VERIFIED ACTIVE]` and upgraded to errors, rejected keys are marked `[not active - rotate anyway]`. Read-only "who am I" requests only, sent directly to the provider — never to a third party
- History findings reduce the score (up to -30) and add a "purge git history" next step

### Changed

- **Complete report redesign**: boxed header with version and project info, colored score progress bar with a ship-readiness verdict, aligned per-check columns with human-friendly labels, indented details and next-steps sections

## [1.2.0] - 2026-07-13

### Added

- **Entropy-based secret scanning**: generic credential assignments (`API_KEY=`, `PASSWORD=`, ...) are now only flagged when the value is statistically random (Shannon entropy gate), eliminating false positives on placeholders and weak examples
- **Confidence levels**: every finding is high (error) or medium (warning); Stripe test keys, JWTs, and generic credentials report as warnings, and findings in test/fixture/mock files are automatically downgraded
- 12 new provider patterns: GitLab, DigitalOcean, Hugging Face, Shopify, Mailchimp, Airtable, Fly.io, Cloudflare, Heroku, Discord bot tokens, Slack/Discord webhook URLs, Stripe webhook secrets, AWS secret access keys
- False-positive protection: repeat/sequence filter (`aaaa...`, `1234...`), template detection (`${VAR}`, `process.env.X`), URL-credential placeholder detection, single-line bundle guard

### Changed

- Secret masking now masks only the secret value, not surrounding code
- 111 tests (up from 76)

## [1.1.0] - 2026-07-13

### Added

- Official GitHub Action: add `uses: formalness/shipready@v1` to any workflow to run the quality gate with a single step. Supports `path`, `verbose`, `version`, and `args` inputs.

## [1.0.3] - 2026-07-13

### Fixed

- `--version` now works correctly on Windows: the package.json path was built with `url.pathname`, which produces broken paths like `/F:/...` on Windows; switched to `fileURLToPath`

## [1.0.2] - 2026-07-13

### Fixed

- `shipready --version` now reports the actual installed version (read from package.json) instead of a hardcoded `1.0.0`

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
