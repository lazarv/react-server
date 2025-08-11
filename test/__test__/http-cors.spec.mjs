import { createServer } from "node:http";

import { compose, cors } from "@lazarv/react-server/http";
import { describe, expect, it } from "vitest";

function makeServer(handler) {
  const server = createServer(async (req, res) => {
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers,
    });
    const ctx = { request, url: new URL(request.url) };
    const response =
      (await handler(ctx)) || new Response(null, { status: 404 });
    res.statusCode = response.status;
    for (const [k, v] of response.headers.entries()) res.setHeader(k, v ?? "");
    // Ensure we flush a body if present
    const body = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    res.end(Buffer.from(body));
  }).listen(0);
  const { port } = server.address();
  return { server, port };
}

describe("@lazarv/react-server/http CORS", () => {
  it("sets wildcard allow-origin by default on simple request", async () => {
    const handler = compose([cors(), async () => new Response("ok")]);
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(200);
      expect(r.headers.get("access-control-allow-origin")).toBe("*");
      expect(r.headers.get("access-control-allow-credentials")).toBeNull();
      expect(r.headers.get("access-control-expose-headers")).toBeNull();
      expect(await r.text()).toBe("ok");
    } finally {
      server.close();
    }
  });

  it("echoes origin and sets credentials when configured (simple request)", async () => {
    const handler = compose([
      cors({ origin: true, credentials: true }),
      async () => new Response("ok"),
    ]);
    const { server, port } = makeServer(handler);
    try {
      const origin = "http://example.com";
      const r = await fetch(`http://localhost:${port}/`, {
        headers: { Origin: origin },
      });
      expect(r.headers.get("access-control-allow-origin")).toBe(origin);
      expect(r.headers.get("access-control-allow-credentials")).toBe("true");
    } finally {
      server.close();
    }
  });

  it("handles preflight OPTIONS with defaults", async () => {
    const handler = compose([cors({ origin: true })]);
    const { server, port } = makeServer(handler);
    try {
      const origin = "https://foo.bar";
      const r = await fetch(`http://localhost:${port}/preflight`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "X-Custom-Header",
        },
      });
      expect(r.status).toBe(204);
      expect(r.headers.get("access-control-allow-origin")).toBe(origin);
      expect(r.headers.get("access-control-allow-methods")).toBe(
        "GET,HEAD,PUT,PATCH,POST,DELETE"
      );
      expect(r.headers.get("access-control-allow-headers")).toBe(
        "X-Custom-Header"
      );
      expect(await r.text()).toBe("");
    } finally {
      server.close();
    }
  });

  it("preflight reflects custom headers/methods, maxAge and exposeHeaders", async () => {
    const handler = compose([
      cors({
        origin: (ctx) => ctx.request.headers.get("origin"),
        allowMethods: "GET,POST",
        allowHeaders: "Content-Type,X-Custom",
        maxAge: 600,
        exposeHeaders: "X-Token",
        credentials: true,
      }),
    ]);
    const { server, port } = makeServer(handler);
    try {
      const origin = "https://bar.baz";
      const r = await fetch(`http://localhost:${port}/preflight`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(r.status).toBe(204);
      expect(r.headers.get("access-control-allow-origin")).toBe(origin);
      expect(r.headers.get("access-control-allow-methods")).toBe("GET,POST");
      expect(r.headers.get("access-control-allow-headers")).toBe(
        "Content-Type,X-Custom"
      );
      expect(r.headers.get("access-control-allow-credentials")).toBe("true");
      expect(r.headers.get("access-control-max-age")).toBe("600");
      // Implementation sets expose-headers on preflight too
      expect(r.headers.get("access-control-expose-headers")).toBe("X-Token");
    } finally {
      server.close();
    }
  });

  it("adds expose-headers on simple response when configured", async () => {
    const handler = compose([
      cors({ exposeHeaders: "X-Token" }),
      async () => new Response("ok", { headers: { "X-Token": "abc" } }),
    ]);
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.headers.get("access-control-expose-headers")).toBe("X-Token");
      expect(await r.text()).toBe("ok");
    } finally {
      server.close();
    }
  });

  it("OPTIONS without preflight header falls through with 404 and CORS headers", async () => {
    const handler = compose([cors({ origin: true })]);
    const { server, port } = makeServer(handler);
    try {
      const origin = "https://no-preflight.test";
      const r = await fetch(`http://localhost:${port}/`, {
        method: "OPTIONS",
        headers: { Origin: origin },
      });
      expect(r.status).toBe(404);
      expect(r.headers.get("access-control-allow-origin")).toBe(origin);
    } finally {
      server.close();
    }
  });
});
