import { readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ResolverFactory } from "oxc-resolver";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/;

// Shared file content cache (sync reads)
const fileContentCache = new Map();
export function readFileCached(filePath) {
  if (fileContentCache.has(filePath)) {
    return fileContentCache.get(filePath);
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    fileContentCache.set(filePath, content);
    return content;
  } catch {
    fileContentCache.set(filePath, null);
    return null;
  }
}

// Shared file content cache (async reads) - caches promises for concurrent read handling
const asyncFileContentCache = new Map();
export function readFileCachedAsync(filePath) {
  if (asyncFileContentCache.has(filePath)) {
    return asyncFileContentCache.get(filePath);
  }
  // Cache the promise itself so concurrent reads share the same in-flight request
  const promise = readFile(filePath, "utf-8").catch(() => null);
  asyncFileContentCache.set(filePath, promise);
  return promise;
}

// Invalidate file cache for a specific path (called on HMR updates)
export function invalidateFileCache(filePath) {
  fileContentCache.delete(filePath);
  asyncFileContentCache.delete(filePath);
  esmSyntaxCache.delete(filePath);
}

// Shared ESM syntax detection cache
const esmSyntaxCache = new Map();

// Client components cache - stores results for sync, promises for async
const clientComponentsCache = new Map();
const clientComponentsPromiseCache = new Map();

