import { createServer } from "node:http";

import { compose, cors } from "@lazarv/react-server/http";
import { describe, expect, it } from "vitest";

function makeApp() {
  return compose([
    cors(),
    async () => new Response("hello", { headers: { "x-test": "1" } }),
  ]);
}

describe("@lazarv/react-server/http smoke", () => {
  it("responds with hello", async () => {
    const handler = makeApp();
    const server = createServer(async (req, res) => {
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
      });
      const ctx = { request, url: new URL(request.url) };
      const response = await handler(ctx);
      res.statusCode = response.status;
      for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
      const body = await response.text();
      res.end(body);
    }).listen(0);

    const { port } = server.address();
    const r = await fetch(`http://localhost:${port}/`);
    const text = await r.text();
    expect(text).toBe("hello");
    expect(r.headers.get("x-test")).toBe("1");

    server.close();
  });

  it("falls through when middleware returns undefined and next handles the response", async () => {
    const handler = compose([
      async () => {
        // no return -> undefined, should call next()
      },
      async () => new Response("second"),
    ]);

    const request = new Request("http://localhost/");
    const ctx = { request, url: new URL(request.url) };
    const res = await handler(ctx);
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe("second");
  });

  it("returns undefined when no middleware returns a response (full fall-through)", async () => {
    const handler = compose([async () => {}, async () => {}]);

    const request = new Request("http://localhost/");
    const ctx = { request, url: new URL(request.url) };
    const res = await handler(ctx);
    expect(res).toBeUndefined();
  });

  it("propagates non-Response values unchanged and does not call next", async () => {
    let called = 0;
    const badValue = { ok: false, reason: "nope" };
    const handler = compose([
      async () => badValue, // not a Response; compose should return this as-is
      async () => {
        called += 1; // should not be called
        return new Response("should not reach");
      },
    ]);

    const request = new Request("http://localhost/");
    const ctx = { request, url: new URL(request.url) };
    const res = await handler(ctx);
    expect(called).toBe(0);
    expect(res).toBe(badValue);
  });
});
