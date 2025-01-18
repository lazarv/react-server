import { useRender, useUrl } from "@lazarv/react-server";
import { style, remoteStyle } from "./error-styles.mjs";

export default async function GlobalError({ error }) {
  const url = useUrl();
  const { isRemote } = useRender();

  if (import.meta.env.DEV) {
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
        <h1>
          {error.digest && error.digest !== error.message
            ? error.digest
            : error.message || "Global Error"}
        </h1>
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
        <h1>
          {error.digest && error.digest !== error.message
            ? error.digest
            : error.message || "Global Error"}
        </h1>
        <pre>
          {import.meta.env.DEV
            ? error.stack
            : "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."}
        </pre>
        <a href={url.toString()}>
          <button>Retry</button>
        </a>
        {import.meta.env.DEV && (
          <>
            <script type="module" src="/@vite/client"></script>
            <script type="module" src="/@hmr"></script>
            <script type="module">
              {`import {ErrorOverlay} from "/@vite/client";document.body.appendChild(new ErrorOverlay(${JSON.stringify(error).replace(/</g, "\\u003c")}))`}
            </script>
          </>
        )}
      </body>
    </html>
  );
}
