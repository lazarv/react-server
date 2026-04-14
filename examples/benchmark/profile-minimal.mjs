/**
 * CPU-profile only the server hot path for the "minimal" benchmark.
 *
 * Boots react-server in-process, runs a brief warm-up, then hits "/"
 * in a tight in-process loop while v8 sampling is active. Avoids the
 * autocannon subprocess and the noise of npx/cluster startup so the
 * resulting .cpuprofile is dominated by request handling.
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";

process.env.NODE_ENV = "production";

const PORT = 3211;
const WARMUP_REQUESTS = 200;
const PROFILE_REQUESTS = parseInt(process.env.PROFILE_REQUESTS || "5000", 10);
const PATH = process.env.PROFILE_PATH || "/";
const OUT = process.env.PROFILE_OUT || "/tmp/rsc-prof/minimal.cpuprofile";

const { reactServer } = await import("@lazarv/react-server/node");
const { middlewares } = await reactServer({
  origin: `http://localhost:${PORT}`,
  host: "localhost",
  port: PORT,
  outDir: ".react-server",
});

const server = createServer(middlewares);
await new Promise((resolve) => server.listen(PORT, resolve));

const url = `http://localhost:${PORT}${PATH}`;

// ── warm up ────────────────────────────────────────────────────────────────
process.stdout.write(`warm-up ${WARMUP_REQUESTS} req...`);
for (let i = 0; i < WARMUP_REQUESTS; i++) {
  const r = await fetch(url);
  await r.arrayBuffer();
}
process.stdout.write(" done\n");

// ── profile ────────────────────────────────────────────────────────────────
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 }); // 100us
await session.post("Profiler.start");

const t0 = process.hrtime.bigint();
let bytes = 0;
for (let i = 0; i < PROFILE_REQUESTS; i++) {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  bytes += buf.byteLength;
}
const t1 = process.hrtime.bigint();
const elapsedMs = Number(t1 - t0) / 1e6;

const { profile } = await session.post("Profiler.stop");
session.disconnect();

writeFileSync(OUT, JSON.stringify(profile));
console.log(
  `\n${PROFILE_REQUESTS} requests in ${elapsedMs.toFixed(0)}ms ` +
    `(${((PROFILE_REQUESTS / elapsedMs) * 1000).toFixed(0)} req/s, ` +
    `${(bytes / PROFILE_REQUESTS).toFixed(0)} B avg)`
);
console.log(`profile → ${OUT}`);

server.close();
process.exit(0);
