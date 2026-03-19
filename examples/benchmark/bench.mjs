/**
 * Benchmark harness for @lazarv/react-server production performance.
 *
 * Usage:
 *   1. pnpm --filter @lazarv/react-server-example-benchmark build
 *   2. node bench.mjs [--save <label>] [--compare <file>]
 *
 * Options:
 *   --save <label>     Save results to results-<label>.json
 *   --compare <file>   Compare against a previous results JSON file
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

const PORT = 3210;
const DURATION = 10; // seconds per test
const CONNECTIONS = 50;

// ── Boot production server ──────────────────────────────────────────────────

const { reactServer } = await import("@lazarv/react-server/node");
const { middlewares } = await reactServer({
  origin: `http://localhost:${PORT}`,
  host: "localhost",
  port: PORT,
  outDir: ".react-server",
});

const server = createServer(middlewares);
await new Promise((resolve) => server.listen(PORT, resolve));

console.log(`\nBenchmark server on http://localhost:${PORT}`);
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
    name: "static-json",
    path: "/data.json",
    desc: "Static file (JSON)",
  },
  {
    name: "static-js",
    path: null, // resolved dynamically
    desc: "Static file (JS bundle)",
  },
  { name: "404-miss", path: "/nonexistent", desc: "404 miss → SSR" },
];

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

  process.stdout.write(`▶  ${b.name.padEnd(14)} ${b.desc}...`);
  const url = `http://localhost:${PORT}${b.path}`;
  const data = await runAutocannon(url);

  const result = {
    name: b.name,
    desc: b.desc,
    path: b.path,
    reqSec: data.requests.average,
    latencyAvg: data.latency.average,
    latencyP50: data.latency.p50,
    latencyP99: data.latency.p99,
    throughputMB: (data.throughput.average / 1024 / 1024).toFixed(1),
    total2xx: data["2xx"],
    errors: data.errors,
  };
  results.push(result);

  console.log(
    ` ${result.reqSec.toFixed(0)} req/s | avg ${result.latencyAvg}ms | p99 ${result.latencyP99}ms`
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

if (compareData) {
  console.log("\n" + "═".repeat(130));
  console.log(
    "  " +
      "Benchmark".padEnd(16) +
      "Req/s".padStart(16) +
      "Avg (ms)".padStart(16) +
      "P50 (ms)".padStart(14) +
      "P99 (ms)".padStart(14) +
      "Throughput".padStart(12) +
      "  " +
      "Description"
  );
  console.log("─".repeat(130));
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
        "  " +
        r.desc
    );
  }
  console.log("═".repeat(130));
} else {
  console.log("\n" + "═".repeat(110));
  console.log(
    "  " +
      "Benchmark".padEnd(16) +
      "Req/s".padStart(10) +
      "Avg (ms)".padStart(10) +
      "P50 (ms)".padStart(10) +
      "P99 (ms)".padStart(10) +
      "Throughput".padStart(12) +
      "  " +
      "Description"
  );
  console.log("─".repeat(110));
  for (const r of results) {
    console.log(
      "  " +
        r.name.padEnd(16) +
        String(r.reqSec.toFixed(0)).padStart(10) +
        String(r.latencyAvg).padStart(10) +
        String(r.latencyP50).padStart(10) +
        String(r.latencyP99).padStart(10) +
        `${r.throughputMB} MB/s`.padStart(12) +
        "  " +
        r.desc
    );
  }
  console.log("═".repeat(110));
}

// ── Save results ─────────────────────────────────────────────────────────────

if (saveLabel) {
  let gitCommit = "unknown";
  try {
    gitCommit = execSync("git log --oneline -1", { encoding: "utf8" }).trim();
  } catch {
    // ignore
  }
  const output = {
    description: saveLabel,
    date: new Date().toISOString().slice(0, 10),
    commit: gitCommit,
    config: { duration: DURATION, connections: CONNECTIONS, port: PORT },
    results,
  };
  const filename = `results-${saveLabel.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
  writeFileSync(filename, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nResults saved to ${filename}`);
}

server.close();
process.exit(0);
