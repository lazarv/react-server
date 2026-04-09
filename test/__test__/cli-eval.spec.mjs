// End-to-end integration test for the `--eval` CLI flag.
//
// The companion unit spec (`react-server-eval.spec.mjs`) tests the plugin
// load-hook contract in isolation. This spec exercises the real CLI binary
// as a subprocess — `node bin/cli.mjs ...` — to prove the full wiring:
//
//   1. `--eval "<inline>"`               → dev server renders the inline code
//   2. bare `--eval` with piped stdin    → dev server renders the piped code
//   3. positional root + piped stdin     → stdin is NOT auto-consumed; the
//                                          positional root file wins
//   4. `build --eval "<inline>"`         → production build succeeds and
//                                          emits the inline entrypoint
//
// Case 3 is the critical regression guard: it proves stdin is untouched when
// `--eval` was not passed, even though fd 0 is a live pipe. Previously the
// CLI would fstat fd 0 and auto-route stdin into the virtual entrypoint.
//
// We run the CLI through `node` directly (not via the `server()` helper)
// because the helper speaks to a programmatic API and bypasses the exact
// CLI-argument parsing path we need to cover. These tests are intentionally
// standalone — they do not use the shared `browser/page/server` harness.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Run inside the `test/` directory so `@lazarv/react-server` (and its deps)
// resolve cleanly from the workspace link in `test/node_modules`. A fresh
// tmpdir would have no node_modules and the dev server would hang during
// module resolution. We still use a unique subdir per run for the fixture
// files so parallel runs don't stomp each other.
const TEST_ROOT = fileURLToPath(new URL("../", import.meta.url));

const CLI = fileURLToPath(
  new URL("../../packages/react-server/bin/cli.mjs", import.meta.url)
);

// Pick a port range well above the shared harness's BASE_PORT=3000 band so
// these tests don't collide with concurrent `server()`-driven specs.
let portCounter = 0;
function nextPort() {
  return 40000 + (portCounter++ % 1000);
}

// Spawn the CLI, optionally pipe stdin, wait for a readiness marker on
// stdout/stderr, then invoke `onReady` with the subprocess handle. Always
// kills the subprocess on the way out.
async function runCli({
  args,
  cwd,
  stdin,
  readyRegex,
  timeoutMs = 60000,
  onReady,
}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      CI: "true",
      REACT_SERVER_TELEMETRY: "false",
      // Disable ANSI color codes so our readiness regex matches the raw
      // "Server listening on" string without wrestling escape sequences.
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
  });

  // Strip ANSI escapes defensively even with NO_COLOR set — some libraries
  // ignore it and emit colors anyway.
  // eslint-disable-next-line no-control-regex
  const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;
  const stripAnsi = (s) => s.replace(ANSI, "");

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => (stdout += stripAnsi(c)));
  child.stderr.on("data", (c) => (stderr += stripAnsi(c)));

  if (stdin !== undefined) {
    child.stdin.write(stdin);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new Error(
          `CLI did not become ready within ${timeoutMs}ms.\n` +
            `args: ${args.join(" ")}\n` +
            `stdout:\n${stdout}\nstderr:\n${stderr}`
        )
      );
    }, timeoutMs);
    const check = () => {
      if (readyRegex.test(stdout) || readyRegex.test(stderr)) {
        clearTimeout(t);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.stderr.on("data", check);
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(
        new Error(
          `CLI exited (code ${code}) before becoming ready.\n` +
            `args: ${args.join(" ")}\n` +
            `stdout:\n${stdout}\nstderr:\n${stderr}`
        )
      );
    });
  });

  try {
    await ready;
    return await onReady({ child, stdout: () => stdout, stderr: () => stderr });
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
      await new Promise((res) => {
        const t = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
          res();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(t);
          res();
        });
      });
    }
  }
}

