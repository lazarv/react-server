import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

let serverPromise = null;

export default {
  async fetch(request, env, ctx) {
    try {
      // Try static assets first
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.ok) {
          return assetResponse;
        }
      }

      if (!serverPromise) {
        serverPromise = reactServer({
          origin:
            env.ORIGIN ||
            `${new URL(request.url).protocol}//${new URL(request.url).host}`,
          // Use "." because we're already inside the .react-server directory structure
          // (base_dir in wrangler.toml points to .cloudflare/worker/.react-server)
          outDir: ".",
        });
      }

      const { handler } = await serverPromise;

      const origin =
        env.ORIGIN ||
        `${new URL(request.url).protocol}//${new URL(request.url).host}`;
      const httpContext = createContext(request, {
        origin,
        runtime: "cloudflare",
        platformExtras: { env, ctx },
      });

      const response = await handler(httpContext);

      if (!response) {
        return new Response("Not Found", { status: 404 });
      }

      // Add set-cookie headers
      if (httpContext._setCookies?.length) {
        const headers = new Headers(response.headers);
        for (const c of httpContext._setCookies) {
          headers.append("set-cookie", c);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    } catch (e) {
      return new Response(e.message || "Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
};
