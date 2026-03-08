/**
 * A pretty-printed console span exporter for development.
 *
 * Buffers spans per trace and renders a compact tree view with:
 *  - Request summary header (method, path, status, total duration)
 *  - Hierarchical tree using parent-child relationships
 *  - Color-coded durations (green / yellow / red)
 *  - Proportional timing bars
 *  - Key attributes displayed inline
 *
 * Used automatically in dev mode when telemetry is enabled.
 */

import colors from "picocolors";

// ── Thresholds & layout ───────────────────────────────────────────────

const SLOW_MS = 100;
const WARN_MS = 20;
const BAR_WIDTH = 12;
const MIN_DURATION_MS = 1; // Hide spans shorter than this from dev console

// ── Helpers ───────────────────────────────────────────────────────────

function hrTimeToMs(hrTime) {
  if (Array.isArray(hrTime)) return hrTime[0] * 1000 + hrTime[1] / 1e6;
  return 0;
}

function formatDuration(ms) {
  if (ms < 0.01) return colors.dim("—");
  if (ms < 1) return colorDuration(`${(ms * 1000).toFixed(0)}µs`, ms);
  if (ms < 1000) return colorDuration(`${ms.toFixed(1)}ms`, ms);
  return colorDuration(`${(ms / 1000).toFixed(2)}s`, ms);
}

function colorDuration(text, ms) {
  if (ms >= SLOW_MS) return colors.red(text);
  if (ms >= WARN_MS) return colors.yellow(text);
  return colors.green(text);
}

function timingBar(ms, maxMs) {
  if (maxMs <= 0 || ms <= 0) return "";
  const filled = Math.max(1, Math.round((ms / maxMs) * BAR_WIDTH));
  const bar = "░".repeat(Math.min(filled, BAR_WIDTH));
  if (ms >= SLOW_MS) return colors.red(bar);
  if (ms >= WARN_MS) return colors.yellow(bar);
  return colors.dim(bar);
}

function statusBadge(code) {
  if (code >= 500) return colors.red(colors.bold(String(code)));
  if (code >= 400) return colors.yellow(String(code));
  if (code >= 300) return colors.cyan(String(code));
  if (code >= 200) return colors.green(String(code));
  return colors.dim(String(code));
}

function methodColor(method) {
  switch (method) {
    case "GET":
      return colors.cyan;
    case "POST":
      return colors.green;
    case "PUT":
      return colors.yellow;
    case "DELETE":
      return colors.red;
    case "PATCH":
      return colors.magenta;
    default:
      return colors.white;
  }
}

/** Pick the most useful inline detail from span attributes. */
function inlineDetail(name, attrs) {
  const parts = [];
  // Cache operations: show hit/miss status
  if (attrs["react_server.cache.hit"] !== undefined) {
    parts.push(
      attrs["react_server.cache.hit"]
        ? colors.green("HIT")
        : colors.yellow("MISS")
    );
    if (
      attrs["react_server.cache.provider"] &&
      attrs["react_server.cache.provider"] !== "default"
    )
      parts.push(colors.dim(`(${attrs["react_server.cache.provider"]})`));
  }
  // Render type
  if (attrs["react_server.render_type"])
    parts.push(colors.magenta(attrs["react_server.render_type"]));
  // Server functions: show function ID
  if (attrs["react_server.server_function.id"])
    parts.push(colors.yellow(attrs["react_server.server_function.id"]));
  // Vite plugin hooks: show module being processed
  if (attrs["react_server.vite.module_id"]) {
    let modId = attrs["react_server.vite.module_id"];
    // Shorten long module paths
    if (modId.length > 60) modId = "…" + modId.slice(-55);
    parts.push(colors.dim(modId));
  }
  return parts.length ? " " + parts.join(" ") : "";
}

// ── Tree construction & rendering ─────────────────────────────────────

function buildTree(spans) {
  const childrenOf = new Map();

  for (const span of spans) {
    childrenOf.set(span.spanContext().spanId, []);
  }

  const roots = [];
  for (const span of spans) {
    const parentId = span.parentSpanContext?.spanId;
    if (parentId && childrenOf.has(parentId)) {
      childrenOf.get(parentId).push(span);
    } else {
      roots.push(span);
    }
  }

  for (const children of childrenOf.values()) {
    children.sort((a, b) => hrTimeToMs(a.startTime) - hrTimeToMs(b.startTime));
  }

  return { roots, childrenOf };
}

function isVitePluginSpan(span) {
  return span.name.startsWith("Vite plugin [");
}

