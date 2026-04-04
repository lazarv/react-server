"use client";

const STATE_CLASSES = {
  starting: "amber",
  waiting: "violet",
  running: "green",
  connected: "green",
  finished: "gray",
  aborted: "red",
  error: "red",
};

const STATE_ICONS = {
  starting: "\u23f3",
  waiting: "\u23f8\ufe0f",
  running: "\u25b6\ufe0f",
  connected: "\u25b6\ufe0f",
  finished: "\u2705",
  aborted: "\ud83d\udeab",
  error: "\u274c",
};

function Tag({ color = "indigo", children }) {
  return <span className={`dt-tag dt-tag-${color}`}>{children}</span>;
}

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function LivePanel({
  components: liveOutlets = [],
  serverState = {},
}) {
  if (liveOutlets.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">{"\u26a1"}</div>
        <div className="dt-empty-title">No live components active.</div>
        <div className="dt-empty-subtitle">
          Use <code className="dt-mono">"use live"</code> to create live
          components.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-card-grid">
      {liveOutlets.map((outlet, i) => {
        const server = serverState[outlet.name];
        const state = server?.state ?? "connected";
        const displayName = server?.displayName ?? null;
        const specifier = server?.specifier ?? null;
        const yields = server?.yields ?? null;
        const lastYieldAt = server?.lastYieldAt ?? null;
        const startedAt = server?.startedAt ?? null;
        const streaming = server?.streaming ?? false;
        const error = server?.error ?? null;
        const isRemote = outlet.remote;

        const stateClass = STATE_CLASSES[state] ?? "gray";
        const stateIcon = STATE_ICONS[state] ?? "";

        return (
          <div key={outlet.name || i} className="dt-card">
            <div className="dt-card-header">
              <span className="dt-live-icon">{stateIcon}</span>
              <div className="dt-card-title">
                {displayName || "LiveComponent"}
              </div>
              <Tag color={stateClass}>{state}</Tag>
              {streaming && <Tag color="cyan">streaming</Tag>}
              {isRemote && <Tag color="violet">remote</Tag>}
            </div>

            {specifier && (
              <div className="dt-card-sub" title={specifier}>
                {specifier}
              </div>
            )}

            {outlet.url && (
              <div className="dt-card-sub" title={outlet.url}>
                {isRemote ? outlet.url : `outlet: ${outlet.name}`}
              </div>
            )}

            <div className="dt-card-meta">
              {typeof yields === "number" && (
                <span>
                  yields: <strong>{yields}</strong>
                </span>
              )}
              {lastYieldAt && <span>last yield: {timeAgo(lastYieldAt)}</span>}
              {startedAt && <span>started: {timeAgo(startedAt)}</span>}
            </div>

            {error && <div className="dt-error-box">{error}</div>}
          </div>
        );
      })}
    </div>
  );
}
