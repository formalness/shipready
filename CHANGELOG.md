# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.5.2 - 2026-07-13

### Fixed

- Multiple distinct secrets on the same line are now all reported (previously only the first match per line was found).
- Credential assignments whose value wraps to the next line (formatter line-wrapping) are now detected.
- Provider-prefixed keys (`AKIA...`, `ghp_...`, `sk-ant-...`) found in test/fixture paths are no longer downgraded to medium confidence - only generic shape-based patterns are. A real key in a test fixture is just as leaked as one in `src/`.
- Removed the hardcoded test-count badge from the README (it drifted out of date); the CI badge conveys test status.

## [1.5.1] - 2026-07-13

### Added

- **BENCHMARK.md**: published head-to-head benchmark against gitleaks v8.24.3 with full methodology, fairness notes, and reproduction steps. Result on a 7-leak/10-bait corpus: shipready 7/7 caught with 0 error-level false positives, gitleaks 4/7 with 1 false positive
- README comparison section summarizing the benchmark

### Fixed (gaps found by the benchmark itself)

- Committed `.env.backup`/`.env.old`-style files are now scanned for secrets - the `.env*` skip rule was too broad and silently exempted env backups (gitleaks caught these, we didn't). Only standard names (`.env`, `.env.local`, `.env.production`, ...) and templates remain exempt
- Unquoted dotenv-style assignments (`JWT_SECRET=c8f3...` without quotes) are now caught by a line-anchored credential pattern

## [1.5.0] - 2026-07-13

### Added

- **`--sarif`**: SARIF 2.1.0 output for GitHub code scanning - findings become native PR alerts with stable fingerprints for tracking across pushes; documented workflow with codeql-action/upload-sarif
- **`shipready staged`**: fast secrets-only scan of files staged for commit, built for pre-commit hooks. Reads content from the git index so partially staged files are checked as they would be committed. High-confidence secrets block the commit (exit 1); medium-confidence findings warn only. Husky and plain-git setup documented
- **`fix --dry-run`**: preview exactly what `shipready fix` would create or change (with content preview) without writing anything to disk
- `shipready-ignore` marker now works for all checks: console.log, TODO/FIXME, and debugger lines can be suppressed the same way as secrets
- Tests badge in README; roadmap updated to reflect shipped features

## [1.4.0] - 2026-07-13

### Added

- **Project detection beyond Node.js**: static HTML sites, Python, Go, Rust, PHP, Ruby, Java, and Deno projects are now identified by manifests (pyproject.toml, Cargo.toml, go.mod, composer.json, Gemfile, ...) and dominant source file types instead of showing "project unknown"
- New framework detections from package.json: Astro, Remix, Angular, Gatsby
- Package manager detection for pip, poetry, uv, cargo, go, composer, and bundler; a bare package.json without a lockfile now reports npm instead of unknown
- **HTML files are now scanned**: secrets in inline `<script>` blocks of static sites are detected (previously .html files were skipped entirely), along with console.log/TODO hygiene checks

### Fixed

- Non-Node projects (Static HTML, Python, Go, ...) are no longer penalized -20 points for a missing package.json; the check reports "not applicable" instead
- Report header shows a dash instead of "pm unknown" when no package manager applies

## [1.3.2] - 2026-07-13

### Fixed

- URL credentials equal to common dev defaults (`password`, `root`, `postgres`, `admin`, ...) are no longer flagged - scaffolding templates and docker-compose files are not leaks. Found by field-testing on t3-oss/create-t3-app, which scored 19/100 because of its own template strings
- Database URLs pointing at localhost (or docker service hosts like `db`, `postgres`) with a real-looking password are downgraded to medium confidence (warning) instead of error
- Real passwords on remote hosts keep high confidence

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
