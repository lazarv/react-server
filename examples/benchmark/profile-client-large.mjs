/**
 * CPU-profile the client-large endpoint so we can compare hot paths
 * against main to explain the client-large / client-wide regression.
 *
 * Boots react-server in-process, warms it up, then hits /client/large in
 * a tight in-process loop while v8 sampling is active.
 *
 * Usage:
 *   node profile-client-large.mjs                      # → /tmp/rsc-prof/client-large-perf.cpuprofile
 *   PROFILE_OUT=... PROFILE_PATH=/client/wide ...
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";

process.env.NODE_ENV = "production";

const PORT = 3212;
const WARMUP_REQUESTS = 100;
const PROFILE_REQUESTS = parseInt(process.env.PROFILE_REQUESTS || "400", 10);
const PATH = process.env.PROFILE_PATH || "/client/large";
const OUT = process.env.PROFILE_OUT || "/tmp/rsc-prof/client-large.cpuprofile";

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

process.stdout.write(`warm-up ${WARMUP_REQUESTS} req...`);
for (let i = 0; i < WARMUP_REQUESTS; i++) {
  const r = await fetch(url);
  await r.arrayBuffer();
}
process.stdout.write(" done\n");

const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 });
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