/**
 * Group green-duration Vite plugin spans by name.
 * Yellow/red/error spans are kept individual. Non-Vite spans pass through.
 *
 * Returns a flat list of "render items" in original order:
 *   { type: "span", span }          — individual span
 *   { type: "group", name, count, totalMs } — collapsed group
 */
function groupViteSpans(spans, childrenOf) {
  // First pass: bucket green Vite spans by name
  const greenBuckets = new Map(); // name → span[]
  const items = []; // ordered render items (placeholder for groups)

  for (const span of spans) {
    const durationMs = hrTimeToMs(span.endTime) - hrTimeToMs(span.startTime);
    const isVite = isVitePluginSpan(span);
    const isGreen = durationMs < WARN_MS;
    const hasError = span.status?.code === 2;
    const hasChildren =
      (childrenOf.get(span.spanContext().spanId) || []).length > 0;

    if (isVite && isGreen && !hasError && !hasChildren) {
      if (!greenBuckets.has(span.name)) {
        greenBuckets.set(span.name, []);
        // Insert a group placeholder at position of first occurrence
        items.push({ type: "group", name: span.name, _bucket: span.name });
      }
      greenBuckets.get(span.name).push(span);
    } else {
      items.push({ type: "span", span });
    }
  }

  // Second pass: resolve group placeholders
  const result = [];
  for (const item of items) {
    if (item.type === "group") {
      const bucket = greenBuckets.get(item._bucket);
      if (!bucket || bucket.length === 0) continue;
      const totalMs = bucket.reduce(
        (sum, s) => sum + (hrTimeToMs(s.endTime) - hrTimeToMs(s.startTime)),
        0
      );
      result.push({
        type: "group",
        name: item.name,
        count: bucket.length,
        totalMs,
      });
    } else {
      result.push(item);
    }
  }
  return result;
}

function renderTree(spans, childrenOf, maxMs, prefix) {
  const lines = [];

  // Separate spans by visibility: >= MIN_DURATION_MS shown individually, rest collapsed
  const visibleSpans = [];
  let skippedCount = 0;
  let skippedTotalMs = 0;

  for (const span of spans) {
    const durationMs = hrTimeToMs(span.endTime) - hrTimeToMs(span.startTime);
    if (durationMs < MIN_DURATION_MS) {
      skippedCount++;
      skippedTotalMs += durationMs;
      // Also count all descendants as skipped
      const countDescendants = (spanId) => {
        const kids = childrenOf.get(spanId) || [];
        for (const kid of kids) {
          skippedCount++;
          skippedTotalMs += hrTimeToMs(kid.endTime) - hrTimeToMs(kid.startTime);
          countDescendants(kid.spanContext().spanId);
        }
      };
      countDescendants(span.spanContext().spanId);
    } else {
      visibleSpans.push(span);
    }
  }

  // Group green Vite plugin spans by name+hook
  const renderItems = groupViteSpans(visibleSpans, childrenOf);

  for (let i = 0; i < renderItems.length; i++) {
    const item = renderItems[i];
    const isLast = i === renderItems.length - 1 && skippedCount === 0;
    const connector = isLast ? "└─" : "├─";
    const childPrefix = isLast ? "  " : "│ ";

    if (item.type === "group") {
      // Collapsed Vite plugin group
      const bar = timingBar(item.totalMs, maxMs);
      const dur = formatDuration(item.totalMs);
      const barStr = bar ? " " + bar : "";
      const countStr = colors.dim(` ×${item.count}`);

      lines.push(
        `${colors.dim(prefix + connector)} ${colors.white(item.name)}${countStr}${barStr} ${dur}`
      );
      continue;
    }

    // Individual span
    const span = item.span;
    const children = childrenOf.get(span.spanContext().spanId) || [];
    const durationMs = hrTimeToMs(span.endTime) - hrTimeToMs(span.startTime);
    const name = span.name;
    const detail = inlineDetail(name, span.attributes || {});

    const hasError = span.status?.code === 2;
    const nameStr = hasError ? colors.red(name) : colors.white(name);
    const errorSuffix =
      hasError && span.status?.message
        ? " " + colors.red(colors.dim(span.status.message))
        : "";

    const bar = timingBar(durationMs, maxMs);
    const dur = formatDuration(durationMs);
    const barStr = bar ? " " + bar : "";

    lines.push(
      `${colors.dim(prefix + connector)} ${nameStr}${detail}${errorSuffix}${barStr} ${dur}`
    );

    if (children.length > 0) {
      lines.push(
        ...renderTree(children, childrenOf, maxMs, prefix + childPrefix)
      );
    }
  }

  // Summary line for all collapsed (sub-threshold) spans
  if (skippedCount > 0) {
    const connector = "└─";
    const summary = colors.dim(
      `${skippedCount} span${skippedCount > 1 ? "s" : ""} (<${MIN_DURATION_MS}ms)`
    );
    lines.push(`${colors.dim(prefix + connector)} ${summary}`);
  }

  return lines;
}

