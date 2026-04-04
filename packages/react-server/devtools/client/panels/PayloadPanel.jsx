"use client";

import { useState, useMemo, useCallback, useRef } from "react";

const TAG_LABELS = {
  "": "Model",
  I: "Module",
  E: "Error",
  H: "Hint",
  D: "Debug",
  T: "Text",
  B: "Binary",
  W: "Console",
};

const TAG_CLASSES = {
  "": "indigo",
  I: "green",
  E: "red",
  H: "amber",
  D: "violet",
  T: "cyan",
  B: "teal",
  W: "orange",
};

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function Tag({ color, children }) {
  return <span className={`dt-tag dt-tag-${color}`}>{children}</span>;
}

function DataPreview({ data, maxLength = 120 }) {
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 0);

  const truncated =
    str?.length > maxLength ? str.slice(0, maxLength) + "..." : str;

  return <code className="dt-data-preview">{truncated}</code>;
}

function ChunkRow({ chunk, highlighted, onHighlight, onClearHighlight }) {
  const tagClass = TAG_CLASSES[chunk.tag] ?? "gray";

  return (
    <div
      data-chunk-id={chunk.id}
      className={`dt-chunk-row${highlighted ? " dt-chunk-row-highlight" : ""}`}
      onMouseEnter={() => {
        if (chunk.tag === "I") {
          const moduleId = Array.isArray(chunk.data)
            ? chunk.data[0]
            : chunk.data?.id;
          if (moduleId) {
            onHighlight?.(
              `[data-devtools-client="${moduleId}"]`,
              "rgba(34, 197, 94, 0.3)",
              moduleId
            );
          }
        }
      }}
      onMouseLeave={() => onClearHighlight?.()}
    >
      <span className="dt-chunk-id">#{chunk.id}</span>
      <Tag color={tagClass}>{TAG_LABELS[chunk.tag] ?? chunk.tag}</Tag>
      <span className="dt-chunk-size">{formatBytes(chunk.size)}</span>
      <DataPreview data={chunk.data} />
    </div>
  );
}

function displayModuleId(moduleId, reactServerRoot) {
  if (!reactServerRoot || !moduleId) return moduleId;
  // Match absolute path prefix
  if (moduleId.startsWith(reactServerRoot)) {
    return "@lazarv/react-server" + moduleId.slice(reactServerRoot.length);
  }
  // Match relative paths containing the package directory (e.g. ../../packages/react-server/...)
  const dirName = reactServerRoot.split("/").slice(-2).join("/");
  const idx = moduleId.indexOf(dirName + "/");
  if (idx !== -1) {
    return "@lazarv/react-server/" + moduleId.slice(idx + dirName.length + 1);
  }
  return moduleId;
}

const SIZE_SEGMENTS = [
  { key: "rsc", label: "RSC Payload", color: "#22c55e" },
  { key: "hydration", label: "Hydration", color: "#8b5cf6" },
  { key: "html", label: "HTML", color: "#0ea5e9" },
];

