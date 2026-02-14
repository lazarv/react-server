import * as sys from "../sys.mjs";

export function collectStylesheets(rootModule, manifestEnv) {
  if (!rootModule) return [];
  const normalizedRootModule = sys.normalizePath(rootModule);
  const rootManifest = Array.from(Object.values(manifestEnv)).find(
    (entry) =>
      normalizedRootModule.endsWith(entry.file) ||
      entry.src?.endsWith(normalizedRootModule)
  );
  const styles = [];
  const visited = new Set();
  function collectCss(entry) {
    if (!entry || visited.has(entry.file)) return styles;
    visited.add(entry.file);
    if (entry.css) {
      styles.unshift(...entry.css.map((href) => `/${href}`));
    }
    if (entry.imports) {
      entry.imports.forEach((imported) => collectCss(manifestEnv[imported]));
    }
  }
  collectCss(rootManifest);
  return styles;
}

export function collectClientModules(rootModule, manifest) {
  if (!rootModule) return [];
  const normalizedRootModule = sys.normalizePath(rootModule);
  const rootManifest = Array.from(Object.values(manifest.server)).find(
    (entry) =>
      normalizedRootModule.endsWith(entry.file) ||
      entry.src?.endsWith(normalizedRootModule)
  );
  const modules = [];
  const visited = new Set();
  function collectModules(mod) {
    if (!mod || visited.has(mod.file)) return modules;
    visited.add(mod.file);
    if (mod.imports) {
      mod.imports.forEach((imported) =>
        collectModules(manifest.server[imported])
      );
    }
    const clientModule = Object.values(manifest.browser).find(
      (entry) => entry.name === `client/${mod.name}`
    );
    if (clientModule) {
      modules.push(`/${clientModule.file}`);
    }
  }
  collectModules(rootManifest);
  return modules;
}
