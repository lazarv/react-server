"use client";

import { useState, useCallback, Suspense, use } from "react";

import {
  fibonacci,
  sortBenchmark,
  analyzeDataset,
  streamComputations,
} from "./WebWorker.jsx";
import { Stream } from "./Stream.jsx";

export function Client() {
  const [fibN, setFibN] = useState(1000);
  const [fibResult, setFibResult] = useState(null);
  const [fibLoading, setFibLoading] = useState(false);

  const [sortSize, setSortSize] = useState(1000000);
  const [sortResult, setSortResult] = useState(null);
  const [sortLoading, setSortLoading] = useState(false);

  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [streamData, setStreamData] = useState(null);

  const runFibonacci = useCallback(async () => {
    setFibLoading(true);
    setFibResult(null);
    try {
      const result = await fibonacci(fibN);
      setFibResult(result);
    } finally {
      setFibLoading(false);
    }
  }, [fibN]);

  const runSort = useCallback(async () => {
    setSortLoading(true);
    setSortResult(null);
    try {
      const result = await sortBenchmark(sortSize);
      setSortResult(result);
    } finally {
      setSortLoading(false);
    }
  }, [sortSize]);

  const runAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeDataset();
      setAnalysis(result);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const startStream = useCallback(async () => {
    const data = await streamComputations();
    setStreamData(data);
  }, []);

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
        <h2 className="text-xl font-semibold text-white">
          Web Worker (Client)
        </h2>
        <span className="text-xs text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">
          Web Workers API
        </span>
      </div>
      <p className="text-slate-400 text-sm mb-6 max-w-3xl">
        The same{" "}
        <code className="text-emerald-300 bg-emerald-950/40 px-1 rounded">
          &quot;use worker&quot;
        </code>{" "}
        directive works in the browser, offloading computation to a Web Worker.
        The main thread stays responsive while heavy work runs in parallel.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ---------- Fibonacci ---------- */}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-sm font-medium">
              Fibonacci
            </span>
            <span className="text-[10px] text-slate-600 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
              BigInt Computation
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Iterative BigInt Fibonacci computed off the main thread
          </p>

          <div className="flex gap-2 mb-3">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              n&nbsp;=
              <input
                type="number"
                value={fibN}
                onChange={(e) => setFibN(Number(e.target.value))}
                className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
              />
            </label>
            <button
              type="button"
              onClick={runFibonacci}
              disabled={fibLoading}
              className="px-3 py-1.5 text-sm bg-emerald-900/50 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {fibLoading ? "Computing\u2026" : "Compute"}
            </button>
          </div>

          {fibResult && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-400">F({fibResult.n})</dt>
              <dd className="text-white font-mono text-xs truncate">
                {fibResult.result}
              </dd>
              <dt className="text-slate-400">Digits</dt>
              <dd className="text-white font-mono">
                {fibResult.digits.toLocaleString()}
              </dd>
              <dt className="text-slate-400">Time</dt>
              <dd className="text-white font-mono">{fibResult.duration}ms</dd>
            </dl>
          )}
        </div>

        {/* ---------- Sort Benchmark ---------- */}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-sm font-medium">
              Sort Benchmark
            </span>
            <span className="text-[10px] text-slate-600 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
              Array Processing
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Generate and sort a large Float64Array in a Web Worker
          </p>

          <div className="flex gap-2 mb-3">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              Size
              <select
                value={sortSize}
                onChange={(e) => setSortSize(Number(e.target.value))}
                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
              >
                <option value={100000}>100K</option>
                <option value={500000}>500K</option>
                <option value={1000000}>1M</option>
                <option value={5000000}>5M</option>
              </select>
            </label>
            <button
              type="button"
              onClick={runSort}
              disabled={sortLoading}
              className="px-3 py-1.5 text-sm bg-emerald-900/50 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {sortLoading ? "Sorting\u2026" : "Sort"}
            </button>
          </div>

          {sortResult && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-400">Elements</dt>
              <dd className="text-white font-mono">{sortResult.size}</dd>
              <dt className="text-slate-400">Time</dt>
              <dd className="text-white font-mono">{sortResult.duration}ms</dd>
              <dt className="text-slate-400">Min</dt>
              <dd className="text-white font-mono text-xs">{sortResult.min}</dd>
              <dt className="text-slate-400">Median</dt>
              <dd className="text-white font-mono text-xs">
                {sortResult.median}
              </dd>
              <dt className="text-slate-400">Max</dt>
              <dd className="text-white font-mono text-xs">{sortResult.max}</dd>
            </dl>
          )}
        </div>

        {/* ---------- Deferred Promise ---------- */}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-sm font-medium">
              Deferred Result
            </span>
            <span className="text-[10px] text-slate-600 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
              Promise + use()
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Worker returns an object containing a Promise, consumed via
            React&apos;s <code className="text-emerald-300">use()</code> hook
          </p>

          <button
            type="button"
            onClick={runAnalysis}
            disabled={analysisLoading}
            className="px-3 py-1.5 text-sm bg-emerald-900/50 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg transition-colors disabled:opacity-50 mb-3 cursor-pointer"
          >
            {analysisLoading ? "Starting\u2026" : "Run Statistical Analysis"}
          </button>

          {analysis && (
            <Suspense
              fallback={
                <p className="text-slate-500 text-sm animate-pulse">
                  Awaiting deferred result from Web Worker...
                </p>
              }
            >
              <AnalysisResult promise={analysis.data} />
            </Suspense>
          )}
        </div>

        {/* ---------- Computation Stream ---------- */}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-sm font-medium">
              Computation Stream
            </span>
            <span className="text-[10px] text-slate-600 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">
              ReadableStream
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Real-time computation results streamed from a Web Worker
          </p>

          <button
            type="button"
            onClick={startStream}
            className="px-3 py-1.5 text-sm bg-emerald-900/50 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg transition-colors mb-3 cursor-pointer"
          >
            Start Computation
          </button>

          {streamData && <Stream data={streamData} variant="client" />}
        </div>
      </div>
    </section>
  );
}

// ---------- Deferred analysis result consumed with use() ----------

function AnalysisResult({ promise }) {
  const data = use(promise);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-slate-400">Samples</dt>
      <dd className="text-white font-mono">{data.samples.toLocaleString()}</dd>
      <dt className="text-slate-400">Mean</dt>
      <dd className="text-white font-mono">{data.mean}</dd>
      <dt className="text-slate-400">Median</dt>
      <dd className="text-white font-mono">{data.median}</dd>
      <dt className="text-slate-400">Std Dev</dt>
      <dd className="text-white font-mono">{data.stddev}</dd>
      <dt className="text-slate-400">Min</dt>
      <dd className="text-white font-mono">{data.min}</dd>
      <dt className="text-slate-400">Max</dt>
      <dd className="text-white font-mono">{data.max}</dd>
    </dl>
  );
}
