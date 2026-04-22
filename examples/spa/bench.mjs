/**
 * SPA benchmark: client-root SSR shortcut vs full RSC pipeline.
 *
 * The SPA example exposes two parallel entries that render the SAME
 * client-component tree:
 *
 *   src/index.ssr.jsx  →  "use client" root, served via render-ssr.jsx
 *                         (the SSR shortcut — skips the RSC flight pipeline)
 *
 *   src/index.rsc.jsx  →  regular RSC root, served via render-rsc.jsx
 *                         (the standard RSC + SSR pipeline)
 *
 * This script builds (optionally), boots, and benchmarks each variant in
 * isolation against the same routes, then prints a side-by-side comparison
 * so the cost of the RSC flight pipeline is visible.
 *
 * Usage:
 *   node bench.mjs                    # benchmark both variants (existing builds)
 *   node bench.mjs --build            # rebuild both variants first
 *   node bench.mjs --variant ssr      # benchmark only one variant
 *   node bench.mjs --save my-label    # also write results-my-label.json
 *   node bench.mjs --compare results-baseline.json
 *   node bench.mjs --duration 5       # seconds per route (default 10)
 *   node bench.mjs --connections 25   # concurrent connections (default 50)
 *
 * The benchmark builds use dedicated outDirs (.react-server-bench-ssr /
 * .react-server-bench-rsc) without --edge so the in-process node middleware
 * (`@lazarv/react-server/node`) can mount them. They do not interfere with
 * the user's own `pnpm build` / `pnpm build:rsc` outputs.
 */
import { createServer } from "node:http";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name) {
  const idx = args.indexOf(name);
  return idx === -1 ? null : args[idx + 1];
}
const shouldBuild = args.includes("--build");
const onlyVariant = flagValue("--variant"); // "ssr" | "rsc" | null
const saveLabel = flagValue("--save");
const compareFile = flagValue("--compare");
const DURATION = parseInt(flagValue("--duration") ?? "10", 10);
const CONNECTIONS = parseInt(flagValue("--connections") ?? "50", 10);

// ── Variant + route definitions ──────────────────────────────────────────────

const VARIANTS = [
  {
    id: "ssr",
    label: "SSR shortcut (use-client root → render-ssr.jsx)",
    entry: "./src/index.ssr.jsx",
    outDir: ".react-server-bench-ssr",
    port: 3211,
  },
  {
    id: "rsc",
    label: "RSC pipeline (regular root → render-rsc.jsx)",
    entry: "./src/index.rsc.jsx",
    outDir: ".react-server-bench-rsc",
    port: 3212,
  },
].filter((v) => !onlyVariant || v.id === onlyVariant);

if (VARIANTS.length === 0) {
  console.error(`Unknown --variant ${onlyVariant}; expected "ssr" or "rsc"`);
  process.exit(1);
}

const ROUTES = [
  { name: "html", path: "/", desc: "HTML document render" },
  {
    name: "flight",
    path: "/rsc.x-component",
    desc: "RSC flight payload",
  },
];

// ── Build (opt-in) ───────────────────────────────────────────────────────────

if (shouldBuild) {
  for (const v of VARIANTS) {
    console.log(`\nBuilding ${v.id} → ${v.outDir} ...`);
    execSync(`npx react-server build ${v.entry} --outDir ${v.outDir}`, {
      cwd: __dirname,
      stdio: "inherit",
    });
  }
}

// Verify each variant has a build output before we try to serve it.
for (const v of VARIANTS) {
  const manifestPath = resolve(__dirname, v.outDir, "server", "render.mjs");
  if (!existsSync(manifestPath)) {
    console.error(
      `Missing build for variant "${v.id}" at ${v.outDir}. Run with --build (or pnpm build / pnpm build:rsc and rename the outDir).`
    );
    process.exit(1);
  }
}

// ── Run autocannon ───────────────────────────────────────────────────────────

async function runAutocannon(url) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      "npx",
      [
        "autocannon",
        "-c",
        String(CONNECTIONS),
        "-d",
        String(DURATION),
        "--json",
        url,
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.on("close", (code) => {
      try {
        resolveP(JSON.parse(stdout));
      } catch {
        rejectP(new Error(`autocannon failed (code ${code}): ${stdout}`));
      }
    });
    proc.on("error", rejectP);
  });
}

// ── Per-variant benchmark ────────────────────────────────────────────────────

