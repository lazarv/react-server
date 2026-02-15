import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

let serverPromise = null;

export default {
  async fetch(request, env, ctx) {
    try {
      if (!serverPromise) {
        serverPromise = reactServer({
          origin: `${new URL(request.url).protocol}//${new URL(request.url).host}`,
          outDir:
            (typeof process !== "undefined" &&
              process.env?.REACT_SERVER_EDGE_OUTDIR) ||
            ".",
        });
      }

      const { handler } = await serverPromise;

      const origin = `${new URL(request.url).protocol}//${new URL(request.url).host}`;
      const httpContext = createContext(request, {
        origin,
        runtime: "edge",
        platformExtras: { env, ctx },
      });

      const response = await handler(httpContext);

      if (!response) {
        return new Response("Not Found", { status: 404 });
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
