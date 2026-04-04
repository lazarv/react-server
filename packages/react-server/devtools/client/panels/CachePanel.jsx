"use client";

import { useState } from "react";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTTL(ttl) {
  if (ttl === Infinity || ttl === "Infinity") return "∞";
  if (typeof ttl !== "number") return String(ttl);
  if (ttl < 1000) return `${ttl}ms`;
  if (ttl < 60000) return `${(ttl / 1000).toFixed(1)}s`;
  return `${(ttl / 60000).toFixed(1)}m`;
}

function formatArgs(args) {
  if (!args || args.length === 0) return null;
  try {
    return `(${JSON.stringify(args).slice(1, -1)})`;
  } catch {
    return `(${args.join(", ")})`;
  }
}

const TYPE_CLASSES = {
  hit: "green",
  miss: "amber",
  revalidate: "indigo",
  error: "red",
};

const PROVIDER_CLASSES = {
  request: "violet",
  default: "sky",
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function HydrationSection({ hydration }) {
  const [expanded, setExpanded] = useState(false);

  if (!hydration || hydration.entries.length === 0) return null;

  return (
    <div className="dt-cache-hydration">
      <button
        className="dt-cache-hydration-toggle"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="dt-cache-hydration-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="dt-tag dt-tag-violet">request cache</span>
        <span className="dt-cache-hydration-summary">
          {hydration.entries.length} hydrated entr
          {hydration.entries.length === 1 ? "y" : "ies"}
          {" · "}
          {formatSize(hydration.totalSize)}
        </span>
      </button>
      {expanded && (
        <div className="dt-cache-hydration-list">
          {hydration.entries.map((entry) => (
            <div key={entry.hashedKey} className="dt-cache-hydration-entry">
              <code className="dt-cache-hydration-key" title={entry.hashedKey}>
                {entry.hashedKey}
              </code>
              <span className="dt-cache-hydration-size">
                {formatSize(entry.size)}
              </span>
              <span
                className="dt-cache-hydration-preview"
                title={entry.preview}
              >
                {entry.preview}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CachePanel({ events = [], hydration = null }) {
  const [filter, setFilter] = useState("all");

  const filtered =
    filter === "all" ? events : events.filter((e) => e.type === filter);

  const hitCount = events.filter((e) => e.type === "hit").length;
  const missCount = events.filter((e) => e.type === "miss").length;
  const revalidateCount = events.filter((e) => e.type === "revalidate").length;

  if (events.length === 0 && !hydration) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">💾</div>
        <div className="dt-empty-title">No cache events recorded yet.</div>
        <div className="dt-empty-subtitle">
          Use <code>"use cache"</code> in your server components to see cache
          hits and misses here.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-cache-panel">
      <HydrationSection hydration={hydration} />
      {events.length > 0 && (
        <div className="dt-toolbar">
          <div className="dt-cache-stats">
            <span className="dt-cache-stat dt-cache-stat-hit">
              {hitCount} hit{hitCount !== 1 ? "s" : ""}
            </span>
            <span className="dt-cache-stat dt-cache-stat-miss">
              {missCount} miss{missCount !== 1 ? "es" : ""}
            </span>
            {revalidateCount > 0 && (
              <span className="dt-cache-stat dt-cache-stat-revalidate">
                {revalidateCount} revalidat
                {revalidateCount !== 1 ? "ions" : "e"}
              </span>
            )}
          </div>
          <div className="dt-cache-filters">
            {["all", "hit", "miss", "revalidate"].map((f) => (
              <button
                key={f}
                className="dt-filter-btn"
                data-active={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? `All (${events.length})` : f}
              </button>
            ))}
          </div>
        </div>
      )}
      {events.length > 0 && (
        <div className="dt-cache-list">
          {filtered
            .slice()
            .toReversed()
            .map((event, i) => (
              <div key={`${event.timestamp}-${i}`} className="dt-cache-event">
                <span className="dt-cache-time">
                  {formatTime(event.timestamp)}
                </span>
                <span
                  className={`dt-tag dt-tag-${TYPE_CLASSES[event.type] || "gray"}`}
                >
                  {event.type}
                </span>
                <span
                  className={`dt-tag dt-tag-${PROVIDER_CLASSES[event.provider] || "gray"}`}
                >
                  {event.provider}
                </span>
                <span
                  className="dt-cache-fn"
                  title={
                    event.file
                      ? `${event.file}:${event.line}:${event.col}`
                      : undefined
                  }
                >
                  <span className="dt-cache-fn-name">
                    {event.fn || "anonymous"}
                  </span>{" "}
                  {event.args && event.args.length > 0 && (
                    <span className="dt-cache-fn-args">
                      {formatArgs(event.args)}
                    </span>
                  )}
                </span>
                {event.file && (
                  <a
                    className="dt-cache-loc"
                    href={`vscode://file${event.fullPath || event.file}:${event.line}:${(event.col || 0) + 1}`}
                    title={`${event.fullPath || event.file}:${event.line}:${(event.col || 0) + 1}`}
                  >
                    {event.file}:{event.line}
                  </a>
                )}
                {event.ttl != null && event.type !== "hit" && (
                  <span className="dt-cache-ttl">
                    TTL: {formatTTL(event.ttl)}
                  </span>
                )}
                {event.provider !== "request" && event._keys && (
                  <button
                    className="dt-cache-invalidate"
                    title="Invalidate this cache entry"
                    onClick={() => {
                      window.parent.postMessage(
                        {
                          type: "devtools:cache-invalidate",
                          keys: event._keys,
                          provider: event.provider,
                        },
                        "*"
                      );
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
