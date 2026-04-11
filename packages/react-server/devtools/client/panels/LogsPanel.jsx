"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";

/* ═══════════════════════════════════════════════════════════════════
   ANSI escape code → React span converter.
   Supports SGR codes (colors, bold, italic, underline, dim, etc.)
   for 4-bit, 8-bit, and 24-bit (true-color) ANSI sequences.
   ═══════════════════════════════════════════════════════════════════ */

const ANSI_4BIT_FG = {
  30: "#1e1e1e",
  31: "#cd3131",
  32: "#0dbc79",
  33: "#e5e510",
  34: "#2472c8",
  35: "#bc3fbc",
  36: "#11a8cd",
  37: "#e5e5e5",
  90: "#666666",
  91: "#f14c4c",
  92: "#23d18b",
  93: "#f5f543",
  94: "#3b8eea",
  95: "#d670d6",
  96: "#29b8db",
  97: "#ffffff",
};

const ANSI_4BIT_BG = {
  40: "#1e1e1e",
  41: "#cd3131",
  42: "#0dbc79",
  43: "#e5e510",
  44: "#2472c8",
  45: "#bc3fbc",
  46: "#11a8cd",
  47: "#e5e5e5",
  100: "#666666",
  101: "#f14c4c",
  102: "#23d18b",
  103: "#f5f543",
  104: "#3b8eea",
  105: "#d670d6",
  106: "#29b8db",
  107: "#ffffff",
};

const XTERM_256 = (() => {
  const c = [];
  c.push(
    "#000000",
    "#cd3131",
    "#0dbc79",
    "#e5e510",
    "#2472c8",
    "#bc3fbc",
    "#11a8cd",
    "#e5e5e5"
  );
  c.push(
    "#666666",
    "#f14c4c",
    "#23d18b",
    "#f5f543",
    "#3b8eea",
    "#d670d6",
    "#29b8db",
    "#ffffff"
  );
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        c.push(
          `#${[r, g, b].map((v) => (v ? v * 40 + 55 : 0).toString(16).padStart(2, "0")).join("")}`
        );
  for (let i = 0; i < 24; i++) {
    const v = (i * 10 + 8).toString(16).padStart(2, "0");
    c.push(`#${v}${v}${v}`);
  }
  return c;
})();

// Matches SGR sequences (\x1b[...m) for color parsing.
// Also matches non-SGR CSI sequences to skip them (they're stripped
// server-side but this is belt-and-suspenders).
// oxlint-disable-next-line no-control-regex
const ANSI_SGR_RE = new RegExp("\\x1b\\[([0-9;]*)m", "g");
/* oxlint-disable no-control-regex */
const ANSI_CSI_NON_SGR_RE = new RegExp(
  "\\x1b\\[[0-9;]*[A-HJKSTfhlnr]|\\x1b\\][\\s\\S]*?(?:\\x07|\\x1b\\\\)|\\r",
  "g"
);
/* oxlint-enable no-control-regex */

function ansiToSpans(rawText) {
  // Strip any leftover non-SGR sequences before parsing colors
  const text = rawText.replace(ANSI_CSI_NON_SGR_RE, "");
  const spans = [];
  let style = {};
  let lastIndex = 0;

  ANSI_SGR_RE.lastIndex = 0;
  let match;
  while ((match = ANSI_SGR_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        text: text.slice(lastIndex, match.index),
        style: { ...style },
      });
    }
    lastIndex = ANSI_SGR_RE.lastIndex;

    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    let i = 0;
    while (i < codes.length) {
      const code = codes[i];
      if (code === 0) {
        style = {};
      } else if (code === 1) {
        style.fontWeight = "bold";
      } else if (code === 2) {
        style.opacity = "0.7";
      } else if (code === 3) {
        style.fontStyle = "italic";
      } else if (code === 4) {
        style.textDecoration = "underline";
      } else if (code === 9) {
        style.textDecoration = "line-through";
      } else if (code === 22) {
        delete style.fontWeight;
        delete style.opacity;
      } else if (code === 23) {
        delete style.fontStyle;
      } else if (code === 24 || code === 29) {
        delete style.textDecoration;
      } else if (code === 39) {
        delete style.color;
      } else if (code === 49) {
        delete style.backgroundColor;
      } else if (ANSI_4BIT_FG[code]) {
        style.color = ANSI_4BIT_FG[code];
      } else if (ANSI_4BIT_BG[code]) {
        style.backgroundColor = ANSI_4BIT_BG[code];
      } else if (code === 38 || code === 48) {
        const prop = code === 38 ? "color" : "backgroundColor";
        if (codes[i + 1] === 5 && codes.length > i + 2) {
          style[prop] = XTERM_256[codes[i + 2]] || style[prop];
          i += 2;
        } else if (codes[i + 1] === 2 && codes.length > i + 4) {
          style[prop] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
          i += 4;
        }
      }
      i++;
    }
  }

  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), style: { ...style } });
  }

  return spans;
}

