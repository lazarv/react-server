import { join, relative } from "node:path";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export function manifestRegistry() {
  return {
    name: "react-server:manifest-registry",
    buildStart() {
      this.emitFile({
        type: "chunk",
        id: ".react-server/manifest-registry",
        name: "manifest-registry",
      });
      this.emitFile({
        type: "chunk",
        id: ".react-server/client/manifest-registry",
        name: "client/manifest-registry",
      });
    },
    resolveId(id) {
      if (
        id === ".react-server/manifest-registry" ||
        id === ".react-server/client/manifest-registry"
      ) {
        return id;
      }
    },
    load(id) {
      if (
        id === ".react-server/manifest-registry" ||
        id === ".react-server/client/manifest-registry"
      ) {
        return `const registry = new Map();
function registerClientReference(id, exports, importer) {
  if (registry.has(id)) {
    throw new Error(\`Duplicate client reference registration for \${id}\`);
  }
  registry.set(id, { exports, importer });
}
function registerServerReference(id, exports, importer) {
  if (registry.has(id)) {
    throw new Error(\`Duplicate server reference registration for \${id}\`);
  }
  registry.set(id, { exports, importer });
}
export { registry, registerClientReference, registerServerReference };`;
      }
    },
  };
}

export function manifestGenerator(
  clientManifest,
  serverManifest,
  type = "rsc"
) {
  // SSR uses client/manifest-registry path to keep it separate from RSC's manifest-registry
  const registryPath =
    type === "ssr"
      ? ".react-server/client/manifest-registry"
      : ".react-server/manifest-registry";
  return {
    name: "react-server:manifest-generator",
    resolveId(id) {
      if (
        id.startsWith("virtual:rsc:react-client-reference:") ||
        id.startsWith("virtual:rsc:react-server-reference:") ||
        id.startsWith("virtual:ssr:react-client-reference:") ||
        id.startsWith("virtual:ssr:react-server-reference:")
      ) {
        return id;
      }
    },
    load(id) {
      if (
        id.startsWith("virtual:rsc:react-client-reference:") ||
        id.startsWith("virtual:ssr:react-client-reference:")
      ) {
        const refId = id.replace(
          /virtual:(rsc|ssr):react-client-reference:/,
          ""
        );
        const entry = Array.from(clientManifest.values()).find(
          (e) => e.id === refId
        );
        if (entry) {
          const exportsList = entry.exports
            .map((name) => (name === "default" ? `default: _default` : name))
            .join(", ");
          // refId is already the package specifier for node_modules (set during RSC discovery)
          // or the file path for local files
          return `import { registerClientReference } from "${registryPath}";
registerClientReference("${sys.normalizePath(relative(cwd, refId))}", ${JSON.stringify(entry.exports)}, async () => { const { ${exportsList} } = await import("${sys.normalizePath(refId)}"); return { ${exportsList} }; });`;
        } else {
          return ``;
        }
      } else if (
        id.startsWith("virtual:rsc:react-server-reference:") ||
        id.startsWith("virtual:ssr:react-server-reference:")
      ) {
        const isInline = id.includes(":inline:");
        const refId = id.replace(
          /virtual:(rsc|ssr):react-server-reference(:inline)?:/,
          ""
        );
        const entry = Array.from(serverManifest.values()).find(
          (e) => e.id === refId
        );
        if (entry) {
          // Use absolute path for inline server actions to ensure rolldown resolves
          // to the same module instance as the root entry (prevents state duplication)
          const importPath = sys.normalizePath(
            isInline ? join(cwd, refId) : refId
          );
          return `import { registerServerReference } from "${registryPath}";
    registerServerReference("${sys.normalizePath(relative(cwd, refId))}", ${JSON.stringify(entry.exports)}, async () => { const { ${entry.exports.map((name) => (name === "default" ? `default: _default` : name)).join(", ")} } = await import("${importPath}"); return { ${entry.exports.map((name) => (name === "default" ? `default: _default` : name)).join(", ")} }; });`;
        } else {
          return ``;
        }
      }
    },
  };
}