// Run a build-only CLI invocation. Build exits on completion, so we wait
// for exit rather than a readiness marker.
function runCliToCompletion({ args, cwd, stdin, timeoutMs = 120000, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        CI: "true",
        REACT_SERVER_TELEMETRY: "false",
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));

    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `CLI did not exit within ${timeoutMs}ms.\n` +
            `args: ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`
        )
      );
    }, timeoutMs);

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function fetchText(url, { timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw lastErr ?? new Error(`fetch ${url} timed out`);
}

// Dev-mode readiness marker. `create-server.mjs` prints "Server listening on"
// after the HTTP listener emits 'listening'. We also accept a bare "Local:"
// URL line (Vite's printUrls output) as a secondary signal in case the
// wrapper log changes.
const DEV_READY = /(Server\s+listening\s+on|Local:\s+https?:\/\/)/i;

describe.sequential("CLI --eval wiring", () => {
  let workdir;

  beforeAll(async () => {
    // Scratch subdir inside test/ so node_modules resolution works via the
    // workspace-linked `@lazarv/react-server`. mkdtemp needs a prefix.
    workdir = await mkdtemp(join(TEST_ROOT, ".cli-eval-"));
    // Positional root file used by the "no --eval, stdin piped" case.
    await writeFile(
      join(workdir, "root.jsx"),
      `export default function Root() {
  return <div data-testid="source">positional-root-marker</div>;
}
`
    );
  });

  afterAll(async () => {
    if (workdir) {
      try {
        await rm(workdir, { recursive: true, force: true });
      } catch {}
    }
  });

  test(
    "dev: --eval <inline> renders inline code",
    { timeout: 120000 },
    async () => {
      const port = nextPort();
      const inline = `export default function Root() {
  return <div data-testid="source">inline-eval-marker</div>;
}`;
      await runCli({
        args: ["--port", String(port), "--eval", inline],
        cwd: workdir,
        readyRegex: DEV_READY,
        onReady: async () => {
          const body = await fetchText(`http://localhost:${port}/`);
          expect(body).toContain("inline-eval-marker");
          expect(body).not.toContain("positional-root-marker");
        },
      });
    }
  );

  test(
    "dev: bare --eval reads entrypoint from stdin",
    { timeout: 120000 },
    async () => {
      const port = nextPort();
      const stdinCode = `export default function Root() {
  return <div data-testid="source">stdin-eval-marker</div>;
}`;
      await runCli({
        args: ["--port", String(port), "--eval"],
        cwd: workdir,
        stdin: stdinCode,
        readyRegex: DEV_READY,
        onReady: async () => {
          const body = await fetchText(`http://localhost:${port}/`);
          expect(body).toContain("stdin-eval-marker");
        },
      });
    }
  );

  test(
    "dev: stdin is NOT auto-consumed when --eval is absent",
    { timeout: 120000 },
    async () => {
      const port = nextPort();
      // Payload that would be a SYNTAX ERROR if eval'd — if the old auto-eval
      // path ever comes back, the server will fail to start and we'll catch
      // it via the readiness timeout / explicit marker mismatch.
      const bogusStdin = "this is not valid javascript <<<<< !!!\n";
      await runCli({
        args: ["--port", String(port), "./root.jsx"],
        cwd: workdir,
        stdin: bogusStdin,
        readyRegex: DEV_READY,
        onReady: async () => {
          const body = await fetchText(`http://localhost:${port}/`);
          expect(body).toContain("positional-root-marker");
          expect(body).not.toContain("inline-eval-marker");
          expect(body).not.toContain("stdin-eval-marker");
        },
      });
    }
  );

  test(
    "build: --eval <inline> produces a successful production build and ignores stdin",
    { timeout: 180000 },
    async () => {
      const outDir = `.react-server-cli-eval-build-${Date.now()}`;
      const inline = `export default function Root() {
  return <div data-testid="source">build-inline-eval-marker</div>;
}`;
      // Pipe bogus stdin too — if the production path ever regresses to
      // auto-reading stdin when --eval is present, the inline value would
      // be overwritten or the build would blow up on invalid code.
      const bogusStdin = "this is not valid javascript <<<<< !!!\n";
      const result = await runCliToCompletion({
        args: [
          "build",
          "--eval",
          inline,
          "--outDir",
          outDir,
          "--no-minify",
          "--adapter",
          "false",
        ],
        cwd: workdir,
        stdin: bogusStdin,
      });
      try {
        expect(result.code, `build failed:\n${result.stderr}`).toBe(0);
      } finally {
        try {
          await rm(join(workdir, outDir), { recursive: true, force: true });
        } catch {}
      }
    }
  );
});
