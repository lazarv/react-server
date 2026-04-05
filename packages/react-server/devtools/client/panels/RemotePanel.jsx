"use client";

import { useMemo } from "react";

import { pickColor } from "../highlight-colors.mjs";

function Tag({ color = "indigo", children }) {
  return <span className={`dt-tag dt-tag-${color}`}>{children}</span>;
}

function Icon({ d, title }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={title}
    >
      <path d={d} />
    </svg>
  );
}

// Lucide-style icon paths
const ICON_EXTERNAL =
  "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3";
const ICON_EYE =
  "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const ICON_ARROW_RIGHT = "M5 12h14 M12 5l7 7-7 7";

export default function RemotePanel({
  components = [],
  onHighlight,
  onClearHighlight,
  onNavigateOutlet,
  onScrollIntoView,
}) {
  const colors = useMemo(
    () => components.map((comp) => pickColor(comp.name)),
    [components]
  );

  if (components.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">🌐</div>
        <div className="dt-empty-title">No remote components tracked.</div>
        <div className="dt-empty-subtitle">
          Use <code className="dt-mono">&lt;RemoteComponent&gt;</code> to load
          remote RSC components.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-card-grid">
      {components.map((comp, i) => (
        <div
          key={comp.name || i}
          className="dt-card dt-card-hover"
          onMouseEnter={() => {
            if (comp.name) {
              onHighlight?.(
                `[data-devtools-outlet="${comp.name}"]`,
                colors[i],
                comp.name
              );
            }
          }}
          onMouseLeave={() => {
            onClearHighlight?.();
          }}
        >
          <div className="dt-remote-header">
            <div className="dt-remote-url" title={comp.url}>
              {comp.url}
            </div>
            <div className="dt-remote-actions">
              {comp.url && (
                <a
                  className="dt-remote-action"
                  href={comp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open remote URL"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon d={ICON_EXTERNAL} title="Open remote URL" />
                </a>
              )}
              {comp.name && (
                <button
                  className="dt-remote-action"
                  title="Scroll into view"
                  onClick={(e) => {
                    e.stopPropagation();
                    onScrollIntoView?.(`[data-devtools-outlet="${comp.name}"]`);
                  }}
                >
                  <Icon d={ICON_EYE} title="Scroll into view" />
                </button>
              )}
              {comp.name && (
                <button
                  className="dt-remote-action"
                  title={`Go to outlet: ${comp.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateOutlet?.(comp.name);
                  }}
                >
                  <Icon d={ICON_ARROW_RIGHT} title="Go to outlet" />
                </button>
              )}
            </div>
          </div>
          {comp.name && (
            <div className="dt-card-sub" title={comp.name}>
              outlet: {comp.name}
            </div>
          )}
          <div className="dt-badges">
            {comp.ttl != null && (
              <Tag color="amber">
                TTL: {comp.ttl === Infinity ? "\u221e" : `${comp.ttl}ms`}
              </Tag>
            )}
            {comp.isolate && <Tag color="violet">isolate</Tag>}
            {comp.defer && <Tag color="cyan">defer</Tag>}
            {comp.live && <Tag color="green">live</Tag>}
          </div>
        </div>
      ))}
    </div>
  );
}
