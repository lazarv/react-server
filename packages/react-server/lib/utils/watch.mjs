import { dirname, isAbsolute, relative } from "node:path";

import { watch as chokidarWatch } from "chokidar";
import micromatch from "micromatch";

import * as sys from "../sys.mjs";

const GLOB_RE = /[*?[\]{}()]/;

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function isNegated(pattern) {
  return typeof pattern === "string" && pattern.startsWith("!");
}

function stripNegation(pattern) {
  return isNegated(pattern) ? pattern.slice(1) : pattern;
}

function hasGlob(pattern) {
  return typeof pattern === "string" && GLOB_RE.test(stripNegation(pattern));
}

function normalizePath(path) {
  return sys.normalizePath(path)?.replace(/^\.\//, "") || ".";
}

function toRelativePath(path, cwd) {
  if (cwd && isAbsolute(path)) {
    return normalizePath(relative(cwd, path));
  }
  return normalizePath(path);
}

function globRoot(pattern) {
  pattern = normalizePath(stripNegation(pattern));

  if (!hasGlob(pattern)) {
    return normalizePath(dirname(pattern));
  }

  const segments = pattern.split("/");
  const root = [];
  for (const segment of segments) {
    if (GLOB_RE.test(segment)) break;
    root.push(segment);
  }

  return normalizePath(root.join("/") || ".");
}

function compactRoots(roots) {
  const sorted = Array.from(new Set(roots)).toSorted((a, b) => a.length - b.length);
  const compacted = [];

  for (const root of sorted) {
    if (
      !compacted.some(
        (parent) =>
          parent === "." || root === parent || root.startsWith(`${parent}/`)
      )
    ) {
      compacted.push(root);
    }
  }

  return compacted;
}

function inNodeModules(path) {
  return path === "node_modules" || path.includes("/node_modules/");
}

function createGlobMatcher(patterns, cwd) {
  const positive = patterns
    .filter((pattern) => typeof pattern === "string" && !isNegated(pattern))
    .map(normalizePath);
  const negative = patterns
    .filter(isNegated)
    .map((pattern) => normalizePath(stripNegation(pattern)));

  const options = { cwd, dot: true };

  return (path) => {
    const rel = toRelativePath(path, cwd);
    if (inNodeModules(rel)) return false;
    return (
      micromatch.isMatch(rel, positive, options) &&
      !micromatch.isMatch(rel, negative, options)
    );
  };
}

function filterEvents(watcher, matches) {
  const on = watcher.on.bind(watcher);
  watcher.on = (event, listener) => {
    if (["add", "change", "unlink"].includes(event)) {
      return on(event, (path, ...args) => {
        if (matches(path)) {
          listener.call(watcher, path, ...args);
        }
      });
    }

    if (event === "all") {
      return on(event, (name, path, ...args) => {
        if (name.endsWith("Dir") || matches(path)) {
          listener.call(watcher, name, path, ...args);
        }
      });
    }

    return on(event, listener);
  };
  return watcher;
}

export function watch(paths, options = {}) {
  const patterns = toArray(paths);
  const useGlobCompat = patterns.some(
    (pattern) => isNegated(pattern) || hasGlob(pattern)
  );

  if (!useGlobCompat) {
    return chokidarWatch(paths, options);
  }

  const positive = patterns.filter(
    (pattern) => typeof pattern === "string" && !isNegated(pattern)
  );
  const roots = compactRoots(positive.map(globRoot));
  const matches = createGlobMatcher(patterns, options.cwd);
  const ignored = toArray(options.ignored ?? []);

  const watcher = chokidarWatch(roots, {
    ...options,
    ignored: [
      ...ignored,
      (path, stats) => {
        const rel = toRelativePath(path, options.cwd);
        if (inNodeModules(rel)) return true;
        if (stats?.isDirectory()) return false;
        return stats ? !matches(path) : false;
      },
    ],
  });

  return filterEvents(watcher, matches);
}
