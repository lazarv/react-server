import { createHash } from "node:crypto";
import * as sys from "../sys.mjs";

const hydrationIslandInlineModules = new Map();
const hydrationIslandClientImports = new Map();

function injectCapturedParams(fnSource, targetFn, capturedVars) {
  const capturedList = capturedVars.join(", ");

  if (targetFn.params.length === 0) {
    const openParen = fnSource.indexOf("(");
    const closeParen = fnSource.indexOf(")", openParen);
    if (openParen !== -1 && closeParen !== -1) {
      fnSource =
        fnSource.slice(0, openParen + 1) +
        "{ " +
        capturedList +
        " }" +
        fnSource.slice(closeParen);
    }
  } else if (targetFn.params.length === 1) {
    const param = targetFn.params[0];
    const relStart = param.start - targetFn.start;
    const relEnd = param.end - targetFn.start;
    if (param.type === "Identifier") {
      fnSource =
        fnSource.slice(0, relStart) +
        "{ " +
        capturedList +
        ", ..." +
        param.name +
        " }" +
        fnSource.slice(relEnd);
    } else if (param.type === "ObjectPattern") {
      fnSource =
        fnSource.slice(0, relStart + 1) +
        " " +
        capturedList +
        "," +
        fnSource.slice(relStart + 1);
    }
  }

  return fnSource;
}

function parseHydrateDirective(directive) {
  const [head, ...tail] = directive.split(";");
  const type = head.split(":")[1]?.trim() || "load";
  const params = {};

  for (const part of tail) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      params[trimmed] = true;
    } else {
      params[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }

  if (params.interactive && type === "load") {
    delete params.interactive;
    return { type: "interaction", params };
  }

  return { type, params };
}

function stripQuery(id) {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

function moduleKeys(id) {
  const normalized = sys.normalizePath(stripQuery(String(id)));
  const keys = new Set([normalized]);
  const cwd = sys.normalizePath(sys.cwd());
  if (normalized.startsWith(`${cwd}/`)) {
    keys.add(normalized.slice(cwd.length + 1));
  }
  if (normalized.startsWith("/")) {
    keys.add(normalized.slice(1));
  }
  return keys;
}

function isDeferredHydrationStrategy(type) {
  return type !== "load";
}

function importStoreForRoot(rootId) {
  const rootKeys = moduleKeys(rootId);
  let store = null;
  for (const key of rootKeys) {
    store = hydrationIslandClientImports.get(key);
    if (store) break;
  }
  if (!store) {
    store = {
      deferred: new Set(),
      eager: new Set(),
    };
  }
  for (const key of rootKeys) {
    hydrationIslandClientImports.set(key, store);
  }
  return store;
}

function clearImportStoreForRoot(rootId) {
  const rootKeys = moduleKeys(rootId);
  let store = null;
  for (const key of rootKeys) {
    store = hydrationIslandClientImports.get(key);
    if (store) break;
  }
  if (!store) return;
  for (const [key, value] of hydrationIslandClientImports) {
    if (value === store) {
      hydrationIslandClientImports.delete(key);
    }
  }
}

function addImport(store, sourceId, type) {
  for (const key of moduleKeys(sourceId)) {
    store[type].add(key);
  }
}

export function getHydrationIslandInlineModule(id) {
  return hydrationIslandInlineModules.get(id);
}

export function shouldSkipHydrationIslandClientModule(rootModule, moduleId) {
  const rootKeys = moduleKeys(rootModule);
  let store = null;
  for (const key of rootKeys) {
    store = hydrationIslandClientImports.get(key);
    if (store) break;
  }
  if (!store) return false;

  for (const key of moduleKeys(moduleId)) {
    if (store.eager.has(key)) return false;
  }
  for (const key of moduleKeys(moduleId)) {
    if (store.deferred.has(key)) return true;
  }
  return false;
}

function sanitizeId(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^([^a-zA-Z_])/, "_$1");
}

function islandId(inlineId, directive, fnName) {
  const { params } = parseHydrateDirective(directive);
  if (params.id) return sanitizeId(params.id);
  const hash = createHash("md5")
    .update(`${inlineId}:${directive}:${fnName}`)
    .digest("hex")
    .slice(0, 12);
  return `hydrate_${hash}`;
}

export const useHydrateInlineConfig = {
  directive: "use hydrate",
  queryKey: "use-hydrate-inline",
  matchDirective(directive) {
    return directive === "use hydrate" || directive.startsWith("use hydrate:");
  },
  skipIfModuleDirective: null,
  injectCapturedParams,
  clearExtractions({ id }) {
    clearImportStoreForRoot(id);
  },
  async recordExtraction({ id, inlineId, directive, importSources }) {
    const { type } = parseHydrateDirective(directive);
    const deferred = isDeferredHydrationStrategy(type);
    hydrationIslandInlineModules.set(inlineId, {
      strategy: { type },
      deferred,
    });

    const store = importStoreForRoot(id);
    const target = deferred ? "deferred" : "eager";
    for (const source of importSources) {
      if (!source.removed) continue;
      let resolved = null;
      try {
        resolved = await this.resolve(source.source, stripQuery(id), {
          skipSelf: true,
        });
      } catch {
        // Ignore unresolved imports. The normal resolver reports real errors.
      }
      addImport(store, resolved?.id ?? source.source, target);
    }
  },
  buildCallSiteReplacement(importName, inlineId, capturedVars, context) {
    const { directive, fnName } = context;
    const id = islandId(inlineId, directive, fnName);
    const { type, params } = parseHydrateDirective(directive);
    delete params.id;
    const createElementName = `${importName}_createElement`;
    const islandName = `${importName}_Island`;

    const propsExpression =
      capturedVars.length > 0
        ? `{ ...(__props ?? {}), ${capturedVars.join(", ")} }`
        : `(__props ?? {})`;

    return {
      replacement:
        `(__props) => ${createElementName}(${islandName}, ` +
        `{ Component: ${importName}, id: ${JSON.stringify(id)}, ` +
        `outlet: ${JSON.stringify(id)}, strategy: ${JSON.stringify({
          type,
          ...params,
        })}, props: ${propsExpression} })`,
      prependImport:
        `import { createElement as ${createElementName} } from "react";\n` +
        `import { HydrationIsland as ${islandName} } from "@lazarv/react-server/server/hydration-island.jsx";\n` +
        `import ${importName} from "${inlineId}";`,
    };
  },
};
