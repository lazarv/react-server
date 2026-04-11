"use client";

import { useMemo } from "react";

import { match } from "../../../lib/route-match.mjs";

const TYPE_CLASSES = {
  server: "indigo",
  client: "green",
  fallback: "teal",
};

function Tag({ color, children }) {
  return <span className={`dt-tag dt-tag-${color}`}>{children}</span>;
}

export default function ComponentRoutes({ routes, hostUrl, outlets }) {
  if (!routes || routes.length === 0) return null;

  const pathname = useMemo(() => {
    if (!hostUrl) return "";
    try {
      return new URL(hostUrl).pathname;
    } catch {
      return "";
    }
  }, [hostUrl]);

  // Map each outlet name to its current pathname for remote route matching.
  const outletPathnames = useMemo(() => {
    const map = new Map();
    if (!outlets) return map;
    for (const o of outlets) {
      if (o.remote && o.url && o.name) {
        try {
          // Outlet URL may be a full URL or a relative path after local navigation
          map.set(o.name, new URL(o.url, "http://localhost").pathname);
        } catch {
          /* invalid url */
        }
      }
    }
    return map;
  }, [outlets]);

  const activeMap = useMemo(() => {
    const map = new Map();

    // Resolve the effective pathname for a route (remote → outlet URL, else host)
    const pathFor = (route) => {
      if (route.remote && route.outlet)
        return outletPathnames.get(route.outlet);
      return pathname;
    };

    // First pass: match all non-fallback routes
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (route.type === "fallback") continue;
      const p = pathFor(route);
      if (p) {
        const params = match(route.path, p, { exact: route.exact });
        if (params) map.set(i, params);
      }
    }

    // Second pass: fallback routes — only active when no regular route matched
    // the same pathname, and no more-specific scoped fallback covers it
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (route.type !== "fallback") continue;
      const p = pathFor(route);
      if (!p) continue;

      // Check if the fallback pattern itself matches
      if (route.path && route.path !== "*" && !match(route.path, p)) continue;

      // If any non-fallback route already matched this pathname, skip
      let regularMatched = false;
      for (const [j] of map) {
        const other = routes[j];
        if (other.type === "fallback") continue;
        // Must be in the same scope (same outlet for remotes, or both non-remote)
        if (route.remote !== other.remote) continue;
        if (route.outlet !== other.outlet) continue;
        const op = pathFor(other);
        if (op === p) {
          regularMatched = true;
          break;
        }
      }
      if (regularMatched) continue;

      // Check if a more-specific scoped fallback covers this pathname
      const callerKey = route.path || "*";
      let superseded = false;
      for (let j = 0; j < routes.length; j++) {
        if (j === i) continue;
        const other = routes[j];
        if (other.type !== "fallback") continue;
        if (route.remote !== other.remote || route.outlet !== other.outlet)
          continue;
        const otherKey = other.path || "*";
        if (otherKey === "*" || otherKey === callerKey) continue;
        if (otherKey.length > callerKey.length && match(otherKey, p)) {
          superseded = true;
          break;
        }
      }
      if (superseded) continue;

      map.set(i, {});
    }

    return map;
  }, [routes, pathname, outletPathnames]);

  return (
    <div className="dt-section">
      <div className="dt-section-title">Component Routes ({routes.length})</div>
      <div className="dt-route-table">
        <div className="dt-comp-routes-header">
          <span>Route</span>
          <span>Type</span>
          <span>Flags</span>
        </div>
        {routes.map((route, i) => {
          const colorClass = TYPE_CLASSES[route.type] ?? "gray";
          const params = activeMap.get(i);
          const active = !!params;
          const paramEntries = params
            ? Object.entries(params).filter(([, v]) => v !== undefined)
            : [];
          return (
            <div
              key={i}
              className={`dt-comp-routes-row${active ? " dt-route-row-active" : ""}`}
            >
              <div className="dt-route-path">
                {route.path || "/"}
                {paramEntries.length > 0 && (
                  <code className="dt-route-params">
                    {`{ ${paramEntries.map(([k, v]) => `${k}: ${JSON.stringify(Array.isArray(v) ? v.join("/") : v)}`).join(", ")} }`}
                  </code>
                )}
              </div>
              <Tag color={colorClass}>{route.type}</Tag>
              <div className="dt-badges">
                {route.remote && <Tag color="violet">remote</Tag>}
                {route.exact && <Tag color="gray">exact</Tag>}
                {route.hasLoading && <Tag color="amber">loading</Tag>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
