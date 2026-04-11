"use client";

import { useMemo } from "react";

import { pickColor } from "../highlight-colors.mjs";

export default function OutletPanel({
  outlets,
  hostUrl,
  onHighlight,
  onClearHighlight,
  onScrollIntoView,
}) {
  const colors = useMemo(
    () => outlets.map((o) => pickColor(o.name)),
    [outlets]
  );

  if (outlets.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">🔲</div>
        <div className="dt-empty-title">No outlet data received yet.</div>
        <div className="dt-empty-subtitle">
          Waiting for outlet data from the host page...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dt-host-url">
        Host URL: <code className="dt-mono">{hostUrl || "—"}</code>
      </div>

      <div className="dt-card-grid">
        {outlets.map((outlet, i) => (
          <div
            key={outlet.name || i}
            data-outlet-name={outlet.name}
            className="dt-card dt-card-hover dt-outlet-card"
            onMouseEnter={() => {
              onHighlight?.(
                `[data-devtools-outlet="${outlet.name}"]`,
                colors[i],
                outlet.name
              );
            }}
            onMouseLeave={() => {
              onClearHighlight?.();
            }}
          >
            <div className="dt-outlet-info">
              <div className="dt-outlet-name">{outlet.name || "PAGE_ROOT"}</div>
              {outlet.url && <div className="dt-outlet-url">{outlet.url}</div>}
            </div>
            <div className="dt-outlet-actions">
              <div className="dt-badges">
                {outlet._fileRouter && (
                  <span className="dt-tag dt-tag-orange">router</span>
                )}
                {outlet.remote && (
                  <span className="dt-tag dt-tag-violet">remote</span>
                )}
                {outlet.live && (
                  <span className="dt-tag dt-tag-green">live</span>
                )}
                {outlet.defer && (
                  <span className="dt-tag dt-tag-amber">defer</span>
                )}
                {!outlet._fileRouter &&
                  !outlet.remote &&
                  !outlet.live &&
                  !outlet.defer && (
                    <span className="dt-tag dt-tag-gray">static</span>
                  )}
              </div>
              {outlet.name && outlet.name !== "PAGE_ROOT" && (
                <button
                  className="dt-outlet-refresh"
                  title={`Scroll to ${outlet.name} outlet`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onScrollIntoView?.(
                      `[data-devtools-outlet="${outlet.name}"]`
                    );
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                  </svg>
                </button>
              )}
              {!outlet._fileRouter && (
                <button
                  className="dt-outlet-refresh"
                  title={`Refresh ${outlet.name || "root"} outlet`}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.parent.postMessage(
                      {
                        type: "devtools:refresh-outlet",
                        outlet: outlet.name,
                      },
                      "*"
                    );
                  }}
                >
                  ↻
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
