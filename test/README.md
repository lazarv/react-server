# Testing

This directory contains the test suite for `@lazarv/react-server`. Tests use [Vitest](https://vitest.dev/) as the test runner and [Playwright](https://playwright.dev/) (Chromium) for browser-based integration tests.

## Quick start

From the **repository root**:

```bash
# Run the full test suite (dev + build modes)
pnpm test
```

This delegates to the `test` workspace package via `pnpm --filter ./test test`.

## Available scripts

All scripts below are defined in `test/package.json` and should be run from the `test/` directory (or via `pnpm --filter ./test <script>` from the root).

| Script | Command | Description |
|---|---|---|
| `test` | `run-s test-dev test-build-start` | Full suite — dev mode first, then production build mode |
| `test-dev` | `vitest run -c ./vitest.config.mjs` | Run all tests in **development** mode |
| `test-build-start` | `vitest run -c ./vitest.config.build.mjs` | Run all tests in **production/build** mode |
| `test-dev-base` | excludes `__test__/apps` | Dev mode — unit/module tests only (no app integration tests) |
| `test-dev-apps` | excludes `__test__/*.spec.mjs` | Dev mode — app integration tests only |
| `test-build-start-base` | excludes `__test__/apps` | Build mode — unit/module tests only |
| `test-build-start-apps` | excludes `__test__/*.spec.mjs` | Build mode — app integration tests only |
| `test-dev-ui` | `vitest -c ./vitest.config.mjs --ui` | Dev mode with Vitest UI |
| `test-build-start-ui` | `vitest -c ./vitest.config.build.mjs --ui` | Build mode with Vitest UI |

### Running a specific test file

```bash
cd test

# Single file
npx vitest run -c ./vitest.config.mjs __test__/config-schema.spec.mjs

# Multiple files
npx vitest run -c ./vitest.config.mjs __test__/config-schema.spec.mjs __test__/config-validate.spec.mjs

# By name pattern
npx vitest run -c ./vitest.config.mjs -t "telemetry"
```

## Vitest configs

There are **two** Vitest configurations:

- **`vitest.config.mjs`** — Development mode. Tests run against a live dev server started in a Worker thread.
- **`vitest.config.build.mjs`** — Production/build mode. Sets `NODE_ENV=production`, first builds the app with `@lazarv/react-server/build`, then starts the built server in a Worker thread.

Both configs share the same settings:

- **Pool**: `forks` (each test file runs in a separate forked process)
- **Retry**: `3` (tests are retried up to 3 times on failure)
- **Timeouts**: 60s for both `testTimeout` and `hookTimeout`
- **File parallelism**: enabled locally, disabled in CI
- **Setup files**: `vitestSetup.mjs` (per-file), `vitestGlobalSetup.mjs` (global)

## Directory structure

```
test/
├── __test__/
│   ├── *.spec.mjs          # Unit/module tests (config, routing, caching, etc.)
│   └── apps/
│       └── *.spec.mjs      # Integration tests against example apps
├── fixtures/                # JSX fixtures used by unit/integration tests
├── vitest.config.mjs        # Dev mode config
├── vitest.config.build.mjs  # Build mode config (extends dev config)
├── vitestSetup.mjs          # Per-file setup: browser, page, server() helper
├── vitestGlobalSetup.mjs    # Global setup: launches Playwright Chromium server
├── utils.mjs                # Test utilities (waitForChange, waitForHydration, etc.)
├── server.mjs               # Shared Worker server bootstrap (HTTP server creation)
├── server.dev.mjs           # Worker entry for dev mode
├── server.node.mjs          # Worker entry for production Node.js mode
├── server.edge.mjs          # Worker entry for production edge mode
├── react-server.config.json         # Build-time config for the test workspace
└── react-server.runtime.config.json  # Runtime config for the test workspace
```

## Test categories

### Unit / module tests (`__test__/*.spec.mjs`)

These test internal modules directly without starting a server. Examples:

- `config-schema.spec.mjs` — JSON schema generation from config definitions
- `config-validate.spec.mjs` — Config validation logic
- `route-match.spec.mjs` — Route matching
- `memory-cache.spec.mjs` — In-memory cache behavior
- `http-*.spec.mjs` — HTTP utilities (headers, context, CORS, middleware, etc.)

These tests import from `@lazarv/react-server/*` and use standard Vitest assertions. They do **not** use Playwright or the `server()` helper (though they still go through the setup files).

### Integration tests (`__test__/apps/*.spec.mjs`)

These test full example applications end-to-end:

1. The test calls `server("fixtures/some-component.jsx")` or `process.chdir()` + `server("./src/index.tsx")`
2. A Worker thread starts the react-server (dev or production depending on config)
3. Playwright navigates to the running server and asserts on page content

App tests that use native Node.js addons or features incompatible with edge can be conditionally skipped:

```js
test.skipIf(process.env.EDGE || process.env.EDGE_ENTRY)("test name", async () => {
  // ...
});
```

## Test utilities (`utils.mjs`)

The `playground/utils` alias resolves to `test/utils.mjs` (configured in `vitest.config.mjs`). It re-exports everything from `vitestSetup.mjs` plus:

| Export | Description |
|---|---|
| `browser` | Playwright `Browser` instance |
| `page` | Playwright `Page` instance |
| `server(root, config?, base?)` | Starts a react-server Worker and waits for it to be ready |
| `hostname` | The `http://localhost:<port>` URL of the running server |
| `logs` | Array of captured console/page logs |
| `serverLogs` | Array of captured server-side logs |
| `waitForChange(action, getValue, initialValue?, timeout?)` | Polls until a value changes after an action |
| `waitForConsole(evaluator)` | Waits for new console output |
| `waitForHydration(timeout?)` | Waits for React hydration to complete |
| `waitForBodyUpdate(fn, timeout?)` | Waits for `<body>` text content to change |
| `expectNoErrors()` | Asserts the page title doesn't contain "error" |

## Environment variables

| Variable | Description |
|---|---|
| `REACT_SERVER_TELEMETRY` | Set to `"false"` by default in vitest config to disable OpenTelemetry during tests |
| `REACT_SERVER_VERBOSE` | Set to any value to enable verbose console output during tests |
| `REACT_SERVER_DEBUG` | Set to any value to run Chromium in headed (non-headless) mode |
| `EDGE` | Set to any value to run tests in edge mode |
| `EDGE_ENTRY` | Set to any value to use the edge entry worker (`server.edge.mjs`) |
| `CI` | Detected automatically; disables file parallelism and enables GitHub Actions reporters |
| `NODE_ENV` | Set to `"production"` by `vitest.config.build.mjs` for build-mode tests |

## Writing new tests

### Unit/module test

Create a new file in `__test__/` with the `.spec.mjs` extension:

```js
import { describe, expect, it } from "vitest";
import { someFunction } from "@lazarv/react-server/some/module.mjs";

describe("someFunction", () => {
  it("does something", () => {
    expect(someFunction("input")).toBe("expected");
  });
});
```

### Integration test (with fixtures)

1. Create a fixture component in `fixtures/`:

```jsx
// fixtures/my-feature.jsx
export default function MyFeature() {
  return <div>Hello from my feature</div>;
}
```

2. Create a test in `__test__/`:

```js
import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("my feature renders", async () => {
  await server("fixtures/my-feature.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Hello from my feature");
});
```

### App integration test

1. Create a test in `__test__/apps/`:

```js
import { join } from "node:path";
import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/my-app"));

test("my app loads", async () => {
  await server("./src/index.tsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("My App");
});
```
