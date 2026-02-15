import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

let serverPromise = null;

export default async (request, context) => {
  try {
    if (!serverPromise) {
      serverPromise = reactServer({
        origin:
          process.env.ORIGIN ||
          process.env.URL ||
          `${new URL(request.url).protocol}//${new URL(request.url).host}`,
        outDir: "../",
      });
    }

    const { handler } = await serverPromise;

    const origin =
      process.env.ORIGIN ||
      process.env.URL ||
      `${new URL(request.url).protocol}//${new URL(request.url).host}`;
    const httpContext = createContext(request, {
      origin,
      runtime: "netlify",
      platformExtras: { context },
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
    console.error(e);
    return new Response(e.message || "Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
};

export const config = {
  path: "/*",
  preferStatic: true,
};
