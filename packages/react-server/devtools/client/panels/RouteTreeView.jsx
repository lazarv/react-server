"use client";

import { useState, useMemo } from "react";

// Types that match as a prefix (active for all child paths)
const PREFIX_TYPES = new Set(["layout", "middleware", "template"]);

/**
 * Match a pathname against a file-router route pattern.
 * Supports: static segments, [param], [[optional]], [...catchAll], [[...optionalCatchAll]]
 *
 * When `prefix` is true (used for layouts and middlewares), the pattern only
 * needs to match a prefix of the pathname — extra trailing segments are allowed.
 */
function matchRoute(pattern, pathname, prefix = false) {
  if (!pattern || !pathname) return false;
  if (pattern === pathname) return true;
  // Root pattern "/" is a prefix of everything
  if (prefix && (pattern === "/" || pattern === "")) return true;

  const routeSegments = pattern.replace(/^\/|\/$/g, "").split("/");
  const pathSegments = pathname.replace(/^\/|\/$/g, "").split("/");

  let ri = 0;
  let pi = 0;
  while (ri < routeSegments.length) {
    const seg = routeSegments[ri];
    // Catch-all: [...param] or [[...param]]
    if (/^\[\[?\.\.\./.test(seg)) {
      return true;
    }
    // Optional param: [[param]]
    if (seg.startsWith("[[") && seg.endsWith("]]")) {
      if (pi < pathSegments.length) pi++;
      ri++;
      continue;
    }
    // Required param: [param]
    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (pi >= pathSegments.length) return false;
      pi++;
      ri++;
      continue;
    }
    // Static segment
    if (pi >= pathSegments.length || seg !== pathSegments[pi]) return false;
    pi++;
    ri++;
  }
  // Exact match: all path segments consumed. Prefix match: all route segments consumed.
  return prefix ? true : pi === pathSegments.length;
}

const TYPE_CLASSES = {
  page: "indigo",
  layout: "violet",
  middleware: "amber",
  api: "green",
  error: "red",
  loading: "cyan",
  fallback: "teal",
  template: "pink",
  outlet: "orange",
};

function Tag({ color, children }) {
  return <span className={`dt-tag dt-tag-${color}`}>{children}</span>;
}

// Brand icons for file extensions
const ICON_REACT = (
  <svg width="16" height="16" viewBox="-11.5 -10.232 23 20.463">
    <circle r="2.05" fill="#61dafb" />
    <g stroke="#61dafb" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);

const ICON_JS = (
  <svg width="16" height="16" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="16" fill="#f7df1e" />
    <path
      d="M67.312 213.932l19.59-11.856c3.78 6.701 7.218 12.371 15.465 12.371 7.905 0 12.89-3.092 12.89-15.12v-81.798h24.057v82.138c0 24.917-14.606 36.259-35.916 36.259-19.245 0-30.416-9.967-36.087-21.996m85.07-2.576l19.588-11.341c5.157 8.421 11.859 14.607 23.715 14.607 9.969 0 16.325-4.984 16.325-11.858 0-8.248-6.53-11.17-17.528-15.98l-6.013-2.58c-17.357-7.387-28.87-16.667-28.87-36.257 0-18.044 13.747-31.792 35.228-31.792 15.294 0 26.292 5.328 34.196 19.247l-18.732 12.03c-4.125-7.389-8.591-10.31-15.465-10.31-7.046 0-11.514 4.468-11.514 10.31 0 7.217 4.468 10.14 14.778 14.608l6.014 2.577c20.45 8.765 31.963 17.7 31.963 37.804 0 21.654-17.012 33.51-39.867 33.51-22.339 0-36.774-10.654-43.819-24.574"
      fill="#000"
    />
  </svg>
);

const ICON_TS = (
  <svg width="16" height="16" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="16" fill="#3178c6" />
    <path
      d="M150.518 200.475v27.62c4.492 2.302 9.805 4.028 15.938 5.179 6.133 1.151 12.597 1.726 19.393 1.726 6.622 0 12.914-.633 18.874-1.899 5.96-1.266 11.187-3.352 15.678-6.257 4.492-2.906 8.048-6.796 10.669-11.672 2.62-4.876 3.931-10.997 3.931-18.363 0-5.239-.837-9.787-2.511-13.643a31.886 31.886 0 00-7.106-10.465c-3.056-3.028-6.707-5.72-10.951-8.078-4.245-2.357-8.956-4.617-14.133-6.78-3.795-1.554-7.178-3.06-10.148-4.52-2.971-1.459-5.502-2.978-7.594-4.556-2.091-1.578-3.699-3.323-4.823-5.235-1.124-1.912-1.686-4.134-1.686-6.665 0-2.341.502-4.404 1.506-6.188a13.387 13.387 0 014.161-4.556c1.758-1.217 3.855-2.147 6.289-2.789 2.434-.643 5.094-.964 7.981-.964 2.118 0 4.33.173 6.636.52 2.306.346 4.612.895 6.918 1.648 2.306.752 4.492 1.699 6.559 2.84a28.895 28.895 0 015.768 3.955v-25.767a63.95 63.95 0 00-13.075-3.955 76.92 76.92 0 00-15.856-1.554c-6.57 0-12.783.693-18.638 2.078-5.855 1.386-10.995 3.591-15.418 6.617-4.424 3.025-7.929 6.943-10.519 11.753-2.589 4.81-3.884 10.62-3.884 17.43 0 9.05 2.62 16.627 7.862 22.733 5.241 6.105 13.007 11.09 23.298 14.956 4.187 1.602 8.05 3.157 11.59 4.664 3.54 1.507 6.6 3.109 9.178 4.808 2.579 1.698 4.6 3.603 6.066 5.714 1.465 2.112 2.198 4.556 2.198 7.331 0 2.152-.467 4.086-1.398 5.803-.932 1.717-2.326 3.18-4.183 4.389-1.857 1.21-4.148 2.138-6.872 2.783-2.725.645-5.831.968-9.32.968-6.142 0-12.21-1.205-18.205-3.615-5.994-2.41-11.378-5.975-16.15-10.694zm-54.89-81.127h30.882v-22.427h-87.318v22.427h30.469v87.293h25.967v-87.293z"
      fill="#fff"
    />
  </svg>
);

const ICON_MDX = (
  <svg width="16" height="16" viewBox="0 0 512 211">
    <rect width="512" height="211" rx="16" fill="#fcb32c" />
    <path
      d="M74 176V90l42 42 42-42v86h28V36l-70 70-70-70v140h28zm226-60l-56-56v40H216v32h28v40l56-56zm78-80v140h28V90l42 42 42-42v86h28V36l-70 70-70-70z"
      fill="#fff"
    />
  </svg>
);

const ICON_MD = (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <rect width="16" height="16" rx="3" fill="#083fa1" />
    <path
      d="M2.5 11V5h1.8l1.7 2.6L7.7 5h1.8v6H7.7V7.8L6 10.2 4.3 7.8V11H2.5zm9 0L9 8.2h1.7V5h1.6v3.2H14L11.5 11z"
      fill="#fff"
    />
  </svg>
);

const ICON_CSS = (
  <svg width="16" height="16" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="16" fill="#264de4" />
    <path
      d="M56 24l16.6 186.2L127.7 232l55.3-21.8L199.6 24H56zm118.7 44.4l-1.7 19.4-1 11.4-.2 2.6H96.2l2.6 29.2h72l-1 10.7-3.6 40.5-.2 2.4-37.9 10.5h-.1l-38-10.5-2.6-29.2h28.7l1.3 14.8 10.7 2.9 10.7-2.9 1.1-12.4.3-3.4 1-11.1.2-2.4H86.9l-6.8-76.1-.3-3.3h97z"
      fill="#fff"
    />
  </svg>
);

const ICON_JSON = (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <rect width="16" height="16" rx="3" fill="#292929" />
    <path
      d="M5.5 3C4.7 3 4 3.5 4 4.5v2c0 .5-.4 1-1 1v1c.6 0 1 .5 1 1v2c0 1 .7 1.5 1.5 1.5"
      stroke="#f7df1e"
      strokeWidth="1.2"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M10.5 3c.8 0 1.5.5 1.5 1.5v2c0 .5.4 1 1 1v1c-.6 0-1 .5-1 1v2c0 1-.7 1.5-1.5 1.5"
      stroke="#f7df1e"
      strokeWidth="1.2"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const ICON_FILE = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const EXT_ICON_MAP = {
  jsx: ICON_REACT,
  tsx: ICON_REACT,
  js: ICON_JS,
  mjs: ICON_JS,
  ts: ICON_TS,
  mts: ICON_TS,
  mdx: ICON_MDX,
  md: ICON_MD,
  css: ICON_CSS,
  json: ICON_JSON,
};

function ExtIcon({ ext }) {
  const key = ext?.toLowerCase();
  const icon = key ? EXT_ICON_MAP[key] : null;
  return (
    <span
      className={`dt-route-ext-icon${icon ? "" : " dt-route-ext-icon-generic"}`}
      title={ext ? `.${ext}` : "unknown"}
    >
      {icon || ICON_FILE}
    </span>
  );
}

function relativeSrc(src, cwd) {
  if (!src) return "";
  if (cwd && src.startsWith(cwd)) {
    return src.slice(cwd.length).replace(/^\/+/, "");
  }
  // Fallback: show from src/ onwards, or last 2 segments
  const srcIdx = src.lastIndexOf("/src/");
  if (srcIdx !== -1) return src.slice(srcIdx + 1);
  const parts = src.split("/");
  return parts.slice(-2).join("/");
}

function RouteRow({ entry, cwd, active }) {
  const colorClass = TYPE_CLASSES[entry.type] ?? "gray";
  const rel = relativeSrc(entry.src, cwd);

  return (
    <div className={`dt-route-row${active ? " dt-route-row-active" : ""}`}>
      <div className="dt-route-path">{entry.path || "/"}</div>
      <div className="dt-badges" style={{ marginTop: 0, gap: 4 }}>
        <Tag color={colorClass}>
          {entry.type === "outlet" ? `@${entry.outlet}` : entry.type}
        </Tag>
        {entry.method && <Tag color="sky">{entry.method}</Tag>}
      </div>
      <ExtIcon ext={entry.ext || entry.src?.split(".").pop()} />
      {entry.src ? (
        <a
          className="dt-route-src dt-route-src-link"
          href={`vscode://file${entry.src}`}
          title={entry.src}
        >
          {rel}
        </a>
      ) : (
        <span className="dt-route-src" />
      )}
    </div>
  );
}

export default function RouteTreeView({
  manifest,
  filter: controlledFilter,
  onFilterChange,
  typeFilter: controlledTypeFilter,
  onTypeFilterChange,
  serverPathname,
}) {
  const [localFilter, setLocalFilter] = useState("");
  const [localTypeFilter, setLocalTypeFilter] = useState("all");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const filter = controlledFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const typeFilter = controlledTypeFilter ?? localTypeFilter;
  const setTypeFilter = onTypeFilterChange ?? setLocalTypeFilter;

  if (!manifest) {
    return null;
  }

  const {
    pages = [],
    middlewares = [],
    routes: apiRoutes = [],
    cwd = "",
  } = manifest;

  // Merge all route types into a single list
  const allRoutes = useMemo(() => {
    const mw = middlewares.map((m) => ({
      path: m.path,
      type: "middleware",
      ext: m.ext,
      src: m.src,
    }));
    const api = apiRoutes.map((r) => ({
      path: r.path,
      type: "api",
      method: r.method,
      ext: r.ext,
      src: r.src,
    }));
    return [...mw, ...api, ...pages];
  }, [pages, middlewares, apiRoutes]);

  // Compute which routes are active based on the server pathname
  // (reflects rewrites, not the client-visible URL)
  const activeSet = useMemo(() => {
    const set = new Set();
    if (!serverPathname) return set;
    for (let i = 0; i < allRoutes.length; i++) {
      const r = allRoutes[i];
      const prefix = PREFIX_TYPES.has(r.type);
      if (matchRoute(r.path, serverPathname, prefix)) set.add(i);
    }
    return set;
  }, [allRoutes, serverPathname]);

  const filtered = useMemo(() => {
    let result = allRoutes.map((r, i) => ({ ...r, _idx: i }));
    if (showActiveOnly) {
      result = result.filter((r) => activeSet.has(r._idx));
    }
    if (typeFilter !== "all") {
      result = result.filter((p) => p.type === typeFilter);
    }
    if (filter) {
      const f = filter.toLowerCase();
      result = result.filter(
        (p) =>
          p.path?.toLowerCase().includes(f) ||
          p.src?.toLowerCase().includes(f) ||
          p.outlet?.toLowerCase().includes(f) ||
          p.method?.toLowerCase().includes(f)
      );
    }
    return result;
  }, [allRoutes, activeSet, showActiveOnly, filter, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const r of allRoutes) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return counts;
  }, [allRoutes]);

  const types = Object.keys(typeCounts).toSorted();

  return (
    <div className="dt-flex-col">
      <div className="dt-filters">
        <input
          type="text"
          placeholder="Filter routes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="dt-input"
        />
        <div className="dt-type-filters">
          <button
            className="dt-type-filter-btn"
            data-active={showActiveOnly}
            onClick={() => setShowActiveOnly((prev) => !prev)}
            title="Show only active routes"
          >
            active <span className="dt-tag dt-tag-green">{activeSet.size}</span>
          </button>
          <button
            className="dt-type-filter-btn"
            data-active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          >
            all <span className="dt-tag dt-tag-gray">{allRoutes.length}</span>
          </button>
          {types.map((t) => (
            <button
              key={t}
              className="dt-type-filter-btn"
              data-active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {t}{" "}
              <span className={`dt-tag dt-tag-${TYPE_CLASSES[t] || "gray"}`}>
                {typeCounts[t]}
              </span>
            </button>
          ))}
        </div>
        <span className="dt-filter-info">
          {filtered.length} of {allRoutes.length} routes
        </span>
      </div>

      <div className="dt-route-table">
        <div className="dt-route-header">
          <span>Route</span>
          <span>Type</span>
          <span></span>
          <span>Source</span>
        </div>
        {filtered.map((entry, i) => (
          <RouteRow
            key={i}
            entry={entry}
            cwd={cwd}
            active={activeSet.has(entry._idx)}
          />
        ))}
      </div>
    </div>
  );
}
