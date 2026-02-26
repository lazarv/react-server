import { basename, extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { parse } from "../utils/ast.mjs";

const cwd = sys.cwd();

export default function useServer(env, options = {}) {
  const workerCode = new Map();
  return {
    name: "react-server:use-worker",
    resolveId: {
      filter: {
        id: [
          /virtual:react-server:worker::.+/,
          /virtual:react-server:webworker::.+/,
          /client\/worker-proxy.mjs\?workerModuleId=.*$/,
        ],
      },
      async handler(id) {
        if (
          id.startsWith("virtual:react-server:worker::") ||
          id.includes("virtual:react-server:webworker::") ||
          id.includes("client/worker-proxy.mjs?workerModuleId=")
        ) {
          return id;
        }
      },
    },
    load: {
      filter: {
        id: [
          /virtual:react-server:worker::.+/,
          /virtual:react-server:webworker::.+/,
          /client\/worker-proxy.mjs\?workerModuleId=.*$/,
        ],
      },
      async handler(id) {
        // console.log("load worker", { id });
        if (id.startsWith("virtual:react-server:worker::")) {
          const filename = id
            .replace("virtual:react-server:worker::", "")
            .replace(/\?.*$/, "");
          if (!workerCode.has(filename)) {
            throw new Error(`Worker module not found: ${id}`);
          }
          return workerCode.get(filename);
        } else if (/virtual:react-server:webworker::/.test(id)) {
          const filename = id.replace(/.*virtual:react-server:webworker::/, "");
          return `globalThis.__react_server_is_worker__ = true;
import * as mod from "virtual:react-server:worker::${relative(cwd, filename)}";
import { toStream, fromStream } from "@lazarv/react-server/rsc/browser";
self.addEventListener("message", async ({ data: { type, id, fn, args: argsStream } }) => {
  if (type !== "react-server:worker:invoke") return;

  try {
    const args = await fromStream(argsStream);
    let result = mod[fn](...args);
    if (result instanceof Promise) {
      result = await result;
    }
    if (result !== undefined) {
      const resultStream = await toStream(result);
      self.postMessage({ type: "react-server:worker:response", id, result: resultStream }, [resultStream]);
    } else {
      self.postMessage({ type: "react-server:worker:response", id, result: null });
    }
  } catch (e) {
    self.postMessage({ type: "react-server:worker:response", id, error: e.message });
  }
});`;
        } else if (
          (env === "client" ||
            (env !== "rsc" && this.environment.name !== "rsc")) &&
          id.includes("worker-proxy.mjs?workerModuleId=")
        ) {
          const req = id.replace(/\?workerModuleId=.*/, "");
          const { code } = await (typeof this.environment?.transformRequest ===
          "function"
            ? this.environment.transformRequest(req)
            : (async () => {
                const resolved = await this.resolve(req, "index.html", {
                  skipSelf: true,
                });
                // console.log("resolved worker proxy", { id, resolved });
                const loaded = await this.load(resolved);
                // console.log("loaded worker proxy", { id, loaded });
                return { code: loaded.code };
              })());
          // const code = `import createWorkerProxy from "@lazarv/react-server/client/worker-proxy.mjs"; console.log("importing worker proxy for", import.meta.WORKER_MODULE_ID); export default () => {};`;
          // console.log("transforming worker proxy", { id, code });
          const newCode = code.replace(
            /(?:import\.meta|_vite_importMeta)\.WORKER_MODULE_ID/g,
            `"virtual:react-server:webworker::${cwd}/${decodeURIComponent(id.split("workerModuleId=")[1])}"`
          );
          // console.log("transformed worker proxy", { id, newCode });
          return newCode;
        }
      },
    },
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        if (!code.includes("use worker")) return null;
        if (
          /virtual:react-server:worker::/.test(id) ||
          /\?worker_file/.test(id)
        )
          return null;

        const ast = await parse(code, id);

        const directives = ast.body
          .filter((node) => node.type === "ExpressionStatement")
          .map(({ directive }) => directive);

        if (!directives.includes("use worker")) return null;

        if (
          this.environment.mode !== "build" &&
          this.environment.name !== "rsc" &&
          this.environment.name !== "ssr" &&
          this.environment.name !== "client"
        ) {
          // console.log("use worker ignored in non-rsc/dev environment", {
          //   id,
          //   env: this.environment.name,
          //   mode: this.environment.mode,
          // });
          return code;
        }

        const exportDefault = ast.body.find(
          (node) => node.type === "ExportDefaultDeclaration"
        );
        const workerId = relative(cwd, id);
        const isServer = env === "rsc" || this.environment.name === "rsc";
        const isEdge = isServer && !!options.edge;

        let proxyCode;
        if (isEdge) {
          // Edge/serverless: in-process async execution (no node:worker_threads)
          proxyCode = `import createWorkerProxy from "@lazarv/react-server/server/worker-proxy-edge.mjs";
import * as __worker_mod__ from "virtual:react-server:worker::${workerId}";

const proxy = createWorkerProxy(__worker_mod__);
${ast.body
  .filter((node) => node.type === "ExportNamedDeclaration")
  .map(
    (node) =>
      `export const ${node.declaration.id.name} = proxy("${node.declaration.id.name}");`
  )
  .join("\n")}
${exportDefault ? `export default proxy("default");\n` : ""}`;
        } else {
          proxyCode = `import createWorkerProxy from "@lazarv/react-server/${isServer ? "server" : "client"}/worker-proxy.mjs?workerModuleId=${encodeURIComponent(workerId)}";

const proxy = createWorkerProxy("virtual:react-server:worker::${this.environment.mode === "build" ? workerId : id}", "${this.environment.mode === "build" ? "start" : "dev"}");
${ast.body
  .filter((node) => node.type === "ExportNamedDeclaration")
  .map(
    (node) =>
      `export const ${node.declaration.id.name} = proxy("${node.declaration.id.name}");`
  )
  .join("\n")}
${exportDefault ? `export default proxy("default");\n` : ""}`;
        }

        workerCode.set(id, code);
        workerCode.set(workerId, code);
        if (this.environment.mode === "build" && !isEdge) {
          // Only emit separate worker chunks for non-edge builds.
          // Edge builds import the worker module inline via the virtual module.
          this.emitFile({
            type: "chunk",
            id: `virtual:react-server:worker::${workerId}`,
            source: code,
            name: `server/__react_server_workers__/${basename(id, extname(id))}`,
            preserveSignature: "strict",
          });
        }

        return proxyCode;
      },
    },
  };
}
