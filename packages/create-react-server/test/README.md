# create-react-server Docker Tests

Integration tests that verify `create-react-server` works correctly across all runtimes and presets using Docker containers.

## Prerequisites

- **Docker** must be installed and running
- **pnpm** must be installed (for packing workspace packages)
- Sufficient disk space for Docker images (~2-4 GB)

## Test Matrix

### Runtimes
- **Node.js** (`node`) — runs on `node:20`
- **Bun** (`bun`) — runs on `oven/bun:latest` with Node.js 20 (Node.js is used for `npm install` and tooling; Bun is used at runtime)
- **Deno** (`deno`) — runs on `node:20` with Deno installed

### Presets
- `blank` — minimal JavaScript project
- `blank-ts` — minimal TypeScript project
- `get-started` — starter project with Tailwind CSS
- `get-started-ts` — TypeScript starter with Tailwind CSS
- `router` — file-system based routing (build/start **skipped** — static export issue)
- `nextjs` — Next.js App Router compatible

### Modes
Each preset is tested in mode `all` (dev + build + start) unless listed in `BUILD_SKIP`, in which case only `dev` mode is tested:
- **dev** — development server starts and responds with HTTP 2xx/3xx
- **build** — production build completes successfully
- **start** — production server starts and responds with HTTP 2xx/3xx

## Runtime-Specific Build & Start

Each runtime generates different `package.json` scripts via the `runtime.mjs` generator step:

| Runtime | Build | Start |
|---------|-------|-------|
| **Node.js** | `react-server build` | `react-server start --port PORT --host HOST` |
| **Bun** | `bun --bun react-server build --adapter bun` | `bun --bun react-server start` (via `PORT`/`HOST` env vars) |
| **Deno** | `deno run -A npm:@lazarv/react-server build --adapter deno` | `deno run ... .deno/start.mjs` (via `PORT`/`HOST` env vars) |

**Bun and Deno use adapter builds** (`--adapter bun` / `--adapter deno`) which produce a self-contained edge bundle. Their start scripts run the adapter's generated entry point directly instead of `react-server start`, so `PORT` and `HOST` are passed as environment variables rather than CLI flags.

## Known Issues

### Router preset build failure
The `router` preset's build fails during static export. Dev mode works fine. Build/start tests are skipped for this preset.

### `module-alias` pinned to `~2.2.3`
The `module-alias` package is used by `@lazarv/react-server` to alias CJS `require()` calls (e.g. redirecting `react`, `react-dom`, `picocolors`, etc. to the correct resolved paths). Version 2.3.x introduced `node:module` `registerHooks` which requires Node.js 22+ and is not supported by Deno at all. The dependency is pinned to `~2.2.3` in `packages/react-server/package.json` to maintain compatibility with Node.js 20 and Deno.

## Running Tests

```bash
# Run all tests (node + bun + deno)
pnpm test

# Run tests for a specific runtime
pnpm test:node
pnpm test:bun
pnpm test:deno

# Run with debug output
pnpm test:debug

# Force re-pack of workspace packages
REPACK=1 pnpm test

# Run a single preset (e.g. blank only)
REPACK=1 npx vitest run --testNamePattern "blank" __test__/bun.spec.mjs

# Use a different package manager inside the container (npm, pnpm, or bun for bun runtime)
PKG_MGR=pnpm pnpm test:node
PKG_MGR=bun pnpm test:bun

# Clean build artifacts
pnpm clean
```

## How It Works

1. **Pack** — `@lazarv/react-server` and `@lazarv/create-react-server` are packed via `pnpm pack` into `.build/` tarballs (skipped if tarballs already exist, unless `REPACK=1`)
2. **Build image** — a Docker image is built per runtime (`Dockerfile.node`, `Dockerfile.bun`, `Dockerfile.deno`) with the tarballs pre-installed at `/tool/node_modules/`
3. **Run container** — for each (runtime × preset) combination, a Docker container runs with `--network=host`:
   - Creates a new app via `create-react-server` CLI (non-interactive, using `script -qec` for PTY allocation)
   - Patches `package.json` to use the local tarball as the `@lazarv/react-server` dependency
   - Installs dependencies via `npm install`
   - Tests **dev**: starts the dev server with `script -qec` for PTY (required by react-server's `isTTY` check), waits for HTTP 2xx/3xx
   - Tests **build**: runs `npm run build`, checks exit code
   - Tests **start**: runs `npm start`, waits for HTTP 2xx/3xx
4. **Report** — vitest parses container stdout for success markers (`CREATION_OK`, `DEV_OK`, `BUILD_OK`, `START_OK`, `ALL_PASSED`) and snapshots the generated file structure

### Port Allocation

Each preset gets a unique port pair to avoid collisions when running with `--network=host`:
- Dev port: `10000 + presetIndex * 2`
- Start port: `10001 + presetIndex * 2`

## Project Structure

```
test/
├── __test__/
│   ├── bun.spec.mjs          # Bun runtime tests
│   ├── deno.spec.mjs         # Deno runtime tests
│   ├── node.spec.mjs         # Node.js runtime tests
│   ├── utils.mjs             # Test helpers (pack, build image, run container)
│   └── __snapshots__/        # Vitest snapshots of generated files
├── docker/
│   ├── Dockerfile.bun        # oven/bun:latest + Node.js 20
│   ├── Dockerfile.deno       # node:20 + Deno
│   ├── Dockerfile.node       # node:20
│   └── entrypoint.sh         # Shared test script run inside containers
├── .build/                   # Packed tarballs (gitignored)
├── .npm-cache/               # Shared npm cache across runs (gitignored)
├── vitest.config.mjs
└── package.json
```

## Troubleshooting

Run with `DEBUG=1` to see full container output:

```bash
DEBUG=1 pnpm test:node
```

To manually run a specific combination:

```bash
# Build the image first (from the .build/ directory)
docker build -t create-react-server-test-bun -f docker/Dockerfile.bun .build/

# Run a specific test (args: runtime preset mode)
docker run --rm --network=host create-react-server-test-bun bun blank all
docker run --rm --network=host create-react-server-test-node node get-started dev
```