export function isESMSyntax(filePath, content = null) {
  if (esmSyntaxCache.has(filePath)) {
    return esmSyntaxCache.get(filePath);
  }

  // .mjs files are always ESM
  if (filePath.endsWith(".mjs")) {
    esmSyntaxCache.set(filePath, true);
    return true;
  }
  // .cjs files are always CJS
  if (filePath.endsWith(".cjs")) {
    esmSyntaxCache.set(filePath, false);
    return false;
  }

  // Check package.json type first
  if (isModule(filePath)) {
    esmSyntaxCache.set(filePath, true);
    return true;
  }

  // For .js files, check content for ESM syntax
  if (filePath.endsWith(".js")) {
    const fileContent = content ?? readFileCached(filePath);
    if (fileContent) {
      const result =
        /^\s*(import\s+|export\s+|export\s*\{|import\s*\{|import\s*\()/m.test(
          fileContent
        );
      esmSyntaxCache.set(filePath, result);
      return result;
    }
  }

  esmSyntaxCache.set(filePath, false);
  return false;
}

// Async version of ESM syntax detection
export async function isESMSyntaxAsync(filePath) {
  if (esmSyntaxCache.has(filePath)) {
    return esmSyntaxCache.get(filePath);
  }

  // .mjs files are always ESM
  if (filePath.endsWith(".mjs")) {
    esmSyntaxCache.set(filePath, true);
    return true;
  }
  // .cjs files are always CJS
  if (filePath.endsWith(".cjs")) {
    esmSyntaxCache.set(filePath, false);
    return false;
  }

  // Check package.json type first
  if (isModule(filePath)) {
    esmSyntaxCache.set(filePath, true);
    return true;
  }

  // For .js files, check content for ESM syntax
  if (filePath.endsWith(".js")) {
    const content = await readFileCachedAsync(filePath);
    if (content) {
      const result =
        /^\s*(import\s+|export\s+|export\s*\{|import\s*\{|import\s*\()/m.test(
          content
        );
      esmSyntaxCache.set(filePath, result);
      return result;
    }
  }

  esmSyntaxCache.set(filePath, false);
  return false;
}

export function tryStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export function loadPackageData(pkgPath) {
  const content = readFileCached(pkgPath);
  return content ? JSON.parse(content) : null;
}

const packagePathCache = new Map();
export function findPackageRoot(basedir, isRoot = false) {
  const directoryStack = [basedir];
  while (basedir) {
    if (packagePathCache.has(basedir)) {
      return packagePathCache.get(basedir);
    }
    const pkgPath = join(basedir, "package.json");
    const nextBasedir = dirname(basedir);
    if (
      tryStat(pkgPath) &&
      (!isRoot || (isRoot && nextBasedir.endsWith("node_modules")))
    ) {
      try {
        const pkgRoot = dirname(pkgPath);
        while (directoryStack.length > 0) {
          const dir = directoryStack.pop();
          packagePathCache.set(dir, pkgRoot);
        }
        return pkgRoot;
      } catch {
        // noop
      }
    }
    if (nextBasedir === basedir || nextBasedir === cwd) break;
    basedir = nextBasedir;
    directoryStack.push(basedir);
  }
  return null;
}

const packageCache = new Map();
export function findNearestPackageData(basedir, isRoot = false) {
  const directoryStack = [basedir];
  while (basedir) {
    if (packageCache.has(basedir)) {
      return packageCache.get(basedir);
    }
    const pkgPath = join(basedir, "package.json");
    if (tryStat(pkgPath)) {
      try {
        const pkgData = loadPackageData(pkgPath);
        if (!isRoot || (isRoot && pkgData.name)) {
          const pkgRoot = dirname(pkgPath);
          while (directoryStack.length > 0) {
            const dir = directoryStack.pop();
            packageCache.set(dir, pkgData);
            packagePathCache.set(dir, pkgRoot);
          }
          pkgData.__pkg_dir__ = pkgRoot;
          return pkgData;
        }
      } catch {
        // noop
      }
    }
    const nextBasedir = dirname(basedir);
    if (nextBasedir === basedir || nextBasedir === cwd) break;
    basedir = nextBasedir;
    directoryStack.push(basedir);
  }
  return null;
}

const packageTypeCache = new Map();
export function isModule(filePath, isRoot = false) {
  if (packageTypeCache.has(filePath)) {
    return packageTypeCache.get(filePath);
  } else if (/\.m[jt]s$/.test(filePath)) {
    return true;
  } else if (/\.c[jt]s$/.test(filePath)) {
    return false;
  } else {
    // check package.json for type: "module"
    try {
      const dir = dirname(
        filePath.startsWith("file://") ? fileURLToPath(filePath) : filePath
      );
      const pkg = findNearestPackageData(dir, isRoot);
      // Only use type: "module" to determine module type
      // The "module" field just indicates an ESM entry point exists,
      // not that all .js files in the package are ESM
      const isModule = pkg?.type === "module";
      packageTypeCache.set(filePath, isModule);
      return isModule;
    } catch {
      return false;
    }
  }
}

export function isRootModule(filePath) {
  return isModule(filePath, true);
}

export function hasClientComponents(filePath) {
  if (!filePath) return false;
  if (!/\.(js|jsx|ts|tsx|mjs|mts)$/.test(filePath)) return false;

  const content = readFileCached(filePath);
  return (
    content &&
    (content.includes(`"use client"`) || content.includes(`'use client'`))
  );
}

// Async version for parallel directory scanning
export async function hasClientComponentsAsync(pkgPath) {
  if (!pkgPath) return false;

  const root = findPackageRoot(pkgPath);

  if (!root) return false;

  // Check if we have a cached result already
  if (clientComponentsCache.has(root)) {
    return clientComponentsCache.get(root);
  }

  // Check if there's already a search in progress for this root
  if (clientComponentsPromiseCache.has(root)) {
    return clientComponentsPromiseCache.get(root);
  }

  async function searchForUseClient(dir) {
    try {
      const files = await readdir(dir);
      const checks = files.map(async (file) => {
        const fullPath = join(dir, file);
        try {
          const fileStat = await stat(fullPath);
          if (fileStat.isDirectory()) {
            return searchForUseClient(fullPath);
          } else if (/\.(js|jsx|ts|tsx|mjs|mts)$/.test(file)) {
            const content = await readFileCachedAsync(fullPath);
            if (
              content &&
              (content.includes(`"use client"`) ||
                content.includes(`'use client'`))
            ) {
              return true;
            }
          }
        } catch {
          // ignore file errors
        }
        return false;
      });
      const results = await Promise.all(checks);
      return results.some(Boolean);
    } catch {
      return false;
    }
  }

  // Create and cache the promise immediately to handle concurrent calls
  const searchPromise = searchForUseClient(root).then((result) => {
    // Cache the final result and clean up the promise cache
    clientComponentsCache.set(root, result);
    clientComponentsPromiseCache.delete(root);
    return result;
  });

  clientComponentsPromiseCache.set(root, searchPromise);

  return searchPromise;
}

function getExportSubpath(pkg, id) {
  if (!pkg?.name) return null;
  if (id === pkg.name) return ".";

  let idx = id.indexOf(pkg.name);
  if (idx === -1) return null;

  idx += pkg.name.length + 1;
  return "./" + id.slice(idx);
}

export function isSubpathExported(pkg, id) {
  if (pkg?.name === id || pkg?.exports?.[id]) return true;
  if (!pkg?.exports) return false;

  const rel = getExportSubpath(pkg, id);
  if (!rel) return false;

  for (const key of Object.keys(pkg.exports)) {
    if (key === rel) return true;
    if (key.includes("*")) {
      const prefix = key.split("*")[0];
      if (rel.startsWith(prefix)) return true;
    }
  }
  return false;
}

const resolve = new ResolverFactory({
  conditionNames: ["module", "import", "require", "node", "default"],
});
export function nodeResolve(specifier, importer) {
  try {
    if (bareImportRE.test(specifier)) {
      return (
        resolve.sync(
          /\.(?:m?[jt]sx?)|json$/.test(importer) ? dirname(importer) : importer,
          specifier
        ).path || specifier
      );
    }
    // For relative imports, resolve against the importer's directory
    if (specifier.startsWith(".") && importer) {
      const importerPath = importer.startsWith("file://")
        ? fileURLToPath(importer)
        : importer;
      const importerDir = dirname(importerPath);
      return join(importerDir, specifier);
    }
    return specifier;
  } catch {
    return specifier;
  }
}
