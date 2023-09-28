import strip from "strip-ansi";

import packageJson from "../../package.json" assert { type: "json" };
import { getContext } from "../../server/context.mjs";
import {
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";

function cleanStack(stack) {
  return stack
    .split(/\n/g)
    .filter((l) => /^\s*at/.test(l))
    .map((l) => l.trim())
    .join("\n");
}

export function prepareError(err) {
  try {
    if (!err.id) {
      const viteDevServer = getContext(SERVER_CONTEXT);
      viteDevServer.ssrFixStacktrace(err);
      const [id, line, column] =
        err.stack
          .split("\n")[1]
          .match(/\((.*:[0-9]+:[0-9]+)\)/)?.[1]
          .split(":") ?? [];

      if (viteDevServer.moduleGraph.idToModuleMap.has(id)) {
        const {
          ssrTransformResult: { map },
        } = viteDevServer.moduleGraph.getModuleById(id);

        err.id = id;
        if (!err.loc) {
          err.loc = {
            file: id,
            column: parseInt(column, 10),
            line: parseInt(line, 10),
            length: 0,
            lineText: "",
            namespace: "",
            suggestion: "",
          };
        }

        if (!err.frame) {
          const lines = map.sourcesContent[0].split("\n");
          const start = Math.max(0, err.loc.line - 3);
          const end = Math.min(lines.length, err.loc.line + 3);
          const frame = lines
            .slice(start, end)
            .flatMap((l, i) => {
              const curr = i + start;
              const indent = " ".repeat(
                Math.max(start, end).toString().length - curr.toString().length
              );
              return [
                `${indent}${curr} | ${l}`,
                ...(i === 2
                  ? [
                      `${indent}${curr
                        .toString()
                        .replaceAll(/./g, " ")} |${" ".repeat(
                        err.loc.column
                      )}^`,
                    ]
                  : []),
              ];
            })
            .join("\n");
          err.frame = `${err.message}\n${frame}\n`;
        }
      }

      err.plugin = err.plugin || packageJson.name;
    }
  } catch (e) {
    console.error(e);
  }
  return {
    message: strip(err.message),
    stack: strip(cleanStack(err.stack || "")),
    id: err.id,
    frame: strip(err.frame || ""),
    plugin: err.plugin,
    pluginCode: err.pluginCode?.toString(),
    loc: err.loc,
  };
}

function plainResponse(e) {
  const httpStatus = getContext(HTTP_STATUS) ?? {
    status: 500,
    statusText: "Internal Server Error",
  };
  return new Response(e?.stack ?? null, {
    ...httpStatus,
    headers: {
      "Content-Type": "text/plain",
      ...(getContext(HTTP_HEADERS) ?? {}),
    },
  });
}

export default async function errorHandler(err) {
  try {
    const server = getContext(SERVER_CONTEXT);
    // TODO: is there a better way to check if this is a vite dev server?
    if (typeof server?.ssrFixStacktrace !== "function") {
      return plainResponse(err);
    }

    const accept = getContext(HTTP_CONTEXT)?.request?.headers?.get?.("accept");
    if (accept?.includes?.(";standalone")) {
      return plainResponse(err);
    }

    const httpStatus = getContext(HTTP_STATUS) ?? {
      status: 500,
      statusText: "Internal Server Error",
    };

    return new Response(
      `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Error</title>
        <script type="module">
          import { ErrorOverlay } from '/@vite/client'
          document.body.appendChild(new ErrorOverlay(${JSON.stringify(
            await prepareError(err)
          ).replace(/</g, "\\u003c")}))
        </script>
      </head>
      <body>
      </body>
    </html>`,
      {
        ...httpStatus,
        headers: {
          "Content-Type": "text/html",
          ...(getContext(HTTP_HEADERS) ?? {}),
        },
      }
    );
  } catch (e) {
    return plainResponse(e);
  }
}
