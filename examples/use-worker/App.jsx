import { after, logger, reload, status } from "@lazarv/react-server";
import { Refresh } from "@lazarv/react-server/navigation";
import { useMatch } from "@lazarv/react-server/router";

import {
  getServerStats,
  findPrimes,
  streamActivity,
  terminate,
} from "./worker.jsx";
import { getWorkerSystemInfo } from "./WorkerImport.mjs";
import { Stream } from "./Stream.jsx";
import { Client } from "./Client.jsx";

import "./globals.css";

export default async function App() {
  if (!useMatch("/", { exact: true })) {
    status(404);
    return null;
  }

  const sysInfo = await getWorkerSystemInfo();
  const stats = await getServerStats();
  const primes = await findPrimes(10000);
  const activity = await streamActivity();

  after(() => {
    logger.info("Response sent to client.");
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>&quot;use worker&quot; &mdash; @lazarv/react-server</title>
      </head>

      <body
        className="bg-slate-950 text-slate-200 min-h-screen antialiased"
        suppressHydrationWarning
      >
        <div className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* ---------- Header ---------- */}

          <header className="mb-14 text-center">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
              <code className="text-blue-400">&quot;use&nbsp;worker&quot;</code>
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Offload computation to{" "}
              <span className="text-blue-300 font-medium">Worker Threads</span>{" "}
              on the server and{" "}
              <span className="text-emerald-300 font-medium">Web Workers</span>{" "}
              in the browser &mdash; powered by{" "}
              <span className="text-white font-semibold">
                @lazarv/react-server
              </span>
            </p>
          </header>

          {/* ---------- Server Worker Section ---------- */}

          <section className="mb-16">
            <SectionHeader
              color="blue"
              title="Server Worker Thread"
              badge="node:worker_threads"
            />
            <p className="text-slate-400 text-sm mb-6 max-w-3xl">
              Functions marked with{" "}
              <code className="text-blue-300 bg-blue-950/40 px-1 rounded">
                &quot;use worker&quot;
              </code>{" "}
              run in a Node.js worker thread. They can return plain values,
              React elements with Suspense, and ReadableStreams.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Worker Stats */}
              <Card
                label="Worker Stats"
                badge="React in Worker"
                accentColor="blue"
                description="React components rendered inside a worker thread via Suspense"
              >
                {stats}
              </Card>

              {/* Prime Numbers */}
              <Card
                label="Prime Numbers"
                badge="CPU Intensive"
                accentColor="blue"
                description="Sieve of Eratosthenes computed in a worker thread"
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-400">Range</dt>
                  <dd className="text-white font-mono">
                    2 &mdash; {primes.limit.toLocaleString()}
                  </dd>
                  <dt className="text-slate-400">Primes Found</dt>
                  <dd className="text-white font-mono">
                    {primes.count.toLocaleString()}
                  </dd>
                  <dt className="text-slate-400">Largest</dt>
                  <dd className="text-white font-mono">
                    {primes.largest.toLocaleString()}
                  </dd>
                  <dt className="text-slate-400">Computed In</dt>
                  <dd className="text-white font-mono">{primes.duration}ms</dd>
                  <dt className="text-slate-400">Last 5</dt>
                  <dd className="text-white font-mono text-xs">
                    {primes.sample.join(", ")}
                  </dd>
                </dl>
              </Card>

              {/* Activity Stream */}
              <Card
                label="Activity Stream"
                badge="ReadableStream"
                accentColor="blue"
                description="Live data streamed from the worker thread via ReadableStream"
              >
                <Stream data={activity} variant="server" />
              </Card>

              {/* Worker Controls */}
              <Card
                label="Worker Controls"
                badge="Lifecycle"
                accentColor="blue"
                description="Worker threads can be terminated and automatically restart on next request"
              >
                <div className="mb-4">
                  <div className="text-xs text-slate-500 mb-1">
                    Module Import
                  </div>
                  <div className="text-sm font-mono text-slate-300 bg-slate-800/50 rounded p-2.5 leading-relaxed">
                    {sysInfo.platform} &middot; {sysInfo.nodeVersion} &middot;{" "}
                    {sysInfo.timestamp}
                  </div>
                </div>

                <form
                  action={async () => {
                    "use server";
                    try {
                      await terminate();
                    } catch {
                      // worker terminated
                    }
                    reload("/");
                  }}
                  className="flex gap-2"
                >
                  <Refresh>
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      Refresh Page
                    </button>
                  </Refresh>
                  <button
                    type="submit"
                    className="flex-1 px-3 py-2 text-sm bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-900/60 rounded-lg transition-colors cursor-pointer"
                  >
                    Terminate Worker
                  </button>
                </form>
              </Card>
            </div>
          </section>

          {/* ---------- Client Worker Section ---------- */}

          <Client />

          {/* ---------- Footer ---------- */}

          <footer className="mt-16 pt-8 border-t border-slate-800/60 text-center text-xs text-slate-600">
            Built with{" "}
            <span className="text-slate-500">@lazarv/react-server</span> &mdash;{" "}
            <code className="text-slate-500">&quot;use worker&quot;</code>{" "}
            example
          </footer>
        </div>
      </body>
    </html>
  );
}

// ---------- Reusable UI Pieces ----------

function SectionHeader({ color, title, badge }) {
  const dotColor = color === "blue" ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className={`inline-block w-3 h-3 rounded-full ${dotColor}`} />
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <span className="text-xs text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">
        {badge}
      </span>
    </div>
  );
}

function Card({ label, badge, accentColor, description, children }) {
  const labelColor =
    accentColor === "blue" ? "text-blue-400" : "text-emerald-400";
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`${labelColor} text-sm font-medium`}>{label}</span>
        {badge && (
          <span className="text-[10px] text-slate-600 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-slate-500 mb-3">{description}</p>
      )}
      {children}
    </div>
  );
}