// ── Exporter ──────────────────────────────────────────────────────────

/**
 * Dev console span exporter.
 *
 * Buffers spans by traceId for a short window, then renders the full
 * trace as a tree. This is needed because SimpleSpanProcessor exports
 * one span at a time as each span ends.
 */
export class DevConsoleSpanExporter {
  constructor(options = {}) {
    this._stopped = false;
    this._buffer = new Map(); // traceId → { spans[], timer, hasRoot }
    this._maxWait = options.maxWait ?? 5000;
  }

  export(spans, resultCallback) {
    if (this._stopped) {
      resultCallback({ code: 1 });
      return;
    }

    for (const span of spans) {
      const traceId = span.spanContext().traceId;
      if (!this._buffer.has(traceId)) {
        this._buffer.set(traceId, { spans: [], timer: null, hasRoot: false });
      }
      const entry = this._buffer.get(traceId);
      entry.spans.push(span);

      // A span without a parent is the root — the trace is complete
      if (!span.parentSpanContext?.spanId) {
        entry.hasRoot = true;
      }

      if (entry.hasRoot) {
        // Root arrived — flush immediately
        if (entry.timer) clearTimeout(entry.timer);
        // Use a microtask so any remaining spans from the same tick arrive first
        entry.timer = setTimeout(() => this._flush(traceId), 5);
      } else if (!entry.timer) {
        // Safety timeout — flush even if root never arrives
        entry.timer = setTimeout(() => this._flush(traceId), this._maxWait);
      }
    }

    resultCallback({ code: 0 });
  }

  _flush(traceId) {
    const entry = this._buffer.get(traceId);
    if (!entry) return;
    this._buffer.delete(traceId);
    this._render(entry.spans);
  }

  _render(spans) {
    if (spans.length === 0) return;

    const { roots, childrenOf } = buildTree(spans);

    for (const root of roots) {
      const rootId = root.spanContext().spanId;
      const rootDuration =
        hrTimeToMs(root.endTime) - hrTimeToMs(root.startTime);
      const children = childrenOf.get(rootId) || [];
      const attrs = root.attributes || {};

      // Skip standalone Vite spans (module resolution, transforms, etc.)
      // They are only useful as children of an HTTP request trace.
      if (root.name.startsWith("Vite ")) {
        continue;
      }

      // Skip other non-HTTP root spans that are below threshold
      if (
        !root.name.startsWith("HTTP") &&
        root.name !== "HTTP Request" &&
        rootDuration < MIN_DURATION_MS
      ) {
        continue;
      }

      // ── Header line ──
      if (root.name.startsWith("HTTP") || root.name === "HTTP Request") {
        const method = attrs["http.method"] || "???";
        const target = attrs["http.target"] || attrs["http.url"] || "/";
        const statusCode = attrs["http.status_code"];
        const colorFn = methodColor(method);

        const parts = [
          colorFn(colors.bold(method)),
          colors.white(target),
          statusCode != null ? statusBadge(statusCode) : null,
          formatDuration(rootDuration),
        ].filter(Boolean);

        console.log(`\n  ${parts.join("  ")}`);
      } else {
        // Non-HTTP root span
        console.log(
          `\n  ${colors.white(colors.bold(root.name))}  ${formatDuration(rootDuration)}`
        );
      }

      // ── Child tree ──
      if (children.length > 0) {
        const lines = renderTree(children, childrenOf, rootDuration, "  ");
        for (const line of lines) {
          console.log(line);
        }
      }
    }
  }

  shutdown() {
    for (const [, entry] of this._buffer) {
      if (entry.timer) clearTimeout(entry.timer);
      this._render(entry.spans);
    }
    this._buffer.clear();
    this._stopped = true;
    return Promise.resolve();
  }

  forceFlush() {
    for (const [, entry] of this._buffer) {
      if (entry.timer) clearTimeout(entry.timer);
      this._render(entry.spans);
    }
    this._buffer.clear();
    return Promise.resolve();
  }
}
