import { createRequire } from "node:module";

import { useRender, useUrl } from "@lazarv/react-server";
import hljs from "react-server-highlight.js";
import "react-server-highlight.js/styles/github-dark.min.css";

import { style, remoteStyle } from "./error-styles.mjs";
import { prepareError } from "../lib/handlers/error.mjs";
import { forRoot } from "../config";

const _require = createRequire(import.meta.url);

export default async function GlobalError({ error }) {
  const url = useUrl();
  const { isRemote } = useRender();

  if (import.meta.env.DEV) {
    error = await prepareError(error);
    const [{ getContext }, { SERVER_CONTEXT }] = await Promise.all([
      import("@lazarv/react-server/server/context.mjs"),
      import("@lazarv/react-server/server/symbols.mjs"),
    ]);
    const viteDevServer = getContext(SERVER_CONTEXT);
    if (viteDevServer) {
      try {
        viteDevServer.environments.client.moduleGraph.invalidateAll();
        viteDevServer.environments.ssr.moduleGraph.invalidateAll();
        viteDevServer.environments.rsc.moduleGraph.invalidateAll();
      } catch {
        // ignore
      }
    }
  }

  if (isRemote) {
    return (
      <div className="react-server-global-error">
        <style>{remoteStyle}</style>
        <h1>{error.message || "Global Error"}</h1>
        {error.digest && error.digest !== error.message ? (
          <p>{error.digest}</p>
        ) : null}
        {error.frame ? (
          <pre className="react-server-global-error-frame">
            <code>{error.frame.trim()}</code>
          </pre>
        ) : null}
        <pre>
          {import.meta.env.DEV
            ? error.stack
            : "An error occurred. Please try again later."}
        </pre>
      </div>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Global Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <style>{style}</style>
      </head>
      <body suppressHydrationWarning className="react-server-global-error">
        <h1>{error.message || "Global Error"}</h1>
        {error.digest && error.digest !== error.message ? (
          <p
            dangerouslySetInnerHTML={{
              __html: error.digest.replace(/`([^`]+)`/g, "<code>$1</code>"),
            }}
          />
        ) : null}
        {error.code ? (
          <details>
            <summary></summary>
            <pre className="react-server-global-error-code">
              <code
                className="hljs"
                dangerouslySetInnerHTML={{
                  // __html: `<pre>${error.code.trim()}</pre>`,
                  __html: hljs.highlight(error.code, { language: "javascript" })
                    .value,
                }}
              />
              <div
                className="react-server-global-error-loc"
                style={{ "--line": error.loc.line }}
              />
            </pre>
          </details>
        ) : error.frame ? (
          <pre className="react-server-global-error-frame">
            <code>{error.frame.trim()}</code>
          </pre>
        ) : null}
        <pre>
          {import.meta.env.DEV
            ? error.stack
            : "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."}
        </pre>
        <a href={url.toString()}>
          <button>Retry</button>
        </a>
        {import.meta.env.DEV && forRoot()?.overlay !== false && (
          <>
            <script type="module" src="/@vite/client"></script>
            <script type="module" src="/@hmr"></script>
            <script type="module">
              {`import {showErrorOverlay} from "/@fs${_require.resolve("@lazarv/react-server/client/error-overlay.mjs")}";showErrorOverlay(${JSON.stringify(error).replace(/</g, "\\u003c")});`}
            </script>
          </>
        )}
      </body>
    </html>
  );
}
