import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/;

export function tryStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export function loadPackageData(pkgPath) {
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
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
      const root = findPackageRoot(dir, isRoot);
      const pkg = findNearestPackageData(dir, isRoot);
      const isModule =
        pkg?.type === "module" ||
        (pkg?.module && !relative(root, filePath).startsWith("../")); //join(root, pkg?.module) === filePath);
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

const clientComponentsCache = new Map();
export function hasClientComponents(filePath) {
  if (!filePath) return false;

  const root = findPackageRoot(filePath);

  if (!root) return false;

  if (clientComponentsCache.has(root)) {
    return clientComponentsCache.get(root);
  }

  function searchForUseClient(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const fileStat = statSync(filePath);
      if (fileStat.isDirectory()) {
        if (searchForUseClient(filePath)) {
          return true;
        }
      } else if (/\.(js|jsx|ts|tsx|mjs|mts)$/.test(file)) {
        const content = readFileSync(filePath, "utf8");
        if (
          content.includes(`"use client"`) ||
          content.includes(`'use client'`)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  const result = searchForUseClient(root);
  clientComponentsCache.set(root, result);
  return result;
}

const serverActionCache = new Map();
export function hasServerAction(filePath) {
  if (!filePath) return false;

  if (serverActionCache.has(filePath)) {
    return serverActionCache.get(filePath);
  }

  try {
    if (!tryStat(filePath)) {
      return false;
    }
    const content = readFileSync(filePath, "utf8");
    if (content.includes(`"use server"`) || content.includes(`'use server'`)) {
      serverActionCache.set(filePath, true);
      return true;
    }
  } catch {
    // no use server
  }
  return false;
}