async function benchVariant(variant) {
  console.log(
    `\n══ ${variant.id.toUpperCase()} ─ ${variant.label} (port ${variant.port}) ══`
  );

  // Boot in-process node middleware against the variant's outDir.
  const { reactServer } = await import("@lazarv/react-server/node");
  const { middlewares } = await reactServer({
    origin: `http://localhost:${variant.port}`,
    host: "localhost",
    port: variant.port,
    outDir: variant.outDir,
  });
  const server = createServer(middlewares);
  await new Promise((r) => server.listen(variant.port, r));

  try {
    // Warm up — two passes to prime caches and lazy ESM imports.
    for (let pass = 0; pass < 2; pass++) {
      for (const r of ROUTES) {
        try {
          await fetch(`http://localhost:${variant.port}${r.path}`);
        } catch {
          // ignore — warmup failures will surface in the real run too
        }
      }
    }

    const results = [];
    for (const r of ROUTES) {
      process.stdout.write(`▶  ${r.name.padEnd(8)} ${r.desc} ...`);
      const url = `http://localhost:${variant.port}${r.path}`;
      const data = await runAutocannon(url);
      const result = {
        variant: variant.id,
        name: r.name,
        path: r.path,
        desc: r.desc,
        reqSec: data.requests.average,
        latencyAvg: data.latency.average,
        latencyP50: data.latency.p50,
        latencyP99: data.latency.p99,
        throughputMB: +(data.throughput.average / 1024 / 1024).toFixed(2),
        total2xx: data["2xx"],
        errors: data.errors,
      };
      results.push(result);
      console.log(
        ` ${result.reqSec.toFixed(0).padStart(6)} req/s | avg ${String(result.latencyAvg).padStart(5)}ms | p99 ${String(result.latencyP99).padStart(5)}ms`
      );
    }

    return results;
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// ── Driver ───────────────────────────────────────────────────────────────────

const allResults = [];
for (const v of VARIANTS) {
  const variantResults = await benchVariant(v);
  allResults.push(...variantResults);
}

// ── Comparison table ─────────────────────────────────────────────────────────

function fmtDelta(current, baseline, lowerIsBetter = false) {
  if (baseline == null || baseline === 0) return "";
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct > 0 ? "+" : "";
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const arrow = good ? "▲" : pct === 0 ? "=" : "▼";
  return ` ${arrow}${sign}${pct.toFixed(0)}%`;
}

if (VARIANTS.length === 2) {
  console.log("\n" + "═".repeat(96));
  console.log("  SSR shortcut vs RSC pipeline (same client-component tree)");
  console.log("─".repeat(96));
  console.log(
    "  " +
      "Route".padEnd(10) +
      "SSR req/s".padStart(14) +
      "RSC req/s".padStart(14) +
      "Δ req/s".padStart(12) +
      "SSR p99".padStart(11) +
      "RSC p99".padStart(11) +
      "Δ p99".padStart(11)
  );
  console.log("─".repeat(96));
  for (const r of ROUTES) {
    const ssr = allResults.find(
      (x) => x.variant === "ssr" && x.name === r.name
    );
    const rsc = allResults.find(
      (x) => x.variant === "rsc" && x.name === r.name
    );
    if (!ssr || !rsc) continue;
    console.log(
      "  " +
        r.name.padEnd(10) +
        ssr.reqSec.toFixed(0).padStart(14) +
        rsc.reqSec.toFixed(0).padStart(14) +
        fmtDelta(ssr.reqSec, rsc.reqSec).padStart(12) +
        String(ssr.latencyP99).padStart(11) +
        String(rsc.latencyP99).padStart(11) +
        fmtDelta(ssr.latencyP99, rsc.latencyP99, true).padStart(11)
    );
  }
  console.log("═".repeat(96));
  console.log(
    "  Δ columns are SSR relative to RSC (▲ = SSR faster, ▼ = SSR slower)."
  );
}

// Single-variant table (full per-route detail).
console.log("\n" + "═".repeat(110));
console.log(
  "  " +
    "Variant".padEnd(8) +
    "Route".padEnd(10) +
    "Req/s".padStart(10) +
    "Avg ms".padStart(10) +
    "P50 ms".padStart(10) +
    "P99 ms".padStart(10) +
    "Throughput".padStart(14) +
    "  " +
    "Description"
);
console.log("─".repeat(110));
for (const r of allResults) {
  console.log(
    "  " +
      r.variant.padEnd(8) +
      r.name.padEnd(10) +
      r.reqSec.toFixed(0).padStart(10) +
      String(r.latencyAvg).padStart(10) +
      String(r.latencyP50).padStart(10) +
      String(r.latencyP99).padStart(10) +
      `${r.throughputMB.toFixed(2)} MB/s`.padStart(14) +
      "  " +
      r.desc
  );
}
console.log("═".repeat(110));

// ── Compare against saved baseline ───────────────────────────────────────────

if (compareFile) {
  try {
    const raw = JSON.parse(readFileSync(compareFile, "utf8"));
    const baseline = new Map(
      raw.results.map((x) => [`${x.variant}/${x.name}`, x])
    );
    console.log(
      `\nBaseline: ${raw.description || compareFile} (${raw.date ?? "?"} ${raw.commit ?? ""})`
    );
    console.log("─".repeat(110));
    console.log(
      "  " +
        "Variant".padEnd(8) +
        "Route".padEnd(10) +
        "Req/s".padStart(10) +
        "Δ vs base".padStart(14) +
        "P99 ms".padStart(10) +
        "Δ vs base".padStart(14)
    );
    console.log("─".repeat(110));
    for (const r of allResults) {
      const b = baseline.get(`${r.variant}/${r.name}`);
      console.log(
        "  " +
          r.variant.padEnd(8) +
          r.name.padEnd(10) +
          r.reqSec.toFixed(0).padStart(10) +
          fmtDelta(r.reqSec, b?.reqSec).padStart(14) +
          String(r.latencyP99).padStart(10) +
          fmtDelta(r.latencyP99, b?.latencyP99, true).padStart(14)
      );
    }
    console.log("═".repeat(110));
  } catch (e) {
    console.warn(`Warning: could not load --compare file: ${e.message}`);
  }
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
    config: {
      duration: DURATION,
      connections: CONNECTIONS,
      variants: VARIANTS.map((v) => v.id),
    },
    results: allResults,
  };
  const filename = `results-${saveLabel.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
  writeFileSync(
    resolve(__dirname, filename),
    JSON.stringify(output, null, 2) + "\n"
  );
  console.log(`\nSaved → ${filename}`);
}

process.exit(0);