/* ═══════════════════════════════════════════════════════════════════ */

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

const AnsiLine = ({ text }) => {
  const spans = useMemo(() => ansiToSpans(text), [text]);
  return spans.map((span, i) =>
    Object.keys(span.style).length > 0 ? (
      <span key={i} style={span.style}>
        {span.text}
      </span>
    ) : (
      span.text
    )
  );
};

/* oxlint-disable no-control-regex */
const ANSI_STRIP_RE = new RegExp(
  "\\x1b\\[[0-9;]*[A-Za-z]|\\x1b\\][\\s\\S]*?(?:\\x07|\\x1b\\\\)",
  "g"
);
/* oxlint-enable no-control-regex */
const stripAnsi = (s) => s.replace(ANSI_STRIP_RE, "");

/* ═══════════════════════════════════════════════════════════════════
   Variable-height virtual list.

   Strategy:
   1. Every row starts with an estimated height (EST_ROW_HEIGHT).
   2. After rendering, we measure actual DOM heights and cache them
      keyed by the entry's id.
   3. Total scrollable height = sum of (measured ?? estimated) for all
      rows.  A single absolutely-positioned sentinel div provides
      the scroll height.
   4. On scroll we binary-search for the first visible row, then
      render [start − overscan … end + overscan].
   5. Rendered rows are absolutely positioned at their cumulative
      offset so the browser never reflows the entire list.
   ═══════════════════════════════════════════════════════════════════ */

const EST_ROW_HEIGHT = 22;
const OVERSCAN = 10;

function useVirtualList(containerRef, items) {
  // height cache: item.id → measured pixel height
  const heightCache = useRef(new Map());
  // ref to rendered row DOM nodes for measurement
  const rowRefs = useRef(new Map());
  // force re-render after measurements
  const [tick, setTick] = useState(0);

  // Compute cumulative offsets (prefix sums) for all items.
  // This is O(n) per render but n ≤ 1000 so it's <1ms.
  // `tick` is included so offsets recalculate after row measurements update the cache.
  const { offsets, totalHeight } = useMemo(() => {
    const offsets = Array.from({ length: items.length });
    let cum = 0;
    for (let i = 0; i < items.length; i++) {
      offsets[i] = cum;
      cum += heightCache.current.get(items[i].id) ?? EST_ROW_HEIGHT;
    }
    return { offsets, totalHeight: cum };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tick]);

  // Determine visible range from current scrollTop + container height.
  const getVisibleRange = useCallback(() => {
    const el = containerRef.current;
    if (!el || items.length === 0) return { start: 0, end: 0 };

    const scrollTop = el.scrollTop;
    const viewHeight = el.clientHeight;

    // Binary search for the first item whose bottom edge is past scrollTop.
    let lo = 0;
    let hi = items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const bottom =
        offsets[mid] +
        (heightCache.current.get(items[mid].id) ?? EST_ROW_HEIGHT);
      if (bottom <= scrollTop) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const start = Math.max(0, lo - OVERSCAN);

    // Walk forward to find last visible item.
    let end = lo;
    while (end < items.length && offsets[end] < scrollTop + viewHeight) {
      end++;
    }
    end = Math.min(items.length, end + OVERSCAN);

    return { start, end };
  }, [items, offsets, containerRef]);

  // After paint, measure any rendered rows and update cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let changed = false;
    for (const [id, node] of rowRefs.current) {
      if (node) {
        const measured = node.getBoundingClientRect().height;
        const cached = heightCache.current.get(id);
        // Only update if the difference is meaningful (>0.5px) to avoid
        // infinite measure→render loops from sub-pixel rounding.
        if (cached === undefined || Math.abs(cached - measured) > 0.5) {
          heightCache.current.set(id, measured);
          changed = true;
        }
      }
    }
    if (changed) setTick((t) => t + 1);
  });

  return { offsets, totalHeight, getVisibleRange, rowRefs, heightCache };
}

