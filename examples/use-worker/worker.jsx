"use worker";

import { setTimeout } from "node:timers/promises";
import { workerData } from "node:worker_threads";
import { Suspense } from "react";

import { useSignal } from "@lazarv/react-server";
import { isWorker } from "@lazarv/react-server/worker";

// ---------- React Components Rendered in a Worker Thread ----------

async function ServerStats() {
  await setTimeout(150);
  const mem = process.memoryUsage();
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-slate-400">Heap Used</dt>
      <dd className="text-white font-mono">
        {(mem.heapUsed / 1024 / 1024).toFixed(1)} MB
      </dd>
      <dt className="text-slate-400">Heap Total</dt>
      <dd className="text-white font-mono">
        {(mem.heapTotal / 1024 / 1024).toFixed(1)} MB
      </dd>
      <dt className="text-slate-400">RSS</dt>
      <dd className="text-white font-mono">
        {(mem.rss / 1024 / 1024).toFixed(1)} MB
      </dd>
      <dt className="text-slate-400">Process Uptime</dt>
      <dd className="text-white font-mono">{process.uptime().toFixed(1)}s</dd>
      <dt className="text-slate-400">Worker Data</dt>
      <dd className="text-white font-mono text-xs truncate">
        {JSON.stringify(workerData) ?? "none"}
      </dd>
    </dl>
  );
}

export async function getServerStats() {
  return (
    <Suspense
      fallback={
        <p className="text-slate-500 animate-pulse">Loading worker stats...</p>
      }
    >
      <ServerStats />
    </Suspense>
  );
}

// ---------- CPU-intensive Computation in a Worker Thread ----------

export async function findPrimes(limit) {
  const start = Date.now();
  const sieve = new Uint8Array(limit + 1);
  const primes = [];
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      primes.push(i);
      for (let j = i * i; j <= limit; j += i) {
        sieve[j] = 1;
      }
    }
  }
  return {
    count: primes.length,
    largest: primes[primes.length - 1],
    limit,
    duration: Date.now() - start,
    sample: primes.slice(-5),
  };
}

// ---------- ReadableStream from a Worker Thread ----------

export async function streamActivity() {
  const signal = useSignal();
  const steps = [
    { phase: "init", msg: "Worker thread initialized" },
    { phase: "init", msg: "Loading application modules" },
    { phase: "process", msg: "Parsing incoming request" },
    { phase: "process", msg: "Validating parameters" },
    { phase: "compute", msg: "Running computation pipeline" },
    { phase: "compute", msg: "Aggregating intermediate results" },
    { phase: "serialize", msg: "Serializing React component tree" },
    { phase: "serialize", msg: "Encoding response payload" },
    { phase: "cleanup", msg: "Releasing worker resources" },
    { phase: "done", msg: "Stream complete" },
  ];

  return new ReadableStream({
    async start(controller) {
      for (const { phase, msg } of steps) {
        if (signal?.aborted) break;
        controller.enqueue(
          JSON.stringify({ phase, msg, time: new Date().toISOString() }) + "\n"
        );
        await setTimeout(300, undefined, { signal }).catch(() => {});
        if (signal?.aborted) break;
      }
      controller.close();
    },
  });
}

// ---------- Worker Lifecycle ----------

export async function terminate() {
  // In Edge builds "use worker" functions run in-process — calling
  // process.exit() would kill the entire server.  isWorker() returns true
  // only inside a real framework-managed Worker Thread.
  if (isWorker()) {
    process.exit(0);
  }
}
