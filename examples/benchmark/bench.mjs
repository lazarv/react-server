/**
 * Benchmark harness for @lazarv/react-server production performance.
 *
 * Usage:
 *   1. pnpm --filter @lazarv/react-server-example-benchmark build
 *   2. node bench.mjs [--save <label>] [--compare <file>] [--cluster <n>] [--only <names>]
 *
 * Options:
 *   --save <label>     Save results to results-<label>.json
 *   --compare <file>   Compare against a previous results JSON file
 *   --cluster <n>      Run in cluster mode with n workers (uses react-server start)
 *   --only <names>     Run only specific benchmarks (comma-separated, e.g. --only 404-miss,cached)
 *
 * Runs autocannon against each benchmark route and prints a summary table.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

process.env.NODE_ENV = "production";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const saveLabel = args.includes("--save")
  ? args[args.indexOf("--save") + 1]
  : null;
const compareFile = args.includes("--compare")
  ? args[args.indexOf("--compare") + 1]
  : null;
const filterArg = args.includes("--filter")
  ? args[args.indexOf("--filter") + 1]
  : null;
const filters = filterArg
  ? filterArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

// --only name1,name2  or  --only name1 --only name2
const onlyFilter = new Set(
  args.reduce((acc, a, i, arr) => {
    if (a === "--only" && arr[i + 1]) acc.push(...arr[i + 1].split(","));
    return acc;
  }, [])
);

function parseCluster() {
  const idx = args.findIndex((a) => a.startsWith("--cluster"));
  if (idx === -1) return 0;
  // --cluster=4 or --cluster 4
  if (args[idx].includes("=")) return parseInt(args[idx].split("=")[1], 10);
  return parseInt(args[idx + 1], 10);
}
const clusterSize = parseCluster();

const PORT = 3210;
const DURATION = 10; // seconds per test
const CONNECTIONS = 50;

// ── Boot production server ──────────────────────────────────────────────────

let serverProcess = null;

if (clusterSize > 0) {
  // Cluster mode: spawn react-server start as a child process
  serverProcess = await new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["react-server", "start", "--port", String(PORT)],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          REACT_SERVER_CLUSTER: String(clusterSize),
        },
      }
    );

    let ready = false;
    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      // Workers log "listening on" when ready — wait for all of them
      if (!ready && text.includes("listening on")) {
        ready = true;
        // Give a moment for remaining workers to bind
        setTimeout(() => resolve(child), 500);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!ready)
        reject(new Error(`react-server start exited with code ${code}`));
    });

    // Safety timeout
    setTimeout(() => {
      if (!ready) {
        child.kill();
        reject(new Error("Timed out waiting for cluster to start"));
      }
    }, 30000);
  });
} else {
  // Single-process mode: use programmatic middleware API
  const { reactServer } = await import("@lazarv/react-server/node");
  const { middlewares } = await reactServer({
    origin: `http://localhost:${PORT}`,
    host: "localhost",
    port: PORT,
    outDir: ".react-server",
  });

  const server = createServer(middlewares);
  await new Promise((resolve) => server.listen(PORT, resolve));
  // Store for cleanup
  serverProcess = server;
}

const mode =
  clusterSize > 0 ? `cluster (${clusterSize} workers)` : "single-process";
console.log(`\nBenchmark server on http://localhost:${PORT} [${mode}]`);
console.log(`Running ${DURATION}s per test, ${CONNECTIONS} connections\n`);

// ── Benchmark definitions ───────────────────────────────────────────────────

const BENCHMARKS = [
  { name: "minimal", path: "/", desc: "Minimal SSR (tiny page)" },
  { name: "small", path: "/small", desc: "Small SSR (~20 elements)" },
  { name: "medium", path: "/medium", desc: "Medium SSR (50 products)" },
  { name: "large", path: "/large", desc: "Large SSR (500-row table)" },
  { name: "deep", path: "/deep", desc: "Deep nesting (100 levels)" },
  { name: "wide", path: "/wide", desc: "Wide tree (1000 siblings)" },
  { name: "cached", path: "/cached", desc: "Cached medium page" },
  {
    name: "client-min",
    path: "/client",
    desc: "Client component minimal",
  },
  {
    name: "client-small",
    path: "/client/small",
    desc: "Client component small",
  },
  {
    name: "client-med",
    path: "/client/medium",
    desc: "Client component medium (50 products)",
  },
  {
    name: "client-large",
    path: "/client/large",
    desc: "Client component large (500 rows)",
  },
  {
    name: "client-deep",
    path: "/client/deep",
    desc: "Client component deep (100 levels)",
  },
  {
    name: "client-wide",
    path: "/client/wide",
    desc: "Client component wide (1000 siblings)",
  },
  {
    name: "rsc-client-large",
    path: "/client/large/rsc.x-component",
    desc: "RSC-only client large (500 rows, no SSR)",
  },
  {
    name: "rsc-client-wide",
    path: "/client/wide/rsc.x-component",
    desc: "RSC-only client wide (1000 siblings, no SSR)",
  },
  {
    name: "static-json",
    path: "/data.json",
    desc: "Static file (JSON)",
  },
  {
    name: "static-js",
    path: null, // resolved dynamically
    desc: "Static file (JS bundle)",
  },
  {
    name: "404-miss",
    path: "/nonexistent",
    desc: "404 miss → SSR",
    expect: 404,
  },
  {
    name: "hybrid-min",
    path: "/hybrid",
    desc: "Hybrid server+6 client siblings (min)",
  },
  { name: "hybrid-small", path: "/hybrid/small", desc: "Hybrid small" },
  { name: "hybrid-medium", path: "/hybrid/medium", desc: "Hybrid medium" },
  { name: "hybrid-large", path: "/hybrid/large", desc: "Hybrid large" },
  { name: "hybrid-deep", path: "/hybrid/deep", desc: "Hybrid deep" },
  { name: "hybrid-wide", path: "/hybrid/wide", desc: "Hybrid wide" },
  { name: "hybrid-cached", path: "/hybrid/cached", desc: "Hybrid cached" },
  {
    name: "hybrid-client-min",
    path: "/hybrid/client",
    desc: "Hybrid client minimal",
  },
  {
    name: "hybrid-client-small",
    path: "/hybrid/client/small",
    desc: "Hybrid client small",
  },
  {
    name: "hybrid-client-medium",
    path: "/hybrid/client/medium",
    desc: "Hybrid client medium",
  },
  {
    name: "hybrid-client-large",
    path: "/hybrid/client/large",
    desc: "Hybrid client large",
  },
  {
    name: "hybrid-client-deep",
    path: "/hybrid/client/deep",
    desc: "Hybrid client deep",
  },
  {
    name: "hybrid-client-wide",
    path: "/hybrid/client/wide",
    desc: "Hybrid client wide",
  },
].filter((b) => !filters || filters.some((f) => b.name.includes(f)));

// ── Find an actual JS bundle path ───────────────────────────────────────────

import { readdirSync } from "node:fs";
try {
  const clientFiles = readdirSync(".react-server/client");
  const jsBundle = clientFiles.find(
    (f) => f.endsWith(".mjs") && f.includes(".")
  );
  if (jsBundle) {
    BENCHMARKS.find((b) => b.name === "static-js").path = `/client/${jsBundle}`;
  }
} catch {
  // skip if not found
}

// ── Run autocannon ──────────────────────────────────────────────────────────

async function runAutocannon(url, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const args = [
      "autocannon",
      "-c",
      String(CONNECTIONS),
      "-d",
      String(DURATION),
      "--json",
      ...extraArgs,
      url,
    ];
    const proc = spawn("npx", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.on("close", (code) => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`autocannon failed (code ${code}): ${stdout}`));
      }
    });
    proc.on("error", reject);
  });
}

// ── Warm up ─────────────────────────────────────────────────────────────────

console.log("Warming up...");
for (const b of BENCHMARKS) {
  if (!b.path) continue;
  try {
    await fetch(`http://localhost:${PORT}${b.path}`);
  } catch {
    // ignore
  }
}
// Second pass to ensure caches are primed
for (const b of BENCHMARKS) {
  if (!b.path) continue;
  try {
    await fetch(`http://localhost:${PORT}${b.path}`);
  } catch {
    // ignore
  }
}
console.log("Warm-up done.\n");

// ── Run benchmarks ──────────────────────────────────────────────────────────

const results = [];

for (const b of BENCHMARKS) {
  if (!b.path) {
    console.log(`⏭  Skipping ${b.name} (no path resolved)`);
    continue;
  }
  if (onlyFilter.size > 0 && !onlyFilter.has(b.name)) continue;

  process.stdout.write(`▶  ${b.name.padEnd(14)} ${b.desc}...`);
  const url = `http://localhost:${PORT}${b.path}`;
  const data = await runAutocannon(url);

  const total2xx = data["2xx"] ?? 0;
  const totalNon2xx = (data.non2xx ?? 0) + (data.errors ?? 0);
  const totalRequests = total2xx + totalNon2xx;
  const durationSec = data.duration ?? DURATION;

  // For routes with expected non-2xx responses (e.g. 404), count all
  // completed requests as "ok". Otherwise only count 2xx.
  const totalOk = b.expect ? totalRequests - (data.errors ?? 0) : total2xx;
  const okReqSec = durationSec > 0 ? totalOk / durationSec : 0;

  // Unexpected non-2xx: for a 404 route, the 404s are expected — only
  // connection errors and 503s are unexpected failures
  const unexpectedErrors = b.expect ? (data.errors ?? 0) : totalNon2xx;

  const result = {
    name: b.name,
    desc: b.desc,
    path: b.path,
    reqSec: okReqSec,
    totalReqSec: data.requests.average,
    latencyAvg: data.latency.average,
    latencyP50: data.latency.p50,
    latencyP99: data.latency.p99,
    throughputMB: (data.throughput.average / 1024 / 1024).toFixed(1),
    total2xx,
    totalNon2xx,
    totalRequests,
    unexpectedErrors,
    errors: data.errors ?? 0,
  };
  results.push(result);

  const status = unexpectedErrors > 0 ? ` | ${unexpectedErrors} non-2xx` : "";
  console.log(
    ` ${result.reqSec.toFixed(0)} req/s | avg ${result.latencyAvg}ms | p99 ${result.latencyP99}ms${status}`
  );
}

// ── Summary table ───────────────────────────────────────────────────────────

// Load comparison data if requested
let compareData = null;
if (compareFile) {
  try {
    const raw = JSON.parse(readFileSync(compareFile, "utf8"));
    compareData = new Map(raw.results.map((r) => [r.name, r]));
    console.log(`\nComparing against: ${raw.description || compareFile}\n`);
  } catch (e) {
    console.warn(`Warning: could not load compare file: ${e.message}\n`);
  }
}

function fmtDelta(current, baseline, lowerIsBetter = false) {
  if (baseline == null || baseline === 0) return "";
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct > 0 ? "+" : "";
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const arrow = good ? "▲" : pct === 0 ? "=" : "▼";
  return ` ${arrow}${sign}${pct.toFixed(0)}%`;
}

function fmtErrors(r) {
  return r.unexpectedErrors > 0 ? String(r.unexpectedErrors) : "";
}

if (compareData) {
  console.log("\n" + "═".repeat(140));
  console.log(
    "  " +
      "Benchmark".padEnd(16) +
      "Req/s".padStart(16) +
      "Avg (ms)".padStart(16) +
      "P50 (ms)".padStart(14) +
      "P99 (ms)".padStart(14) +
      "Throughput".padStart(12) +
      "Errors".padStart(10) +
      "  " +
      "Description"
  );
  console.log("─".repeat(140));
  for (const r of results) {
    const base = compareData.get(r.name);
    console.log(
      "  " +
        r.name.padEnd(16) +
        (r.reqSec.toFixed(0) + fmtDelta(r.reqSec, base?.reqSec)).padStart(16) +
        (
          r.latencyAvg + fmtDelta(r.latencyAvg, base?.latencyAvg, true)
        ).padStart(16) +
        String(r.latencyP50).padStart(14) +
        String(r.latencyP99).padStart(14) +
        `${r.throughputMB} MB/s`.padStart(12) +
        fmtErrors(r).padStart(10) +
        "  " +
        r.desc
    );
  }
  console.log("═".repeat(140));
} else {
  console.log("\n" + "═".repeat(120));
  console.log(
    "  " +
      "Benchmark".padEnd(16) +
      "Req/s".padStart(10) +
      "Avg (ms)".padStart(10) +
      "P50 (ms)".padStart(10) +
      "P99 (ms)".padStart(10) +
      "Throughput".padStart(12) +
      "Errors".padStart(10) +
      "  " +
      "Description"
  );
  console.log("─".repeat(120));
  for (const r of results) {
    console.log(
      "  " +
        r.name.padEnd(16) +
        String(r.reqSec.toFixed(0)).padStart(10) +
        String(r.latencyAvg).padStart(10) +
        String(r.latencyP50).padStart(10) +
        String(r.latencyP99).padStart(10) +
        `${r.throughputMB} MB/s`.padStart(12) +
        fmtErrors(r).padStart(10) +
        "  " +
        r.desc
    );
  }
  console.log("═".repeat(120));
}

// ── Save results ─────────────────────────────────────────────────────────────

if (saveLabel) {
  let gitCommit = "unknown";
  try {
    gitCommit = execSync("git log --oneline -1", { encoding: "utf8" }).trim();
  } catch {
    // ignore
  }
  const config = { duration: DURATION, connections: CONNECTIONS, port: PORT };
  if (clusterSize > 0) config.cluster = clusterSize;
  const output = {
    description: saveLabel,
    date: new Date().toISOString().slice(0, 10),
    commit: gitCommit,
    config,
    results,
  };
  const filename = `results-${saveLabel.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
  writeFileSync(filename, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nResults saved to ${filename}`);
}

if (serverProcess && typeof serverProcess.close === "function") {
  // Single-process mode: HTTP server
  serverProcess.close();
} else if (serverProcess && typeof serverProcess.kill === "function") {
  // Cluster mode: child process
  serverProcess.kill("SIGTERM");
}
process.exit(0);