function PageSizeBar({ stats }) {
  const total = stats.htmlSize;
  const rsc = stats.flightSize || 0;
  const hydration = stats.hydrationSize || 0;
  const html = Math.max(0, total - rsc - hydration);

  const segments = [
    { ...SIZE_SEGMENTS[0], value: rsc },
    { ...SIZE_SEGMENTS[1], value: hydration },
    { ...SIZE_SEGMENTS[2], value: html },
  ].filter((s) => s.value > 0);

  const transferred = stats.htmlTransferSize;
  const hasCompression = transferred > 0 && transferred < total;

  return (
    <div className="dt-size-bar-container">
      {/* Bar */}
      <div className="dt-size-bar">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="dt-size-bar-segment"
            style={{
              width: `${(seg.value / total) * 100}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.label}: ${formatBytes(seg.value)}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="dt-size-bar-legend">
        {segments.map((seg) => (
          <span key={seg.key} className="dt-size-bar-legend-item">
            <span
              className="dt-size-bar-dot"
              style={{ backgroundColor: seg.color }}
            />
            <span className="dt-size-bar-label">{seg.label}</span>
            <span className="dt-size-bar-value">{formatBytes(seg.value)}</span>
          </span>
        ))}
        <span className="dt-size-bar-legend-item">
          <span className="dt-size-bar-label dt-size-bar-total">Total</span>
          <span className="dt-size-bar-value">{formatBytes(total)}</span>
        </span>
        {hasCompression && (
          <span className="dt-size-bar-legend-item">
            <span className="dt-size-bar-label dt-size-bar-total">
              Transferred
            </span>
            <span className="dt-size-bar-value">
              {formatBytes(transferred)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function PayloadPanel({
  payloads,
  filter: controlledFilter,
  onFilterChange,
  onHighlight,
  onClearHighlight,
  reactServerRoot,
  pageStats,
}) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [localFilter, setLocalFilter] = useState("");
  const filter = controlledFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const [highlightedChunkId, setHighlightedChunkId] = useState(null);
  const listRef = useRef(null);

  const selected =
    selectedIdx !== null
      ? payloads[selectedIdx]
      : payloads[payloads.length - 1];

  const filteredChunks = useMemo(() => {
    if (!selected?.chunks) return [];
    if (!filter) return selected.chunks;
    const f = filter.toLowerCase();
    return selected.chunks.filter(
      (c) =>
        (TAG_LABELS[c.tag] ?? c.tag).toLowerCase().includes(f) ||
        JSON.stringify(c.data).toLowerCase().includes(f)
    );
  }, [selected, filter]);

  const scrollToChunk = useCallback((chunkId) => {
    const container = listRef.current;
    if (!container) return;
    const row = container.querySelector(`[data-chunk-id="${chunkId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedChunkId(chunkId);
      setTimeout(() => setHighlightedChunkId(null), 2000);
    }
  }, []);

  if (payloads.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">📦</div>
        <div className="dt-empty-title">No RSC payloads captured yet.</div>
        <div className="dt-empty-subtitle">
          Navigate in the host app to capture flight data.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-flex-col">
      {/* Page-level size bar (iOS-style) */}
      {pageStats && pageStats.htmlSize > 0 && <PageSizeBar stats={pageStats} />}

      {/* Payload selector */}
      <div className="dt-filters">
        <select
          value={selectedIdx ?? payloads.length - 1}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          className="dt-select dt-mono"
        >
          {payloads.map((p, i) => {
            const label =
              p.label === "initial"
                ? "⚡ initial"
                : p.label === "stream"
                  ? "🔄 stream"
                  : "🧭 nav";
            return (
              <option key={i} value={i}>
                [{label}] {new URL(p.url, "http://localhost").pathname} —{" "}
                {formatBytes(p.totalSize)} — {p.chunkCount} chunks
              </option>
            );
          })}
        </select>

        <input
          type="text"
          placeholder="Filter chunks..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="dt-input"
        />
      </div>

      {/* Summary badges */}
      {selected && (
        <div className="dt-payload-summary">
          <Tag color="indigo">{formatBytes(selected.totalSize)}</Tag>
          <Tag color="indigo">{selected.chunkCount} chunks</Tag>
          <Tag color="green">{selected.clientRefs.length} client refs</Tag>
          <Tag color="amber">{selected.serverRefs.length} server refs</Tag>
          <Tag color="violet">{selected.promises.length} promises</Tag>
          {selected.errors.length > 0 && (
            <Tag color="red">{selected.errors.length} errors</Tag>
          )}
          <Tag color="gray">{selected.duration}ms</Tag>
        </div>
      )}

      {/* Client references */}
      {selected?.clientRefs.length > 0 && (
        <details className="dt-details">
          <summary>Client References ({selected.clientRefs.length})</summary>
          <div className="dt-details-body">
            {selected.clientRefs.map((ref, i) => (
              <button
                type="button"
                key={i}
                className="dt-client-ref"
                onClick={() => scrollToChunk(ref.id)}
                onMouseEnter={() =>
                  onHighlight?.(
                    `[data-devtools-client="${ref.moduleId}"]`,
                    "rgba(34, 197, 94, 0.3)",
                    ref.name || ref.moduleId
                  )
                }
                onMouseLeave={() => onClearHighlight?.()}
              >
                <span className="dt-client-ref-id">#{ref.id} </span>
                <span className="dt-client-ref-module">
                  {displayModuleId(ref.moduleId, reactServerRoot)}
                </span>
                {ref.name ? (
                  <>
                    <span className="dt-client-ref-arrow"> → </span>
                    <span className="dt-client-ref-name">{ref.name}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Chunk list */}
      <div ref={listRef} className="dt-route-table">
        <div className="dt-chunk-header">
          <span>ID</span>
          <span>Type</span>
          <span>Size</span>
          <span>Data</span>
        </div>

        {filteredChunks.map((chunk, i) => (
          <ChunkRow
            key={i}
            chunk={chunk}
            highlighted={chunk.id === highlightedChunkId}
            onHighlight={onHighlight}
            onClearHighlight={onClearHighlight}
          />
        ))}
      </div>
    </div>
  );
}
