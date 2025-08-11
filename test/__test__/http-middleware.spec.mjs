import { createServer } from "node:http";

import { createMiddleware } from "@lazarv/react-server/http";
import { describe, expect, it } from "vitest";

function makeServer(handler, options = {}, nextFactory) {
  const mw = createMiddleware(handler, options);
  const server = createServer((req, res) => {
    const next = nextFactory ? nextFactory(req, res) : undefined;
    mw(req, res, next);
  }).listen(0);
  const { port } = server.address();
  return { server, port };
}

describe("@lazarv/react-server/http middleware", () => {
  it("uses direct connection info when trustProxy is false", async () => {
    const handler = async (ctx) =>
      new Response(JSON.stringify({ protocol: ctx.protocol, host: ctx.host }), {
        headers: { "content-type": "application/json" },
      });
    const { server, port } = makeServer(handler, { trustProxy: false });
    try {
      const r = await fetch(`http://localhost:${port}/`);
      const data = await r.json();
      expect(data.protocol).toBe("http");
      expect(data.host).toContain(`localhost:${port}`);
    } finally {
      server.close();
    }
  });

  it("honors x-forwarded-* headers when trustProxy is true", async () => {
    const handler = async (ctx) =>
      new Response(
        JSON.stringify({ protocol: ctx.protocol, host: ctx.host, ip: ctx.ip }),
        { headers: { "content-type": "application/json" } }
      );
    const { server, port } = makeServer(handler, { trustProxy: true });
    try {
      const r = await fetch(`http://localhost:${port}/`, {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "203.0.113.9",
        },
      });
      const data = await r.json();
      expect(data.protocol).toBe("https");
      expect(data.host).toBe("example.com");
      expect(data.ip).toBe("203.0.113.9");
    } finally {
      server.close();
    }
  });

  it("returns 404 Response when defaultNotFound=true and no next is provided", async () => {
    const handler = async () => undefined;
    const { server, port } = makeServer(handler, { defaultNotFound: true });
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("Not Found");
    } finally {
      server.close();
    }
  });

  it("writes 404 directly when defaultNotFound=false and no next is provided", async () => {
    const handler = async () => undefined;
    const { server, port } = makeServer(handler, { defaultNotFound: false });
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("Not Found");
    } finally {
      server.close();
    }
  });

  it("delegates to next() when middleware returns undefined and next is provided", async () => {
    const handler = async () => undefined;
    const { server, port } = makeServer(handler, {}, (_req, res) => () => {
      res.statusCode = 204;
      res.end();
    });
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(204);
      expect(await r.text()).toBe("");
    } finally {
      server.close();
    }
  });

  it("passes errors to next(err) when the handler throws", async () => {
    const handler = async () => {
      throw new Error("boom");
    };
    const { server, port } = makeServer(handler, {}, (_req, res) => (err) => {
      res.statusCode = err ? 555 : 200;
      res.end(err ? "from-next" : "ok");
    });
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(555);
      expect(await r.text()).toBe("from-next");
    } finally {
      server.close();
    }
  });

  it("sets cookies via ctx.setCookie", async () => {
    const handler = async (ctx) => {
      ctx.setCookie("cookie-name", "cookie-value");
      return new Response("ok");
    };
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(r.status).toBe(200);
      expect(r.headers.get("set-cookie")).toContain("cookie-name=cookie-value");
      expect(await r.text()).toBe("ok");
    } finally {
      server.close();
    }
  });

  it("omits body on HEAD requests", async () => {
    const handler = async () => new Response("has-body");
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/`, { method: "HEAD" });
      expect(r.status).toBe(200);
      expect(await r.text()).toBe("");
    } finally {
      server.close();
    }
  });

  it("streams response body using Web Streams", async () => {
    const handler = async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("a"));
          controller.enqueue(new TextEncoder().encode("b"));
          controller.enqueue(new TextEncoder().encode("c"));
          controller.close();
        },
      });
      return new Response(stream);
    };
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/`);
      expect(await r.text()).toBe("abc");
    } finally {
      server.close();
    }
  });

  it("supports POST body consumption in handler", async () => {
    const handler = async (ctx) => {
      const body = await ctx.request.text();
      return new Response(body, { headers: { "content-type": "text/plain" } });
    };
    const { server, port } = makeServer(handler);
    try {
      const r = await fetch(`http://localhost:${port}/echo`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      });
      expect(await r.text()).toBe("hello");
    } finally {
      server.close();
    }
  });
});
