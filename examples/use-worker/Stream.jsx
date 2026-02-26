"use client";

import React from "react";

const streamReader = new WeakMap();
const decoder = new TextDecoder();

export function Stream({ data, variant = "server" }) {
  const [entries, setEntries] = React.useState([]);

  React.useEffect(() => {
    const abortController = new AbortController();

    let reader = streamReader.get(data);
    if (!reader) {
      setEntries([]);
      reader = data.getReader();
      streamReader.set(data, reader);
    }

    async function read() {
      try {
        while (true) {
          if (abortController.signal.aborted) return;
          const { done, value } = await reader.read();
          if (done) return;
          const text =
            typeof value === "string" ? value : decoder.decode(value);
          const lines = text.trim().split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              setEntries((prev) => [...prev, JSON.parse(line)]);
            } catch {
              setEntries((prev) => [...prev, { msg: line }]);
            }
          }
        }
      } catch (e) {
        if (!abortController.signal.aborted) {
          console.error("Stream error:", e);
        }
      }
    }
    read();

    return () => abortController.abort();
  }, [data]);

  if (variant === "server") {
    return <ServerStreamView entries={entries} />;
  }
  return <ClientStreamView entries={entries} />;
}

// ---------- Server stream: phase-colored activity log ----------

const PHASE_COLORS = {
  init: "bg-blue-400",
  process: "bg-yellow-400",
  compute: "bg-purple-400",
  serialize: "bg-cyan-400",
  cleanup: "bg-orange-400",
  done: "bg-emerald-400",
};

function ServerStreamView({ entries }) {
  const lastEntry = entries[entries.length - 1];
  return (
    <div className="space-y-1 font-mono text-xs max-h-60 overflow-y-auto pr-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
              PHASE_COLORS[entry.phase] || "bg-slate-400"
            }`}
          />
          <span className="text-slate-500 shrink-0">
            {formatTime(entry.time)}
          </span>
          <span className="text-slate-200">{entry.msg}</span>
        </div>
      ))}
      {entries.length > 0 && lastEntry?.phase !== "done" && (
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
}

// ---------- Client stream: step-based computation progress ----------

function ClientStreamView({ entries }) {
  const lastEntry = entries[entries.length - 1];
  const isComplete = lastEntry && lastEntry.step === lastEntry.total;
  return (
    <div className="space-y-1 font-mono text-xs max-h-60 overflow-y-auto pr-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-emerald-400 shrink-0">
            [{entry.step}/{entry.total}]
          </span>
          <span className="text-slate-400 shrink-0">
            {formatTime(entry.time)}
          </span>
          <span className="text-slate-200 flex-1">{entry.operation}</span>
          <span className="text-slate-500 ml-auto shrink-0">
            Σ {entry.result}
          </span>
        </div>
      ))}
      {entries.length > 0 && !isComplete && (
        <div className="flex items-center gap-2 text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Computing...</span>
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour12: false,
      fractionalSecondDigits: 3,
    });
  } catch {
    return "";
  }
}