/* ═══════════════════════════════════════════════════════════════════ */

function LogRow({ entry, style, rowRef }) {
  return (
    <div
      ref={rowRef}
      className="dt-logs-entry"
      data-stream={entry.stream}
      style={style}
    >
      <span className="dt-logs-time">{formatTime(entry.timestamp)}</span>
      <span
        className={`dt-tag dt-tag-${entry.stream === "stderr" ? "red" : "gray"}`}
      >
        {entry.stream === "stderr" ? "err" : "out"}
      </span>
      <span className="dt-logs-message">
        <AnsiLine text={entry.text} />
      </span>
    </div>
  );
}

export default function LogsPanel({ entries = [], onClear }) {
  const [streamFilter, setStreamFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef(null);
  const prevLengthRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (streamFilter !== "all" && entry.stream !== streamFilter) return false;
      if (search) {
        const plain = stripAnsi(entry.text).toLowerCase();
        if (!plain.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [entries, streamFilter, search]);

  const { offsets, totalHeight, getVisibleRange, rowRefs, heightCache } =
    useVirtualList(containerRef, filtered);

  // Compute visible range from current scrollTop.
  const { start, end } = useMemo(() => {
    return getVisibleRange();
    // scrollTop is in deps to recalculate on scroll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVisibleRange, scrollTop, filtered]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  // Auto-scroll to bottom when new entries arrive and pinned.
  useEffect(() => {
    if (
      autoScroll &&
      filtered.length > prevLengthRef.current &&
      containerRef.current
    ) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevLengthRef.current = filtered.length;
  }, [filtered.length, autoScroll, totalHeight]);

  // Reset height cache when filters change (different rows visible).
  useEffect(() => {
    heightCache.current.clear();
  }, [streamFilter, search, heightCache]);

  const stderrCount = entries.filter((e) => e.stream === "stderr").length;
  const stdoutCount = entries.length - stderrCount;

  if (entries.length === 0) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon">&#x1F4CB;</div>
        <div className="dt-empty-title">No server logs yet.</div>
        <div className="dt-empty-subtitle">
          All server terminal output will appear here in real-time.
        </div>
      </div>
    );
  }

  // Clear stale row refs before rendering the new slice.
  rowRefs.current.clear();

  const visibleRows = [];
  for (let i = start; i < end; i++) {
    const entry = filtered[i];
    if (!entry) continue;
    visibleRows.push(
      <LogRow
        key={entry.id}
        entry={entry}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          transform: `translateY(${offsets[i]}px)`,
        }}
        rowRef={(node) => {
          if (node) rowRefs.current.set(entry.id, node);
          else rowRefs.current.delete(entry.id);
        }}
      />
    );
  }

  return (
    <div className="dt-logs-panel">
      <div className="dt-toolbar">
        <div className="dt-logs-filters">
          {[
            { id: "all", label: `All (${entries.length})` },
            { id: "stdout", label: `stdout (${stdoutCount})` },
            { id: "stderr", label: `stderr (${stderrCount})` },
          ].map((f) => (
            <button
              key={f.id}
              className="dt-filter-btn"
              data-active={streamFilter === f.id}
              onClick={() => setStreamFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="dt-logs-actions">
          <input
            className="dt-logs-search"
            type="text"
            placeholder="Filter logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="dt-logs-clear-btn"
            onClick={onClear}
            title="Clear logs"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="dt-logs-list" ref={containerRef} onScroll={handleScroll}>
        <div
          className="dt-logs-sentinel"
          style={{ height: totalHeight, position: "relative" }}
        >
          {visibleRows}
        </div>
      </div>
      {!autoScroll && (
        <button
          className="dt-logs-scroll-btn"
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth",
              });
            }
          }}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
