"use client";

import { useState } from "react";

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id) {
  // Show relative-looking path: strip virtual:react-server:worker:: prefix,
  // and shorten to last 2-3 segments for display
  let display = id
    .replace(/^virtual:react-server:worker::/, "")
    .replace(/\?.*$/, "");
  const parts = display.split("/");
  if (parts.length > 3) {
    display = parts.slice(-3).join("/");
  }
  return display;
}

const STATE_LABELS = {
  spawning: { label: "Spawning", tagColor: "amber" },
  ready: { label: "Ready", tagColor: "green" },
  error: { label: "Error", tagColor: "red" },
  restarting: { label: "Restarting", tagColor: "amber" },
};

const TYPE_TAG_COLORS = {
  server: "violet",
  client: "sky",
};

export default function WorkerPanel({
  serverWorkers = [],
  clientWorkers = [],
}) {
  const [typeFilter, setTypeFilter] = useState("all");

  const allWorkers = [
    ...serverWorkers.map((w) => ({ ...w, type: "server" })),
    ...clientWorkers.map((w) => ({ ...w, type: "client" })),
  ];

  const filtered =
    typeFilter === "all"
      ? allWorkers
      : allWorkers.filter((w) => w.type === typeFilter);

  const serverCount = serverWorkers.length;
  const clientCount = clientWorkers.length;

  if (allWorkers.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">&#x2699;&#xFE0F;</div>
        <div className="dt-empty-title">No workers detected.</div>
        <div className="dt-empty-subtitle">
          Use <code>"use worker"</code> in your modules to offload work to
          server or client workers.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-worker-panel">
      <div className="dt-toolbar">
        <div className="dt-worker-stats">
          <span className="dt-worker-stat">
            {allWorkers.length} worker{allWorkers.length !== 1 ? "s" : ""}
          </span>
          {serverCount > 0 && (
            <span className="dt-worker-stat dt-worker-stat-server">
              {serverCount} server
            </span>
          )}
          {clientCount > 0 && (
            <span className="dt-worker-stat dt-worker-stat-client">
              {clientCount} client
            </span>
          )}
        </div>
        <div className="dt-worker-filters">
          {["all", "server", "client"].map((f) => (
            <button
              key={f}
              className="dt-filter-btn"
              data-active={typeFilter === f}
              onClick={() => setTypeFilter(f)}
            >
              {f === "all"
                ? `All (${allWorkers.length})`
                : `${f} (${f === "server" ? serverCount : clientCount})`}
            </button>
          ))}
        </div>
      </div>
      <div className="dt-worker-list">
        {filtered.map((w) => {
          const stateInfo = STATE_LABELS[w.state] || {
            label: w.state,
            tagColor: "gray",
          };
          return (
            <div key={`${w.type}-${w.id}`} className="dt-worker-entry">
              <div className="dt-worker-header">
                <span
                  className={`dt-tag dt-tag-${TYPE_TAG_COLORS[w.type] || "gray"}`}
                >
                  {w.type}
                </span>
                <span className={`dt-tag dt-tag-${stateInfo.tagColor}`}>
                  {stateInfo.label}
                </span>
                <span className="dt-worker-id" title={w.id}>
                  {shortId(w.id)}
                </span>
              </div>
              <div className="dt-worker-details">
                <span className="dt-worker-detail">
                  <span className="dt-worker-detail-label">Calls:</span>{" "}
                  {w.invocations ?? 0}
                  {(w.activeInvocations ?? 0) > 0 && (
                    <span className="dt-worker-active">
                      {" "}
                      ({w.activeInvocations} active)
                    </span>
                  )}
                </span>
                {(w.errors ?? 0) > 0 && (
                  <span className="dt-worker-detail dt-worker-detail-error">
                    <span className="dt-worker-detail-label">Errors:</span>{" "}
                    {w.errors}
                  </span>
                )}
                {(w.restarts ?? 0) > 0 && (
                  <span className="dt-worker-detail dt-worker-detail-restart">
                    <span className="dt-worker-detail-label">Restarts:</span>{" "}
                    {w.restarts}
                  </span>
                )}
                {w.lastFn && (
                  <span className="dt-worker-detail">
                    <span className="dt-worker-detail-label">Last fn:</span>{" "}
                    <code>{w.lastFn}</code>
                  </span>
                )}
                <span className="dt-worker-detail">
                  <span className="dt-worker-detail-label">Spawned:</span>{" "}
                  {formatTime(w.spawnedAt)}
                </span>
                {w.lastInvokedAt && (
                  <span className="dt-worker-detail">
                    <span className="dt-worker-detail-label">Last call:</span>{" "}
                    {formatTime(w.lastInvokedAt)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
