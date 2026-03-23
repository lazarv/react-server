#!/usr/bin/env node

/**
 * Flight Protocol Benchmark Report Generator
 *
 * Reads vitest bench JSON output (--outputJson), normalizes it, optionally
 * compares against a baseline, and produces a markdown report suitable for
 * GitHub PR comments.
 *
 * Usage:
 *   node __bench__/report.mjs --current bench-raw.json [options]
 *
 * Options:
 *   --current <file>    Vitest bench JSON output (required)
 *   --baseline <file>   Previous results JSON for comparison
 *   --output <file>     Write normalized JSON results (default: bench-results.json)
 *   --markdown <file>   Write markdown report (default: comment.md)
 *   --commit <sha>      Git commit SHA (auto-detected if omitted)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const currentFile = getArg("current");
const baselineFile = getArg("baseline");
const outputFile = getArg("output", "bench-results.json");
const markdownFile = getArg("markdown", "comment.md");
let commitSha = getArg("commit");

if (!currentFile) {
  console.error("Usage: node report.mjs --current <vitest-bench-json>");
  process.exit(1);
}

if (!commitSha) {
  try {
    commitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    commitSha = "unknown";
  }
}

const shortSha = commitSha.slice(0, 7);

// ── Parse vitest bench output ───────────────────────────────────

const raw = JSON.parse(readFileSync(currentFile, "utf8"));

/**
 * Vitest bench --outputJson format (v4.x):
 * {
 *   files: [
 *     {
 *       filepath: "...",
 *       groups: [
 *         {
 *           fullName: "file > group name",
 *           benchmarks: [
 *             {
 *               name: "bench name",
 *               hz: number,
 *               mean: number,
 *               p75: number,
 *               p99: number,
 *               min: number,
 *               max: number,
 *               rme: number,
 *               sampleCount: number,
 *               ...
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

function parseVitestBench(data) {
  const results = {};

  const files = data.files || [];
  for (const file of files) {
    for (const group of file.groups || []) {
      // fullName is "file > group name" — extract just the group name
      const fullName = group.fullName || "";
      const groupName = fullName.includes(" > ")
        ? fullName.split(" > ").slice(1).join(" > ")
        : fullName;

      if (!results[groupName]) results[groupName] = {};

      for (const bench of group.benchmarks || []) {
        results[groupName][bench.name] = {
          hz: bench.hz,
          mean: bench.mean,
          p75: bench.p75,
          p99: bench.p99,
          min: bench.min,
          max: bench.max,
          sampleCount: bench.sampleCount,
          rme: bench.rme,
        };
      }
    }
  }

  return results;
}

const results = parseVitestBench(raw);

// ── Write normalized JSON ───────────────────────────────────────

const normalized = {
  commit: commitSha,
  shortCommit: shortSha,
  date: new Date().toISOString(),
  results,
};

writeFileSync(outputFile, JSON.stringify(normalized, null, 2) + "\n");
console.log(`Normalized results written to ${outputFile}`);

// ── Load baseline ───────────────────────────────────────────────

let baseline = null;
if (baselineFile) {
  try {
    baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
    console.log(
      `Loaded baseline from ${baselineFile} (${baseline.shortCommit || "unknown"})`
    );
  } catch (e) {
    console.warn(`Warning: could not load baseline: ${e.message}`);
  }
}

// ── Group mapping ───────────────────────────────────────────────

/**
 * Maps bench group names to library identifiers and operation types.
 * Group names come from the describe() blocks in bench files.
 */
const GROUP_MAP = {
  "@lazarv/rsc serialize": { lib: "lazarv", op: "serialize" },
  "@lazarv/rsc prerender": { lib: "lazarv", op: "prerender" },
  "@lazarv/rsc deserialize": { lib: "lazarv", op: "deserialize" },
  "@lazarv/rsc roundtrip": { lib: "lazarv", op: "roundtrip" },
  "webpack serialize": { lib: "webpack", op: "serialize" },
  "webpack deserialize": { lib: "webpack", op: "deserialize" },
  "webpack roundtrip": { lib: "webpack", op: "roundtrip" },
};

/**
 * Build a lookup: { [op]: { [scenarioName]: { lazarv: benchData, webpack: benchData } } }
 */
function buildComparison(data) {
  const comparison = {};
  for (const [group, benches] of Object.entries(data)) {
    const mapped = GROUP_MAP[group];
    if (!mapped) continue;
    const { lib, op } = mapped;
    if (!comparison[op]) comparison[op] = {};
    for (const [name, bench] of Object.entries(benches)) {
      if (!comparison[op][name]) comparison[op][name] = {};
      comparison[op][name][lib] = bench;
    }
  }
  return comparison;
}

const current = buildComparison(results);
const base = baseline ? buildComparison(baseline.results) : null;

// ── Markdown generation ─────────────────────────────────────────

function fmtHz(hz) {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(1)}M`;
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)}K`;
  return hz.toFixed(0);
}

