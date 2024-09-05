import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/;

export function tryStatSync(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export function loadPackageData(pkgPath) {
  const pkgData = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkgData;
}

const packagePathCache = new Map();
export function findPackageRoot(basedir) {
  const directoryStack = [basedir];
  while (basedir) {
    if (packagePathCache.has(basedir)) {
      return packagePathCache.get(basedir);
    }
    const pkgPath = join(basedir, "package.json");
    if (tryStatSync(pkgPath)?.isFile()) {
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
    const nextBasedir = dirname(basedir);
    if (nextBasedir === basedir || nextBasedir === cwd) break;
    basedir = nextBasedir;
  }
  return null;
}

const packageCache = new Map();
export function findNearestPackageData(basedir) {
  const directoryStack = [basedir];
  while (basedir) {
    if (packageCache.has(basedir)) {
      return packageCache.get(basedir);
    }
    const pkgPath = join(basedir, "package.json");
    if (tryStatSync(pkgPath)?.isFile()) {
      try {
        const pkgData = loadPackageData(pkgPath);
        const pkgRoot = dirname(pkgPath);
        while (directoryStack.length > 0) {
          const dir = directoryStack.pop();
          packageCache.set(dir, pkgData);
          packagePathCache.set(dir, pkgRoot);
        }
        return pkgData;
      } catch {
        // noop
      }
    }
    const nextBasedir = dirname(basedir);
    if (nextBasedir === basedir || nextBasedir === cwd) break;
    basedir = nextBasedir;
  }
  return null;
}

const packageTypeCache = new Map();
export function isModule(filePath) {
  if (packageTypeCache.has(filePath)) {
    return packageTypeCache.get(filePath);
  } else if (/\.m[jt]s$/.test(filePath)) {
    return true;
  } else if (/\.c[jt]s$/.test(filePath)) {
    return false;
  } else {
    // check package.json for type: "module"
    try {
      const pkg = findNearestPackageData(dirname(filePath));
      const isModule = pkg?.type === "module" || pkg?.module;
      packageTypeCache.set(filePath, isModule);
      return isModule;
    } catch (e) {
      return false;
    }
  }
}

const clientComponentsCache = new Map();
export function hasClientComponents(filePath) {
  const root = findPackageRoot(filePath);
  if (clientComponentsCache.has(root)) {
    return clientComponentsCache.get(root);
  }

  function searchForUseClient(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
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
