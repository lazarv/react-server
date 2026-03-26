# @lazarv/react-server — Contributor Guide

This is the monorepo for `@lazarv/react-server`, an open React Server Components runtime built on the Vite Environment API.

## Monorepo Structure

```
packages/
  react-server/     # Core runtime (@lazarv/react-server)
  rsc/              # RSC serialization (@lazarv/rsc)
  create-react-server/  # Project scaffold CLI (@lazarv/create-react-server)
docs/               # Documentation site (react-server.dev), built with react-server itself
examples/           # 33+ example applications
test/               # Integration tests (Vitest + Playwright)
```

Package manager: **pnpm** (enforced via `preinstall` check).

## Key Commands

```sh
# Install dependencies
pnpm install

# Run docs dev server
pnpm docs

# Build docs
pnpm docs-build

# Run all tests (from root)
pnpm test

# Run tests from test/ directory
cd test
pnpm test-dev-base        # Dev mode tests (excludes app tests)
pnpm test-dev-apps        # Dev mode app tests
pnpm test-build-start     # Build + start mode tests
pnpm test-dev             # All dev mode tests

# Format code
pnpm format               # Uses oxfmt

# Lint
pnpm lint                 # Uses oxlint
```

## Coding Conventions

- **ESM only** — all packages use `"type": "module"`
- **No TypeScript in core packages** — pure JavaScript with `.d.ts` type definitions
- **JSX file extensions** — use `.jsx` for React components
- **Config/server files** — use `.mjs` extension
- **Commit messages** — conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `perf:`, `refactor:`, `test:`, `build:`, `ci:`)
  - Format: `type(scope): subject` (e.g., `feat(router): add catch-all routes`)
  - Imperative, present tense, no capitalization, no period at end
  - Enforced by commitlint

## Docs Site

- Built with `@lazarv/react-server` itself (dogfooding)
- MDX pages in `docs/src/pages/en/(pages)/`
- Bilingual: English (`en/`) and Japanese (`ja/`)
- Deployed to Cloudflare
- All pages exported as `.md` for AI consumption
- Config: `docs/react-server.config.mjs`

## Test Infrastructure

- **Vitest** for test runner
- **Playwright (Chromium)** for browser-based integration tests
- Two configs: `vitest.config.mjs` (dev mode) and `vitest.config.build.mjs` (build+start mode)
- Test fixtures in `test/fixtures/`
- Test specs in `test/__test__/`

## Package Exports

The main `@lazarv/react-server` package has many subpath exports:
`/client`, `/server`, `/config`, `/router`, `/navigation`, `/error-boundary`, `/remote`, `/worker`, `/mcp`, `/cache`, and more. Check `packages/react-server/package.json` exports field for the full list.