function fmtTime(ms) {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)} ns`;
  if (ms < 1) return `${(ms * 1_000).toFixed(1)} \u00b5s`;
  return `${ms.toFixed(2)} ms`;
}

function fmtDelta(current, base, lowerIsBetter = false) {
  if (base == null || base === 0) return "";
  const pct = ((current - base) / base) * 100;
  const sign = pct > 0 ? "+" : "";
  const good = lowerIsBetter ? pct < -1 : pct > 1;
  const bad = lowerIsBetter ? pct > 1 : pct < -1;
  const icon = good ? "\u{1f7e2}" : bad ? "\u{1f534}" : "\u{26aa}";
  return `${icon} ${sign}${pct.toFixed(1)}%`;
}

function fmtLibDelta(lazarvHz, webpackHz) {
  if (!webpackHz || webpackHz === 0) return "";
  const pct = ((lazarvHz - webpackHz) / webpackHz) * 100;
  const sign = pct > 0 ? "+" : "";
  const icon = pct > 1 ? "\u{1f7e2}" : pct < -1 ? "\u{1f534}" : "\u{26aa}";
  return `${icon} ${sign}${pct.toFixed(1)}%`;
}

const lines = [];
lines.push("<!-- flight-bench-results -->");
lines.push("## \u26a1 Flight Protocol Benchmark");
lines.push("");

if (baseline) {
  lines.push(
    `Comparing \`${shortSha}\` against baseline \`${baseline.shortCommit || "?"}\``
  );
} else {
  lines.push(`Commit: \`${shortSha}\``);
}
lines.push("");

// Operation order for the report
const OP_ORDER = ["serialize", "prerender", "deserialize", "roundtrip"];
const OP_LABELS = {
  serialize: "Serialization (`renderToReadableStream`)",
  prerender: "Prerender (`prerender`)",
  deserialize: "Deserialization (`createFromReadableStream`)",
  roundtrip: "Roundtrip (serialize + deserialize)",
};

for (const op of OP_ORDER) {
  const scenarios = current[op];
  if (!scenarios) continue;

  lines.push(`### ${OP_LABELS[op]}`);
  lines.push("");

  if (baseline) {
    if (op === "prerender") {
      lines.push("| Scenario | @lazarv/rsc ops/s | mean | vs baseline |");
      lines.push("|:---------|------------------:|-----:|------------:|");
    } else {
      lines.push(
        "| Scenario | @lazarv/rsc | webpack | vs webpack | vs baseline |"
      );
      lines.push(
        "|:---------|------------:|--------:|-----------:|------------:|"
      );
    }
  } else {
    if (op === "prerender") {
      lines.push("| Scenario | @lazarv/rsc ops/s | mean |");
      lines.push("|:---------|------------------:|-----:|");
    } else {
      lines.push("| Scenario | @lazarv/rsc | webpack | vs webpack |");
      lines.push("|:---------|------------:|--------:|-----------:|");
    }
  }

  for (const [name, libs] of Object.entries(scenarios)) {
    const lazarv = libs.lazarv;
    const webpack = libs.webpack;

    if (op === "prerender") {
      if (lazarv) {
        if (baseline) {
          const baseRsc = base?.[op]?.[name]?.lazarv;
          const baselineDelta = baseRsc ? fmtDelta(lazarv.hz, baseRsc.hz) : "-";
          lines.push(
            `| **${name}** | ${fmtHz(lazarv.hz)} | ${fmtTime(lazarv.mean)} | ${baselineDelta} |`
          );
        } else {
          lines.push(
            `| **${name}** | ${fmtHz(lazarv.hz)} | ${fmtTime(lazarv.mean)} |`
          );
        }
      }
      continue;
    }

    const lazarvHz = lazarv ? fmtHz(lazarv.hz) : "-";
    const webpackHz = webpack ? fmtHz(webpack.hz) : "-";
    const delta = lazarv && webpack ? fmtLibDelta(lazarv.hz, webpack.hz) : "-";

    if (baseline) {
      const baseRsc = base?.[op]?.[name]?.lazarv;
      const baselineDelta = baseRsc
        ? fmtDelta(lazarv?.hz || 0, baseRsc.hz)
        : "-";
      lines.push(
        `| **${name}** | ${lazarvHz} | ${webpackHz} | ${delta} | ${baselineDelta} |`
      );
    } else {
      lines.push(`| **${name}** | ${lazarvHz} | ${webpackHz} | ${delta} |`);
    }
  }

  lines.push("");
}

// ── Legend ───────────────────────────────────────────────────────

lines.push("<details><summary>Legend & methodology</summary>");
lines.push("");
lines.push(
  "**Indicators:** \u{1f7e2} > 1% faster | \u{1f534} > 1% slower | \u{26aa} within noise margin"
);
lines.push("");
lines.push(
  "**vs webpack**: compares @lazarv/rsc against react-server-dom-webpack within the same run."
);
lines.push(
  "**vs baseline**: compares @lazarv/rsc against the previous main branch run."
);
lines.push("");
lines.push(
  "Values shown are operations/second (higher is better). Each scenario runs for at least 100 iterations with warmup."
);
lines.push("");
lines.push(
  "Benchmarks run on GitHub Actions runners (shared infrastructure) \u2014 expect ~5% variance between runs. Consistent directional changes across multiple scenarios are more meaningful than any single number."
);
lines.push("");
lines.push("</details>");

writeFileSync(markdownFile, lines.join("\n") + "\n");
console.log(`Markdown report written to ${markdownFile}`);
