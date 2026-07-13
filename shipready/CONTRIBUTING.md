# Contributing to shipready

Thanks for helping make shipready better!

## Getting started

```bash
git clone https://github.com/formalness/shipready.git
cd shipready
pnpm install
pnpm build
pnpm test
```

Run the CLI from source without building:

```bash
pnpm dev check --verbose         # runs src/index.ts via tsx
pnpm dev check /path/to/project
```

## Project structure

```
src/
  index.ts          CLI entry (shebang, error handling)
  cli.ts            commander program: check / init / fix
  scanner.ts        orchestrates checks, scoring, config
  config.ts         shipready.config.json loading & validation
  types.ts          shared types
  checks/           one module per check (env, secrets, todos, ...)
  fixers/           safe auto-fixes (.env.example, .gitignore, agent files)
  generators/       AGENTS.md / CLAUDE.md / Cursor rules content
  utils/            file scanning, framework detection, report rendering
tests/              vitest suites, one file per module
```

## Adding a new check

1. Create `src/checks/yourCheck.ts` exporting a function that returns a `CheckResult` (see `src/types.ts`).
2. Wire it into `runScan` in `src/scanner.ts`.
3. If it should affect the score, add a deduction in `calculateScore` and cap it sensibly.
4. Add a test file `tests/yourCheck.test.ts` covering positive and negative cases.
5. Document it in the README.

## Adding a new secret pattern

1. Add the pattern to `PATTERNS` in `src/checks/secrets.ts`. Anchor with `\b` and require realistic minimum lengths to avoid false positives.
2. If the token has a recognizable prefix, add it to the prefix list in `maskSecret`.
3. Add a detection test in `tests/secrets.test.ts` and, when relevant, a negative test (placeholders must not match).
4. Add the secret type to the README table.

## Guidelines

- Zero runtime network calls: everything must work fully offline.
- Fixers must be safe: never overwrite without `--force`, never delete code.
- Keep dependencies minimal (currently: commander, fast-glob, picocolors).
- All new behavior needs tests. Run `pnpm test` before submitting.

## Releasing (maintainers)

1. Bump `version` in `package.json`, update `CHANGELOG.md`.
2. Commit, tag, push, then create a GitHub Release.
3. The `release.yml` workflow publishes to npm automatically. It requires an `NPM_TOKEN` repository secret (npm access token with publish permission, set in Settings -> Secrets and variables -> Actions).
